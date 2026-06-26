import {
	AY_REGISTER_COUNT,
	ENVELOPE_SHAPE_REGISTER,
	envelopeShapeRegisterApplyMask,
	envelopePeriodRegisterApplyMask,
	registerApplyMask,
	registersChangedMask,
	sidVolumeLevel,
	timerPwmStepPeriod,
	toneRegisterApplyMask,
	volumeRegisterIndex,
	writeEnvelopePeriodToPsgData,
	writeTonePeriodToPsgData,
	type HardwareEnvFmState,
	type HardwareFmState,
	type HardwareSidState,
	type HardwareSyncBuzzerState,
	type SongCaptureFrame
} from './ay-export-utils';
import { computeEnvFmEnvelopePeriod, computeFmTonePeriod } from '../../chips/ay/instrument';
import { encodeEventList } from './tmr-event-list';
import {
	encodeEventPsgApplyMask,
	exportTimerFrequencyStoredFromYmPeriod,
	registerMaskFromEventPsgApplyMask,
	TMR_FRAME_SIZE,
	TMR_HEADER_SIZE,
	TMR_TIMER_EVENT_STOP,
	type TmrEventItemRecord
} from './tmr-format';

export {
	encodeEventPsgApplyMask,
	decodeTimerFrequencyHz,
	encodeTimerFrequencyHz,
	registerMaskFromEventPsgApplyMask,
	timerFrequencyHzToPeriodTicks,
	timerIndexFromEventPsgApplyMask,
	timerPeriodTicksToFrequencyHz,
	TMR_FRAME_SIZE,
	TMR_HEADER_SIZE,
	TMR_ITEM_SIZE,
	TMR_TIMER_EVENT_STOP,
	TMR_TIMER_FREQUENCY_SCALE,
	TMR_PSG_MASK_TIMER_BITS,
	type TmrEventItemRecord
} from './tmr-format';

export type TmrEncodeOptions = {
	chipFrequency: number;
	interruptFrequency: number;
	isYm?: boolean;
	chipIndex?: number;
};

function encodeExportTimerFrequencyHz(ymPeriod: number, options: TmrEncodeOptions): number {
	return exportTimerFrequencyStoredFromYmPeriod(ymPeriod, options.chipFrequency);
}

type WaveformChainState = {
	waveform: number[];
	waveformLoop: number;
};

type PwmTimerState = WaveformChainState & {
	pwm: boolean;
	period: number;
	periodLow: number;
};

function normalizePwmPeriods<T extends PwmTimerState>(state: T): T {
	return {
		...state,
		periodLow: state.periodLow > 0 ? state.periodLow : state.period
	};
}

function isPwmActive(state: PwmTimerState): boolean {
	const normalized = normalizePwmPeriods(state);
	return normalized.pwm || normalized.period !== normalized.periodLow;
}

function pwmDutyRatioFromPeriods(period: number, periodLow: number): number {
	const high = Math.max(1, period);
	const low = Math.max(1, periodLow);
	return high / (high + low);
}

function isPwmDutySweep(prev: PwmTimerState, next: PwmTimerState): boolean {
	if (!isPwmActive(next)) {
		return false;
	}
	const previous = normalizePwmPeriods(prev);
	const current = normalizePwmPeriods(next);
	if (previous.period === current.period && previous.periodLow === current.periodLow) {
		return false;
	}
	return pwmDutyRatioFromPeriods(previous.period, previous.periodLow) !==
		pwmDutyRatioFromPeriods(current.period, current.periodLow);
}

function pwmEventStepPeriod(state: PwmTimerState, stepIndex: number): number {
	const normalized = normalizePwmPeriods(state);
	if (isPwmActive(normalized) && normalized.waveform.length >= 2) {
		return stepIndex % 2 === 0 ? normalized.period : normalized.periodLow;
	}
	return normalized.period;
}

function previousWaveformStepIndex(stepIndex: number, state: WaveformChainState): number {
	if (stepIndex > 0) {
		return stepIndex - 1;
	}
	for (let index = state.waveform.length - 1; index >= 0; index--) {
		if (resolveNextWaveformIndex(index, state) === stepIndex) {
			return index;
		}
	}
	return state.waveform.length - 1;
}

function encodePwmEventTimerFrequency(
	stepIndex: number,
	state: PwmTimerState,
	options: TmrEncodeOptions
): number {
	const currentPeriod = pwmEventStepPeriod(state, stepIndex);
	const previousPeriod = pwmEventStepPeriod(state, previousWaveformStepIndex(stepIndex, state));
	if (currentPeriod === previousPeriod) {
		return 0;
	}
	return encodeExportTimerFrequencyHz(currentPeriod, options);
}

function sidStartPeriod(sid: HardwareSidState): number {
	return timerPwmStepPeriod(sid.waveform[0] ?? 0, sid.period, sid.periodLow);
}

export function isSidPwmDutySweep(prev: HardwareSidState, next: HardwareSidState): boolean {
	if (!prev.enabled || !next.enabled) {
		return false;
	}
	if (!sidWaveformConfigEqual(prev, next)) {
		return false;
	}
	return isPwmDutySweep(prev, next);
}

function sidEventStepPeriod(sid: HardwareSidState, stepIndex: number): number {
	return timerPwmStepPeriod(sid.waveform[stepIndex] ?? 0, sid.period, sid.periodLow);
}

export function encodeSidEventTimerFrequency(
	stepIndex: number,
	sid: HardwareSidState,
	options: TmrEncodeOptions
): number {
	const currentPeriod = sidEventStepPeriod(sid, stepIndex);
	const previousPeriod = sidEventStepPeriod(sid, previousWaveformStepIndex(stepIndex, sid));
	if (currentPeriod === previousPeriod) {
		return 0;
	}
	return encodeExportTimerFrequencyHz(currentPeriod, options);
}

export function encodeSyncBuzzerEventTimerFrequency(
	stepIndex: number,
	syncbuzzer: HardwareSyncBuzzerState,
	options: TmrEncodeOptions
): number {
	// A duty sync-buzzer skews its retrigger period per waveform step (high vs
	// low phase), exactly like FM/SID PWM. Without duty (period == periodLow)
	// every step resolves to the same period, so all but the entry inherit (0).
	return encodePwmEventTimerFrequency(stepIndex, syncbuzzer, options);
}

function syncBuzzerStartPeriod(syncbuzzer: HardwareSyncBuzzerState): number {
	return pwmEventStepPeriod(syncbuzzer, 0);
}

function fmStartPeriod(fm: HardwareFmState): number {
	return pwmEventStepPeriod(fm, 0);
}

function envFmStartPeriod(envFm: HardwareEnvFmState): number {
	return pwmEventStepPeriod(envFm, 0);
}

type StepRegisterWrite = { register: number; value: number };

type TimerEffectStepSource = {
	registerMask: number;
	length: number;
	loop: number;
	writesAtStep(stepIndex: number): StepRegisterWrite[];
	stepTimerFrequency(stepIndex: number): number;
};

type EffectChainStep = {
	sourceSteps: number[];
	nextIndex: number;
};

function sidStepSource(
	channelIndex: number,
	sid: HardwareSidState,
	options: TmrEncodeOptions
): TimerEffectStepSource {
	const volumeReg = volumeRegisterIndex(channelIndex);
	return {
		registerMask: registerApplyMask(volumeReg),
		length: sid.waveform.length,
		loop: sid.waveformLoop,
		writesAtStep: (stepIndex) => [
			{ register: volumeReg, value: sidVolumeLevel(sid.waveform[stepIndex]!, sid.baseVolume) }
		],
		stepTimerFrequency: (stepIndex) => encodeSidEventTimerFrequency(stepIndex, sid, options)
	};
}

function fmStepSource(
	channelIndex: number,
	fm: HardwareFmState,
	options: TmrEncodeOptions
): TimerEffectStepSource {
	const toneReg = channelIndex * 2;
	return {
		registerMask: toneRegisterApplyMask(channelIndex),
		length: fm.waveform.length,
		loop: fm.waveformLoop,
		writesAtStep: (stepIndex) => {
			const psgData = new Array(AY_REGISTER_COUNT).fill(0);
			const tonePeriod = computeFmTonePeriod(
				fm.baseTonePeriod,
				fm.waveform[stepIndex]!,
				fm.fmOffsetMode
			);
			writeTonePeriodToPsgData(psgData, channelIndex, tonePeriod);
			return [
				{ register: toneReg, value: psgData[toneReg]! },
				{ register: toneReg + 1, value: psgData[toneReg + 1]! }
			];
		},
		stepTimerFrequency: (stepIndex) => encodePwmEventTimerFrequency(stepIndex, fm, options)
	};
}

function envFmStepSource(
	_channelIndex: number,
	envFm: HardwareEnvFmState,
	options: TmrEncodeOptions
): TimerEffectStepSource {
	return {
		registerMask: envelopePeriodRegisterApplyMask(),
		length: envFm.waveform.length,
		loop: envFm.waveformLoop,
		writesAtStep: (stepIndex) => {
			const psgData = new Array(AY_REGISTER_COUNT).fill(0);
			const envelopePeriod = computeEnvFmEnvelopePeriod(
				envFm.baseEnvelopePeriod,
				envFm.waveform[stepIndex]!,
				envFm.fmOffsetMode
			);
			writeEnvelopePeriodToPsgData(psgData, envelopePeriod);
			return [
				{ register: 11, value: psgData[11]! },
				{ register: 12, value: psgData[12]! }
			];
		},
		stepTimerFrequency: (stepIndex) => encodePwmEventTimerFrequency(stepIndex, envFm, options)
	};
}

function syncBuzzerStepSource(
	_channelIndex: number,
	syncbuzzer: HardwareSyncBuzzerState,
	options: TmrEncodeOptions
): TimerEffectStepSource {
	return {
		registerMask: envelopeShapeRegisterApplyMask(),
		length: syncbuzzer.waveform.length,
		loop: syncbuzzer.waveformLoop,
		writesAtStep: (stepIndex) => [
			{ register: ENVELOPE_SHAPE_REGISTER, value: (syncbuzzer.waveform[stepIndex] ?? 0) & 0xf }
		],
		stepTimerFrequency: (stepIndex) =>
			encodeSyncBuzzerEventTimerFrequency(stepIndex, syncbuzzer, options)
	};
}

function sourceNextStepIndex(stepIndex: number, source: TimerEffectStepSource): number {
	return resolveNextWaveformIndex(stepIndex, {
		waveform: new Array(source.length),
		waveformLoop: source.loop
	});
}

function sourceStepStateKey(sourceSteps: number[]): string {
	return sourceSteps.join(',');
}

function buildEffectChainSteps(sources: TimerEffectStepSource[]): EffectChainStep[] {
	if (sources.some((source) => source.length <= 0)) {
		return [];
	}

	const steps: EffectChainStep[] = [];
	const indexByState = new Map<string, number>();
	let sourceSteps = sources.map(() => 0);

	while (true) {
		const key = sourceStepStateKey(sourceSteps);
		const existingIndex = indexByState.get(key);
		if (existingIndex !== undefined) {
			if (steps.length > 0) {
				steps[steps.length - 1]!.nextIndex = existingIndex;
			}
			break;
		}

		const stepIndex = steps.length;
		if (steps.length > 0) {
			steps[steps.length - 1]!.nextIndex = stepIndex;
		}

		indexByState.set(key, stepIndex);
		steps.push({ sourceSteps: [...sourceSteps], nextIndex: stepIndex });
		sourceSteps = sourceSteps.map((sourceStep, sourceIndex) =>
			sourceNextStepIndex(sourceStep, sources[sourceIndex]!)
		);
	}

	return steps;
}

function appendEffectStepSources(
	eventItems: EventItem[],
	channelIndex: number,
	sources: TimerEffectStepSource[]
): number {
	const startIndex = eventItems.length;
	const chainSteps = buildEffectChainSteps(sources);

	for (const chainStep of chainSteps) {
		const psgData = new Array(AY_REGISTER_COUNT).fill(0);
		let registerMask = 0;
		let timerFrequency = 0;

		for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
			const source = sources[sourceIndex]!;
			const sourceStep = chainStep.sourceSteps[sourceIndex]!;
			registerMask |= source.registerMask;
			for (const write of source.writesAtStep(sourceStep)) {
				psgData[write.register] = write.value;
			}
			const stepFrequency = source.stepTimerFrequency(sourceStep);
			if (timerFrequency === 0 && stepFrequency !== 0) {
				timerFrequency = stepFrequency;
			}
		}

		eventItems.push({
			psgData,
			psgMask: encodeEventPsgApplyMask(registerMask, channelIndex),
			timerFrequency,
			timerEventIndex: startIndex + chainStep.nextIndex
		});
	}

	return startIndex;
}

function appendSidEventChain(
	eventItems: EventItem[],
	channelIndex: number,
	sid: HardwareSidState,
	options: TmrEncodeOptions
): number {
	return appendEffectStepSources(eventItems, channelIndex, [
		sidStepSource(channelIndex, sid, options)
	]);
}

function appendFmEventChain(
	eventItems: EventItem[],
	channelIndex: number,
	fm: HardwareFmState,
	options: TmrEncodeOptions
): number {
	return appendEffectStepSources(eventItems, channelIndex, [
		fmStepSource(channelIndex, fm, options)
	]);
}

function appendEnvFmEventChain(
	eventItems: EventItem[],
	channelIndex: number,
	envFm: HardwareEnvFmState,
	options: TmrEncodeOptions
): number {
	return appendEffectStepSources(eventItems, channelIndex, [
		envFmStepSource(channelIndex, envFm, options)
	]);
}

type ChannelEffect = {
	source: TimerEffectStepSource;
	configKey: string;
	startPeriod: number;
	periodKey: string;
	timingKey: string;
};

function timerPeriodKey(state: PwmTimerState): string {
	return `${state.period}:${state.periodLow}`;
}

function eventChainHasTimerFrequencies(
	state: WaveformChainState,
	stepPeriod: (stepIndex: number) => number
): boolean {
	for (let stepIndex = 0; stepIndex < state.waveform.length; stepIndex++) {
		if (stepPeriod(stepIndex) !== stepPeriod(previousWaveformStepIndex(stepIndex, state))) {
			return true;
		}
	}
	return false;
}

function sidEventChainTimingKey(sid: HardwareSidState): string {
	return eventChainHasTimerFrequencies(sid, (stepIndex) => sidEventStepPeriod(sid, stepIndex))
		? timerPeriodKey(sid)
		: '';
}

function pwmEventChainTimingKey(state: PwmTimerState): string {
	return eventChainHasTimerFrequencies(state, (stepIndex) => pwmEventStepPeriod(state, stepIndex))
		? timerPeriodKey(state)
		: '';
}

function eventChainCacheKey(configKey: string, timingKey: string): string {
	return timingKey ? `${configKey}:timer:${timingKey}` : configKey;
}

function sidEventChainCacheKey(channelIndex: number, sid: HardwareSidState): string {
	return eventChainCacheKey(sidEventChainKey(channelIndex, sid), sidEventChainTimingKey(sid));
}

function syncBuzzerEventChainCacheKey(
	channelIndex: number,
	syncbuzzer: HardwareSyncBuzzerState
): string {
	return eventChainCacheKey(
		syncBuzzerEventChainKey(channelIndex, syncbuzzer),
		pwmEventChainTimingKey(syncbuzzer)
	);
}

function fmEventChainCacheKey(channelIndex: number, fm: HardwareFmState): string {
	return eventChainCacheKey(fmEventChainKey(channelIndex, fm), pwmEventChainTimingKey(fm));
}

function envFmEventChainCacheKey(channelIndex: number, envFm: HardwareEnvFmState): string {
	return eventChainCacheKey(envFmEventChainKey(channelIndex, envFm), pwmEventChainTimingKey(envFm));
}

function buildChannelEffects(
	channelIndex: number,
	states: {
		syncbuzzer: HardwareSyncBuzzerState;
		sid: HardwareSidState;
		fm: HardwareFmState;
		envFm: HardwareEnvFmState;
	},
	options: TmrEncodeOptions
): ChannelEffect[] {
	const effects: ChannelEffect[] = [];
	const { syncbuzzer, sid, fm, envFm } = states;
	if (syncbuzzer.enabled) {
		effects.push({
			source: syncBuzzerStepSource(channelIndex, syncbuzzer, options),
			configKey: syncBuzzerEventChainKey(channelIndex, syncbuzzer),
			startPeriod: syncBuzzerStartPeriod(syncbuzzer),
			periodKey: timerPeriodKey(syncbuzzer),
			timingKey: pwmEventChainTimingKey(syncbuzzer)
		});
	}
	if (sid.enabled) {
		effects.push({
			source: sidStepSource(channelIndex, sid, options),
			configKey: sidEventChainKey(channelIndex, sid),
			startPeriod: sidStartPeriod(sid),
			periodKey: timerPeriodKey(sid),
			timingKey: sidEventChainTimingKey(sid)
		});
	}
	if (fm.enabled) {
		effects.push({
			source: fmStepSource(channelIndex, fm, options),
			configKey: fmEventChainKey(channelIndex, fm),
			startPeriod: fmStartPeriod(fm),
			periodKey: timerPeriodKey(fm),
			timingKey: pwmEventChainTimingKey(fm)
		});
	}
	if (envFm.enabled) {
		effects.push({
			source: envFmStepSource(channelIndex, envFm, options),
			configKey: envFmEventChainKey(channelIndex, envFm),
			startPeriod: envFmStartPeriod(envFm),
			periodKey: timerPeriodKey(envFm),
			timingKey: pwmEventChainTimingKey(envFm)
		});
	}
	return effects;
}

function channelEffectSetKey(effects: ChannelEffect[]): string {
	return effects.map((effect) => effect.configKey).join('|');
}

function channelEffectTimingKey(effects: ChannelEffect[]): string {
	return effects.map((effect) => effect.timingKey).join('|');
}

function channelEffectPeriodKey(effects: ChannelEffect[]): string {
	return effects.map((effect) => effect.periodKey).join('|');
}

function channelEffectCacheKey(effects: ChannelEffect[]): string {
	return eventChainCacheKey(channelEffectSetKey(effects), channelEffectTimingKey(effects));
}

function getOrCreateMergedEventChain(
	eventItems: EventItem[],
	chainStartByKey: Map<string, number>,
	channelIndex: number,
	effects: ChannelEffect[]
): number {
	const key = channelEffectCacheKey(effects);
	const existing = chainStartByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const startIndex = appendEffectStepSources(
		eventItems,
		channelIndex,
		effects.map((effect) => effect.source)
	);
	chainStartByKey.set(key, startIndex);
	return startIndex;
}

type TimerCommand = {
	frequency: number;
	eventIndex: number;
};

type EventItem = TmrEventItemRecord;

export type EncodedTmrFiles = {
	tmr: ArrayBuffer;
	eventList: ArrayBuffer;
	eventItems: EventItem[];
};

export function encodeTMR(
	frames: SongCaptureFrame[],
	options: TmrEncodeOptions
): EncodedTmrFiles {
	const eventItems: EventItem[] = [];
	const chainStartByKey = new Map<string, number>();
	const tmrFrames: Array<{ psgMask: number; timers: TimerCommand[] }> = [];
	const previousSid: HardwareSidState[] = Array.from({ length: 3 }, () => ({
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseVolume: 0,
		waveform: [15, 0],
		waveformLoop: 0
	}));
	const previousSyncbuzzer: HardwareSyncBuzzerState[] = Array.from({ length: 3 }, () => ({
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		waveform: [0],
		waveformLoop: 0
	}));
	const previousFm: HardwareFmState[] = Array.from({ length: 3 }, () => ({
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseTonePeriod: 1,
		fmOffsetMode: 'semitone',
		waveform: [0, 7],
		waveformLoop: 0
	}));
	const previousEnvFm: HardwareEnvFmState[] = Array.from({ length: 3 }, () => ({
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseEnvelopePeriod: 1,
		fmOffsetMode: 'semitone',
		waveform: [0, 7],
		waveformLoop: 0
	}));
	const previousMerged: Array<
		{ setKey: string; timingKey: string; periodKey: string } | undefined
	> = [
		undefined,
		undefined,
		undefined
	];
	let previousRegisters = new Array(AY_REGISTER_COUNT).fill(0);

	for (const frame of frames) {
		const psgMask = registersChangedMask(frame.registers, previousRegisters);
		previousRegisters = [...frame.registers];
		const timers: TimerCommand[] = [];

		for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
			const sid = frame.sid[channelIndex]!;
			const effectiveSid: HardwareSidState = sid.enabled
				? {
						...sid,
						pwm: true,
						periodLow: sid.periodLow > 0 ? sid.periodLow : sid.period
					}
				: sid;
			const syncbuzzer: HardwareSyncBuzzerState = frame.syncbuzzer?.[channelIndex] ?? {
				enabled: false,
				pwm: false,
				period: 0,
				periodLow: 0,
				waveform: [0],
				waveformLoop: 0
			};
			const effectiveSyncbuzzer: HardwareSyncBuzzerState = syncbuzzer.enabled
				? normalizePwmPeriods(syncbuzzer)
				: syncbuzzer;
			const fm = frame.fm?.[channelIndex] ?? {
				enabled: false,
				pwm: false,
				period: 0,
				periodLow: 0,
				baseTonePeriod: 1,
				fmOffsetMode: 'semitone',
				waveform: [0, 7],
				waveformLoop: 0
			};
			const envFm = frame.envFm?.[channelIndex] ?? {
				enabled: false,
				pwm: false,
				period: 0,
				periodLow: 0,
				baseEnvelopePeriod: 1,
				fmOffsetMode: 'semitone',
				waveform: [0, 7],
				waveformLoop: 0
			};
			const prevSid = previousSid[channelIndex]!;
			const prevSyncbuzzer = previousSyncbuzzer[channelIndex]!;
			const prevFm = previousFm[channelIndex]!;
			const prevEnvFm = previousEnvFm[channelIndex]!;

			const effectiveFm: HardwareFmState = fm.enabled && fm.pwm ? normalizePwmPeriods(fm) : fm;
			const effectiveEnvFm: HardwareEnvFmState =
				envFm.enabled && envFm.pwm ? normalizePwmPeriods(envFm) : envFm;

			const activeEffectCount =
				(syncbuzzer.enabled ? 1 : 0) +
				(sid.enabled ? 1 : 0) +
				(fm.enabled ? 1 : 0) +
				(envFm.enabled ? 1 : 0);

			const prevMergedState = previousMerged[channelIndex];
			previousMerged[channelIndex] = undefined;

			if (activeEffectCount >= 2) {
				const effects = buildChannelEffects(
					channelIndex,
					{
						syncbuzzer: effectiveSyncbuzzer,
						sid: effectiveSid,
						fm: effectiveFm,
						envFm: effectiveEnvFm
					},
					options
				);
				const setKey = channelEffectSetKey(effects);
				const timingKey = channelEffectTimingKey(effects);
				const periodKey = channelEffectPeriodKey(effects);
				const setChanged = !prevMergedState || prevMergedState.setKey !== setKey;
				const timingChanged = !prevMergedState || prevMergedState.timingKey !== timingKey;
				const periodChanged = !!prevMergedState && prevMergedState.periodKey !== periodKey;

				if (setChanged || timingChanged || periodChanged) {
					const eventIndex = getOrCreateMergedEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effects
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(effects[0]!.startPeriod, options),
						eventIndex
					});
				} else {
					timers.push({ frequency: 0, eventIndex: 0 });
				}
				previousMerged[channelIndex] = { setKey, timingKey, periodKey };
			} else if (syncbuzzer.enabled) {
				const syncbuzzerWaveformChanged =
					!!prevMergedState ||
					!prevSyncbuzzer.enabled ||
					!syncBuzzerWaveformConfigEqual(prevSyncbuzzer, effectiveSyncbuzzer);
				const syncbuzzerPeriodChanged =
					prevSyncbuzzer.period !== effectiveSyncbuzzer.period ||
					prevSyncbuzzer.periodLow !== effectiveSyncbuzzer.periodLow;
				if (syncbuzzerWaveformChanged) {
					const eventIndex = getOrCreateSyncBuzzerEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveSyncbuzzer,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(
							syncBuzzerStartPeriod(effectiveSyncbuzzer),
							options
						),
						eventIndex
					});
				} else if (syncbuzzerPeriodChanged && isPwmDutySweep(prevSyncbuzzer, effectiveSyncbuzzer)) {
					const eventIndex = appendSyncBuzzerEventChain(
						eventItems,
						channelIndex,
						effectiveSyncbuzzer,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(
							syncBuzzerStartPeriod(effectiveSyncbuzzer),
							options
						),
						eventIndex
					});
				} else if (syncbuzzerPeriodChanged) {
					const eventIndex = getOrCreateSyncBuzzerEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveSyncbuzzer,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(effectiveSyncbuzzer.period, options),
						eventIndex
					});
				} else {
					timers.push({ frequency: 0, eventIndex: 0 });
				}
			} else if (sid.enabled) {
				const sidWaveformChanged =
					!!prevMergedState || !prevSid.enabled || !sidWaveformConfigEqual(prevSid, effectiveSid);
				const sidPeriodChanged =
					prevSid.period !== effectiveSid.period ||
					prevSid.periodLow !== effectiveSid.periodLow;
				if (sidWaveformChanged) {
					const eventIndex = getOrCreateSidEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveSid,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(sidStartPeriod(effectiveSid), options),
						eventIndex
					});
				} else if (sidPeriodChanged && isSidPwmDutySweep(prevSid, effectiveSid)) {
					const eventIndex = appendSidEventChain(
						eventItems,
						channelIndex,
						effectiveSid,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(sidStartPeriod(effectiveSid), options),
						eventIndex
					});
				} else if (sidPeriodChanged) {
					const eventIndex = getOrCreateSidEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveSid,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(effectiveSid.period, options),
						eventIndex
					});
				} else {
					timers.push({ frequency: 0, eventIndex: 0 });
				}
			} else if (fm.enabled) {
				const fmWaveformChanged =
					!!prevMergedState || !prevFm.enabled || !fmWaveformConfigEqual(prevFm, effectiveFm);
				const fmPeriodChanged =
					prevFm.period !== effectiveFm.period || prevFm.periodLow !== effectiveFm.periodLow;
				if (fmWaveformChanged) {
					const eventIndex = getOrCreateFmEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(fmStartPeriod(effectiveFm), options),
						eventIndex
					});
				} else if (fmPeriodChanged && isPwmDutySweep(prevFm, effectiveFm)) {
					const eventIndex = appendFmEventChain(
						eventItems,
						channelIndex,
						effectiveFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(fmStartPeriod(effectiveFm), options),
						eventIndex
					});
				} else if (fmPeriodChanged) {
					const eventIndex = getOrCreateFmEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(effectiveFm.period, options),
						eventIndex
					});
				} else {
					timers.push({ frequency: 0, eventIndex: 0 });
				}
			} else if (envFm.enabled) {
				const envFmWaveformChanged =
					!!prevMergedState ||
					!prevEnvFm.enabled || !envFmWaveformConfigEqual(prevEnvFm, effectiveEnvFm);
				const envFmPeriodChanged =
					prevEnvFm.period !== effectiveEnvFm.period ||
					prevEnvFm.periodLow !== effectiveEnvFm.periodLow;
				if (envFmWaveformChanged) {
					const eventIndex = getOrCreateEnvFmEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveEnvFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(envFmStartPeriod(effectiveEnvFm), options),
						eventIndex
					});
				} else if (envFmPeriodChanged && isPwmDutySweep(prevEnvFm, effectiveEnvFm)) {
					const eventIndex = appendEnvFmEventChain(
						eventItems,
						channelIndex,
						effectiveEnvFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(envFmStartPeriod(effectiveEnvFm), options),
						eventIndex
					});
				} else if (envFmPeriodChanged) {
					const eventIndex = getOrCreateEnvFmEventChain(
						eventItems,
						chainStartByKey,
						channelIndex,
						effectiveEnvFm,
						options
					);
					timers.push({
						frequency: encodeExportTimerFrequencyHz(effectiveEnvFm.period, options),
						eventIndex
					});
				} else {
					timers.push({ frequency: 0, eventIndex: 0 });
				}
			} else if (
				prevSid.enabled ||
				prevSyncbuzzer.enabled ||
				prevFm.enabled ||
				prevEnvFm.enabled
			) {
				timers.push({ frequency: 0, eventIndex: TMR_TIMER_EVENT_STOP });
			} else {
				timers.push({ frequency: 0, eventIndex: 0 });
			}

			previousSid[channelIndex] = {
				enabled: sid.enabled,
				pwm: effectiveSid.pwm,
				period: effectiveSid.period,
				periodLow: effectiveSid.periodLow,
				baseVolume: sid.baseVolume,
				waveform: [...sid.waveform],
				waveformLoop: sid.waveformLoop
			};
			previousSyncbuzzer[channelIndex] = {
				enabled: syncbuzzer.enabled,
				pwm: effectiveSyncbuzzer.pwm,
				period: effectiveSyncbuzzer.period,
				periodLow: effectiveSyncbuzzer.periodLow,
				waveform: [...syncbuzzer.waveform],
				waveformLoop: syncbuzzer.waveformLoop
			};
			previousFm[channelIndex] = {
				enabled: fm.enabled,
				pwm: fm.pwm,
				period: fm.period,
				periodLow: fm.periodLow,
				baseTonePeriod: fm.baseTonePeriod,
				fmOffsetMode: fm.fmOffsetMode,
				waveform: [...fm.waveform],
				waveformLoop: fm.waveformLoop
			};
			previousEnvFm[channelIndex] = {
				enabled: envFm.enabled,
				pwm: envFm.pwm,
				period: envFm.period,
				periodLow: envFm.periodLow,
				baseEnvelopePeriod: envFm.baseEnvelopePeriod,
				fmOffsetMode: envFm.fmOffsetMode,
				waveform: [...envFm.waveform],
				waveformLoop: envFm.waveformLoop
			};
		}

		tmrFrames.push({ psgMask: registerMaskFromEventPsgApplyMask(psgMask), timers });
	}

	const bodySize = TMR_HEADER_SIZE + tmrFrames.length * TMR_FRAME_SIZE;
	const buffer = new ArrayBuffer(bodySize);
	const view = new DataView(buffer);

	writeHeader(view, tmrFrames.length, options);

	let offset = TMR_HEADER_SIZE;
	for (const frame of tmrFrames) {
		writeU16(view, offset, frame.psgMask);
		offset += 2;
		for (const timer of frame.timers) {
			writeU32(view, offset, timer.frequency);
			offset += 4;
			writeU16(view, offset, timer.eventIndex);
			offset += 2;
		}
	}

	return {
		tmr: buffer,
		eventList: encodeEventList(eventItems),
		eventItems
	};
}

function sidWaveformConfigEqual(a: HardwareSidState, b: HardwareSidState): boolean {
	return (
		a.baseVolume === b.baseVolume &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

function syncBuzzerWaveformConfigEqual(
	a: HardwareSyncBuzzerState,
	b: HardwareSyncBuzzerState
): boolean {
	return (
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

export function sidEventChainKey(channelIndex: number, sid: HardwareSidState): string {
	return `${channelIndex}:${sid.baseVolume}:${sid.waveform.join(',')}:${sid.waveformLoop}`;
}

export function syncBuzzerEventChainKey(
	channelIndex: number,
	syncbuzzer: HardwareSyncBuzzerState
): string {
	return `sync:${channelIndex}:${syncbuzzer.waveformLoop}:${syncbuzzer.waveform.join(',')}`;
}

export function fmEventChainKey(channelIndex: number, fm: HardwareFmState): string {
	return `fm:${channelIndex}:${fm.baseTonePeriod}:${fm.fmOffsetMode}:${fm.waveform.join(',')}:${fm.waveformLoop}`;
}

export function envFmEventChainKey(channelIndex: number, envFm: HardwareEnvFmState): string {
	return `envfm:${channelIndex}:${envFm.baseEnvelopePeriod}:${envFm.fmOffsetMode}:${envFm.waveform.join(',')}:${envFm.waveformLoop}`;
}

function fmWaveformConfigEqual(a: HardwareFmState, b: HardwareFmState): boolean {
	return (
		a.baseTonePeriod === b.baseTonePeriod &&
		a.fmOffsetMode === b.fmOffsetMode &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

function envFmWaveformConfigEqual(a: HardwareEnvFmState, b: HardwareEnvFmState): boolean {
	return (
		a.baseEnvelopePeriod === b.baseEnvelopePeriod &&
		a.fmOffsetMode === b.fmOffsetMode &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

function getOrCreateSyncBuzzerEventChain(
	eventItems: EventItem[],
	chainStartByKey: Map<string, number>,
	channelIndex: number,
	syncbuzzer: HardwareSyncBuzzerState,
	options: TmrEncodeOptions
): number {
	const key = syncBuzzerEventChainCacheKey(channelIndex, syncbuzzer);
	const existing = chainStartByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}

	const startIndex = appendSyncBuzzerEventChain(eventItems, channelIndex, syncbuzzer, options);
	chainStartByKey.set(key, startIndex);
	return startIndex;
}

function appendSyncBuzzerEventChain(
	eventItems: EventItem[],
	channelIndex: number,
	syncbuzzer: HardwareSyncBuzzerState,
	options: TmrEncodeOptions
): number {
	return appendEffectStepSources(eventItems, channelIndex, [
		syncBuzzerStepSource(channelIndex, syncbuzzer, options)
	]);
}

function getOrCreateSidEventChain(
	eventItems: EventItem[],
	chainStartByKey: Map<string, number>,
	channelIndex: number,
	sid: HardwareSidState,
	options: TmrEncodeOptions
): number {
	const key = sidEventChainCacheKey(channelIndex, sid);
	const existing = chainStartByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}

	const startIndex = appendSidEventChain(eventItems, channelIndex, sid, options);
	chainStartByKey.set(key, startIndex);
	return startIndex;
}

function getOrCreateFmEventChain(
	eventItems: EventItem[],
	chainStartByKey: Map<string, number>,
	channelIndex: number,
	fm: HardwareFmState,
	options: TmrEncodeOptions
): number {
	const key = fmEventChainCacheKey(channelIndex, fm);
	const existing = chainStartByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}

	const startIndex = appendFmEventChain(eventItems, channelIndex, fm, options);
	chainStartByKey.set(key, startIndex);
	return startIndex;
}

function getOrCreateEnvFmEventChain(
	eventItems: EventItem[],
	chainStartByKey: Map<string, number>,
	channelIndex: number,
	envFm: HardwareEnvFmState,
	options: TmrEncodeOptions
): number {
	const key = envFmEventChainCacheKey(channelIndex, envFm);
	const existing = chainStartByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}

	const startIndex = appendEnvFmEventChain(eventItems, channelIndex, envFm, options);
	chainStartByKey.set(key, startIndex);
	return startIndex;
}

function resolveNextWaveformIndex(stepIndex: number, state: WaveformChainState): number {
	const nextStep = stepIndex + 1;
	if (nextStep < state.waveform.length) {
		return nextStep;
	}
	if (state.waveformLoop >= 0 && state.waveformLoop < state.waveform.length) {
		return state.waveformLoop;
	}
	return 0;
}

function writeHeader(view: DataView, frameCount: number, options: TmrEncodeOptions): void {
	view.setUint8(0, 0x54);
	view.setUint8(1, 0x4d);
	view.setUint8(2, 0x52);
	view.setUint8(3, 0x1a);
	writeU16(view, 4, 1);
	writeU16(view, 6, TMR_HEADER_SIZE);
	writeU16(view, 8, options.isYm ? 1 : 0);
	view.setUint8(10, options.chipIndex ?? 0);
	view.setUint8(11, 0);
	writeU32(view, 12, Math.round(options.interruptFrequency * 65536));
	writeU32(view, 16, options.chipFrequency >>> 0);
	writeU32(view, 20, frameCount >>> 0);
	for (let index = 0; index < 8; index++) {
		view.setUint8(24 + index, 0);
	}
}

function writeU16(view: DataView, offset: number, value: number): void {
	view.setUint16(offset, value & 0xffff, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
	view.setUint32(offset, value >>> 0, true);
}
