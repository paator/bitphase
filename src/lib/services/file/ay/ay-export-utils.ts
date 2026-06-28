import {
	clampSamplePlaybackPosition,
	computeSamplePitchScale,
	normalizeSamplePlaybackBounds,
	resolveSampleLoopEnabled,
	resolveSamplePitchReferencePeriod,
	resolveSamplePlaybackRate,
	type SamplePlaybackBounds
} from '../../../chips/ay/sample-region';
import { sidRegisterVolume, type AyChipVariant } from '../../../chips/ay/sid-waveform-volume';

export const AY_REGISTER_COUNT = 14;
export const DEFAULT_AY_REGISTERS: readonly number[] = Array.from(
	{ length: AY_REGISTER_COUNT },
	() => 0
);
export const TONE_CHANNELS = 3;

const TIMER_EFFECT_KIND_VOLUME = 1;
const TIMER_EFFECT_KIND_ENVELOPE_SHAPE = 2;
const TIMER_EFFECT_KIND_TONE = 3;
const TIMER_EFFECT_KIND_ENVELOPE_PERIOD = 4;
const TIMER_PWM_MODE_BY_DUTY_INDEX = 2;
const SAMPLE_CAPTURE_FALLBACK_RATE_HZ = 44100;

type TimerEffectRegisterState = {
	enabled?: boolean;
	kind?: number;
	pwmMode?: number;
	period?: number;
	periodLow?: number;
	baseVolume?: number;
	baseTonePeriod?: number;
	fmOffsetMode?: 'semitone' | 'period' | number;
	waveform?: number[];
	waveformLoop?: number;
};

export type HardwareSidState = {
	enabled: boolean;
	pwm: boolean;
	period: number;
	periodLow: number;
	baseVolume: number;
	waveform: number[];
	waveformLoop: number;
};

export type HardwareSyncBuzzerState = {
	enabled: boolean;
	pwm: boolean;
	period: number;
	periodLow: number;
	waveform: number[];
	waveformLoop: number;
};

export type HardwareFmState = {
	enabled: boolean;
	pwm: boolean;
	period: number;
	periodLow: number;
	baseTonePeriod: number;
	fmOffsetMode: 'semitone' | 'period';
	waveform: number[];
	waveformLoop: number;
};

export type HardwareEnvFmState = {
	enabled: boolean;
	pwm: boolean;
	period: number;
	periodLow: number;
	baseEnvelopePeriod: number;
	fmOffsetMode: 'semitone' | 'period';
	waveform: number[];
	waveformLoop: number;
};

export type HardwareSampleState = {
	enabled: boolean;
	hardwareChannelIndex: number;
	instrumentIndex: number;
	position: number;
	phase: number;
	effectiveTone: number;
};

export type CapturedAySampleInstrument = {
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLength?: number;
	sampleLoop?: number;
	sampleLoopEnabled?: boolean;
};

export type HardwareTaymSampleState = {
	enabled: boolean;
	instanceId: number;
	sampleBytes: number[];
	loopIndex: number;
	rateHz: number;
	volume: number;
};

export type SongCaptureFrame = {
	registers: number[];
	sid: HardwareSidState[];
	syncbuzzer: HardwareSyncBuzzerState[];
	fm: HardwareFmState[];
	envFm: HardwareEnvFmState[];
	sample: HardwareSampleState[];
	samples?: HardwareTaymSampleState[];
};

export function convertRegisterStateToAYRegisters(registerState: {
	channels: Array<{
		tone: number;
		volume: number;
		mixer: { tone: boolean; noise: boolean; envelope: boolean };
		sid?: HardwareSidState;
	}>;
	noise: number;
	envelopePeriod: number;
	envelopeShape: number;
}): number[] {
	const registers = new Array(AY_REGISTER_COUNT).fill(0);

	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const channel = registerState.channels[channelIndex];
		const toneReg = channelIndex * 2;
		const tone = channel.tone & 0xfff;
		registers[toneReg] = tone & 0xff;
		registers[toneReg + 1] = (tone >> 8) & 0x0f;
	}

	registers[6] = registerState.noise & 0x1f;

	let mixer = 0;
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const channel = registerState.channels[channelIndex];
		if (!channel.mixer.tone) {
			mixer |= 1 << channelIndex;
		}
		if (!channel.mixer.noise) {
			mixer |= 1 << (channelIndex + 3);
		}
	}
	registers[7] = mixer;

	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const channel = registerState.channels[channelIndex];
		let volume = channel.volume & 0x0f;
		if (channel.mixer.envelope) {
			volume |= 0x10;
		}
		registers[8 + channelIndex] = volume;
	}

	const envelopePeriod = registerState.envelopePeriod & 0xffff;
	registers[11] = envelopePeriod & 0xff;
	registers[12] = (envelopePeriod >> 8) & 0xff;

	registers[13] = registerState.envelopeShape & 0x0f;

	return registers;
}

export function registerApplyMask(regIndex: number): number {
	return 0x8000 >> regIndex;
}

export function allRegistersApplyMask(): number {
	let mask = 0;
	for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
		mask |= registerApplyMask(regIndex);
	}
	return mask;
}

export function registersChangedMask(
	current: readonly number[],
	previous: readonly number[]
): number {
	let mask = 0;
	for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
		const currentValue = current[regIndex] ?? 0;
		const previousValue = previous[regIndex] ?? 0;
		if ((currentValue & 0xff) !== (previousValue & 0xff)) {
			mask |= registerApplyMask(regIndex);
		}
	}
	return mask;
}

export function volumeRegisterIndex(channelIndex: number): number {
	return 8 + channelIndex;
}

export function toneRegisterApplyMask(channelIndex: number): number {
	const toneReg = channelIndex * 2;
	return registerApplyMask(toneReg) | registerApplyMask(toneReg + 1);
}

export function envelopePeriodRegisterApplyMask(): number {
	return registerApplyMask(11) | registerApplyMask(12);
}

export function writeTonePeriodToPsgData(
	psgData: number[],
	channelIndex: number,
	period: number
): void {
	const toneReg = channelIndex * 2;
	const tone = period & 0xfff;
	psgData[toneReg] = tone & 0xff;
	psgData[toneReg + 1] = (tone >> 8) & 0x0f;
}

export function writeEnvelopePeriodToPsgData(psgData: number[], period: number): void {
	const envelopePeriod = period & 0xffff;
	psgData[11] = envelopePeriod & 0xff;
	psgData[12] = (envelopePeriod >> 8) & 0xff;
}

export function sidVolumeLevel(
	waveformStep: number,
	baseVolume: number,
	variant: AyChipVariant = 'AY'
): number {
	return sidRegisterVolume(waveformStep, baseVolume, variant);
}

export { isTimerWaveformLowPhase, timerPwmStepPeriod } from '../../../chips/ay/instrument';

function resolveCapturedFmOffsetMode(
	mode: TimerEffectRegisterState['fmOffsetMode']
): 'semitone' | 'period' {
	return mode === 'period' || mode === 1 ? 'period' : 'semitone';
}

function createDisabledSidState(): HardwareSidState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseVolume: 0,
		waveform: [15, 0],
		waveformLoop: 0
	};
}

function createDisabledSyncBuzzerState(): HardwareSyncBuzzerState {
	return { enabled: false, pwm: false, period: 0, periodLow: 0, waveform: [0], waveformLoop: 0 };
}

function createDisabledFmState(): HardwareFmState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseTonePeriod: 1,
		fmOffsetMode: 'semitone',
		waveform: [0, 7],
		waveformLoop: 0
	};
}

function createDisabledEnvFmState(): HardwareEnvFmState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseEnvelopePeriod: 1,
		fmOffsetMode: 'semitone',
		waveform: [0, 7],
		waveformLoop: 0
	};
}

export const SAMPLE_NO_LOOP = -1;

function createDisabledTaymSampleState(): HardwareTaymSampleState {
	return {
		enabled: false,
		instanceId: 0,
		sampleBytes: [],
		loopIndex: SAMPLE_NO_LOOP,
		rateHz: 0,
		volume: 0
	};
}

export function createDisabledTaymSampleStates(): HardwareTaymSampleState[] {
	return Array.from({ length: TONE_CHANNELS }, createDisabledTaymSampleState);
}

export function createDisabledTimerCaptureStates(): {
	sid: HardwareSidState[];
	syncbuzzer: HardwareSyncBuzzerState[];
	fm: HardwareFmState[];
	envFm: HardwareEnvFmState[];
	sample: HardwareSampleState[];
} {
	return {
		sid: Array.from({ length: TONE_CHANNELS }, createDisabledSidState),
		syncbuzzer: Array.from({ length: TONE_CHANNELS }, createDisabledSyncBuzzerState),
		fm: Array.from({ length: TONE_CHANNELS }, createDisabledFmState),
		envFm: Array.from({ length: TONE_CHANNELS }, createDisabledEnvFmState),
		sample: Array.from({ length: TONE_CHANNELS }, (_, hardwareChannelIndex) => ({
			enabled: false,
			hardwareChannelIndex,
			instrumentIndex: -1,
			position: 0,
			phase: 0,
			effectiveTone: 0
		}))
	};
}

type SampleCaptureChannelState = {
	enabled: boolean;
	instrumentIndex: number;
	regionKey: string;
	instanceId: number;
	sampleBytes: number[];
	loopIndex: number;
};

export type TaymSampleCaptureTracker = {
	channels: SampleCaptureChannelState[];
	nextInstanceId: number;
};

export function createTaymSampleCaptureTracker(): TaymSampleCaptureTracker {
	return {
		channels: Array.from({ length: TONE_CHANNELS }, () => ({
			enabled: false,
			instrumentIndex: -1,
			regionKey: '',
			instanceId: 0,
			sampleBytes: [],
			loopIndex: SAMPLE_NO_LOOP
		})),
		nextInstanceId: 1
	};
}

type SampleCaptureEngineState = {
	channelInstruments: number[];
	channelSoundEnabled: boolean[];
	channelMuted: boolean[];
	channelCurrentNotes: number[];
	currentTuningTable: number[];
	channelToneSliding?: number[];
	channelVibratoSliding?: number[];
	channelDetune?: number[];
	channelSamplePositions?: number[];
	channelSamplePhase?: number[];
	instruments: Array<{
		sampleData?: number[];
		sampleRate?: number;
		sampleStart?: number;
		sampleEnd?: number;
		sampleLoopStart?: number;
		sampleLength?: number;
		sampleLoop?: number;
		sampleLoopEnabled?: boolean;
	}>;
	aymFrequency: number;
};

type SampleCaptureRegisterState = {
	channels: Array<{
		timerEffects?: { sid?: { enabled?: boolean; kind?: number; baseVolume?: number } };
	}>;
};

function captureEffectiveTone(state: SampleCaptureEngineState, channelIndex: number): number {
	const noteIndex = state.channelCurrentNotes[channelIndex] ?? -1;
	if (noteIndex < 0 || noteIndex >= state.currentTuningTable.length) {
		return 0;
	}
	const baseTone = state.currentTuningTable[noteIndex] ?? 0;
	if (baseTone <= 0) {
		return 0;
	}
	const toneSliding = state.channelToneSliding?.[channelIndex] ?? 0;
	const vibratoSliding = state.channelVibratoSliding?.[channelIndex] ?? 0;
	const detune = state.channelDetune?.[channelIndex] ?? 0;
	return (baseTone + toneSliding + vibratoSliding + detune) & 0xfff;
}

function samplePositionForCapture(
	state: SampleCaptureEngineState,
	channelIndex: number,
	bounds: SamplePlaybackBounds
): number {
	const position = state.channelSamplePositions?.[channelIndex];
	if (typeof position !== 'number' || !Number.isFinite(position)) {
		return bounds.start;
	}
	return clampSamplePlaybackPosition(bounds, position);
}

function appendSampleBytes(out: number[], sampleData: number[], start: number, end: number): void {
	for (let position = start; position <= end; position++) {
		out.push((sampleData[position] ?? 0) & 0xff);
	}
}

function buildSampleBytesFromPosition(
	instrument: { sampleData?: number[] },
	bounds: SamplePlaybackBounds,
	startPosition: number,
	loopEnabled: boolean
): { sampleBytes: number[]; loopIndex: number } {
	const sampleData = instrument.sampleData ?? [];
	const sampleBytes: number[] = [];
	appendSampleBytes(sampleBytes, sampleData, startPosition, bounds.end);

	if (!loopEnabled) {
		return { sampleBytes, loopIndex: SAMPLE_NO_LOOP };
	}

	if (bounds.loopStart < startPosition) {
		const loopIndex = sampleBytes.length;
		appendSampleBytes(sampleBytes, sampleData, bounds.loopStart, bounds.end);
		return { sampleBytes, loopIndex };
	}

	return { sampleBytes, loopIndex: bounds.loopStart - startPosition };
}

export function extractHardwareTaymSampleStates(
	state: SampleCaptureEngineState,
	registerState: SampleCaptureRegisterState,
	tracker: TaymSampleCaptureTracker,
	chipFrequency: number,
	sampleRestartFlags: boolean[]
): HardwareTaymSampleState[] {
	const clockHz = chipFrequency > 0 ? chipFrequency : 1773400;
	const referencePeriod = resolveSamplePitchReferencePeriod(clockHz);
	const result: HardwareTaymSampleState[] = [];

	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const track = tracker.channels[channelIndex]!;
		const instrumentIndex = state.channelInstruments[channelIndex] ?? -1;
		const instrument = instrumentIndex >= 0 ? state.instruments[instrumentIndex] : undefined;
		const bounds = instrument ? normalizeSamplePlaybackBounds(instrument) : null;
		const sidEffect = registerState.channels[channelIndex]?.timerEffects?.sid;
		const effectiveTone = captureEffectiveTone(state, channelIndex);

		const playing =
			!!bounds &&
			!state.channelMuted[channelIndex] &&
			!!state.channelSoundEnabled[channelIndex] &&
			!!sidEffect?.enabled &&
			sidEffect.kind === TIMER_EFFECT_KIND_VOLUME &&
			effectiveTone > 0;

		if (!playing || !bounds || !instrument) {
			track.enabled = false;
			track.instrumentIndex = -1;
			track.regionKey = '';
			track.sampleBytes = [];
			track.loopIndex = SAMPLE_NO_LOOP;
			result.push(createDisabledTaymSampleState());
			continue;
		}

		const loopEnabled = resolveSampleLoopEnabled(instrument);
		const regionKey = `${instrumentIndex}:${bounds.start}:${bounds.end}:${bounds.loopStart}:${loopEnabled ? 1 : 0}`;
		const isNewInstance =
			!track.enabled ||
			track.instrumentIndex !== instrumentIndex ||
			track.regionKey !== regionKey ||
			!!sampleRestartFlags[channelIndex];
		const startPosition = track.instanceId !== 0 && isNewInstance
			? bounds.start
			: samplePositionForCapture(state, channelIndex, bounds);
		if (isNewInstance) {
			track.instanceId = tracker.nextInstanceId++;
			const sample = buildSampleBytesFromPosition(
				instrument,
				bounds,
				startPosition,
				loopEnabled
			);
			track.sampleBytes = sample.sampleBytes;
			track.loopIndex = sample.loopIndex;
		}
		track.enabled = true;
		track.instrumentIndex = instrumentIndex;
		track.regionKey = regionKey;

		const baseRate = resolveSamplePlaybackRate(
			instrument.sampleRate,
			SAMPLE_CAPTURE_FALLBACK_RATE_HZ
		);
		const pitchScale = computeSamplePitchScale(referencePeriod, effectiveTone);
		const rateHz = baseRate * pitchScale;
		const volume = (sidEffect?.baseVolume ?? 0) & 0x0f;

		result.push({
			enabled: true,
			instanceId: track.instanceId,
			sampleBytes: track.sampleBytes,
			loopIndex: track.loopIndex,
			rateHz,
			volume
		});
	}

	return result;
}

export function suppressSidForTaymSampleChannels(
	sid: HardwareSidState[],
	samples: HardwareTaymSampleState[]
): void {
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		if (samples[channelIndex]?.enabled) {
			sid[channelIndex] = createDisabledSidState();
		}
	}
}

export function extractHardwareSidStates(registerState: {
	channels: Array<{
		timerEffects?: {
			sid?: TimerEffectRegisterState;
		};
	}>;
}): HardwareSidState[] {
	const result: HardwareSidState[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const timerEffect = registerState.channels[channelIndex]?.timerEffects?.sid;
		const enabled = !!timerEffect?.enabled && timerEffect.kind === TIMER_EFFECT_KIND_VOLUME;
		result.push({
			enabled,
			pwm: enabled && timerEffect.pwmMode === TIMER_PWM_MODE_BY_DUTY_INDEX,
			period: timerEffect?.period ?? 0,
			periodLow: timerEffect?.periodLow ?? timerEffect?.period ?? 0,
			baseVolume: timerEffect?.baseVolume ?? 0,
			waveform: [...(timerEffect?.waveform ?? [15, 0])],
			waveformLoop: timerEffect?.waveformLoop ?? 0
		});
	}
	return result;
}

export function extractHardwareSyncBuzzerStates(registerState: {
	channels: Array<{
		timerEffects?: {
			syncbuzzer?: TimerEffectRegisterState;
		};
	}>;
}): HardwareSyncBuzzerState[] {
	const result: HardwareSyncBuzzerState[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const timerEffect = registerState.channels[channelIndex]?.timerEffects?.syncbuzzer;
		const enabled =
			!!timerEffect?.enabled && timerEffect.kind === TIMER_EFFECT_KIND_ENVELOPE_SHAPE;
		result.push({
			enabled,
			pwm: enabled && timerEffect.pwmMode === TIMER_PWM_MODE_BY_DUTY_INDEX,
			period: timerEffect?.period ?? 0,
			periodLow: timerEffect?.periodLow ?? timerEffect?.period ?? 0,
			waveform: [...(timerEffect?.waveform ?? [0])],
			waveformLoop: timerEffect?.waveformLoop ?? 0
		});
	}
	return result;
}

export function extractHardwareFmStates(registerState: {
	channels: Array<{
		timerEffects?: {
			fm?: TimerEffectRegisterState;
		};
	}>;
}): HardwareFmState[] {
	const result: HardwareFmState[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const timerEffect = registerState.channels[channelIndex]?.timerEffects?.fm;
		const enabled = !!timerEffect?.enabled && timerEffect.kind === TIMER_EFFECT_KIND_TONE;
		const fmOffsetMode = resolveCapturedFmOffsetMode(timerEffect?.fmOffsetMode);
		result.push({
			enabled,
			pwm: enabled && timerEffect.pwmMode === TIMER_PWM_MODE_BY_DUTY_INDEX,
			period: timerEffect?.period ?? 0,
			periodLow: timerEffect?.periodLow ?? timerEffect?.period ?? 0,
			baseTonePeriod: Math.max(1, timerEffect?.baseTonePeriod ?? 1),
			fmOffsetMode,
			waveform: [...(timerEffect?.waveform ?? [0, 7])],
			waveformLoop: timerEffect?.waveformLoop ?? 0
		});
	}
	return result;
}

export function extractHardwareEnvFmStates(registerState: {
	channels: Array<{
		timerEffects?: {
			envFm?: TimerEffectRegisterState;
		};
	}>;
}): HardwareEnvFmState[] {
	const result: HardwareEnvFmState[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const timerEffect = registerState.channels[channelIndex]?.timerEffects?.envFm;
		const enabled =
			!!timerEffect?.enabled && timerEffect.kind === TIMER_EFFECT_KIND_ENVELOPE_PERIOD;
		const fmOffsetMode = resolveCapturedFmOffsetMode(timerEffect?.fmOffsetMode);
		result.push({
			enabled,
			pwm: enabled && timerEffect.pwmMode === TIMER_PWM_MODE_BY_DUTY_INDEX,
			period: timerEffect?.period ?? 0,
			periodLow: timerEffect?.periodLow ?? timerEffect?.period ?? 0,
			baseEnvelopePeriod: Math.max(1, timerEffect?.baseTonePeriod ?? 1),
			fmOffsetMode,
			waveform: [...(timerEffect?.waveform ?? [0, 7])],
			waveformLoop: timerEffect?.waveformLoop ?? 0
		});
	}
	return result;
}

function createDisabledSampleState(hardwareChannelIndex: number): HardwareSampleState {
	return {
		enabled: false,
		hardwareChannelIndex,
		instrumentIndex: -1,
		position: 0,
		phase: 0,
		effectiveTone: 0
	};
}

export function extractHardwareSampleStates(
	state: {
		channelInstruments?: number[];
		channelSoundEnabled?: boolean[];
		channelMuted?: boolean[];
		channelSamplePositions?: number[];
		channelSamplePhase?: number[];
		instruments?: Array<{ sampleData?: number[] }>;
	},
	getEffectiveTone: (channelIndex: number) => number,
	getHardwareChannelIndex: (channelIndex: number) => number
): HardwareSampleState[] {
	const byHardware = [
		createDisabledSampleState(0),
		createDisabledSampleState(1),
		createDisabledSampleState(2)
	];
	const channelCount = state.channelInstruments?.length ?? 0;
	for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
		if (state.channelMuted?.[channelIndex]) {
			continue;
		}
		if (!state.channelSoundEnabled?.[channelIndex]) {
			continue;
		}
		const instrumentIndex = state.channelInstruments?.[channelIndex] ?? -1;
		const instrument = instrumentIndex >= 0 ? state.instruments?.[instrumentIndex] : null;
		if (!instrument?.sampleData?.length) {
			continue;
		}
		const effectiveTone = getEffectiveTone(channelIndex);
		if (effectiveTone <= 0) {
			continue;
		}
		const hardwareChannelIndex = getHardwareChannelIndex(channelIndex);
		if (hardwareChannelIndex < 0 || hardwareChannelIndex >= TONE_CHANNELS) {
			continue;
		}
		if (byHardware[hardwareChannelIndex]?.enabled) {
			continue;
		}
		byHardware[hardwareChannelIndex] = {
			enabled: true,
			hardwareChannelIndex,
			instrumentIndex,
			position: state.channelSamplePositions?.[channelIndex] ?? 0,
			phase: state.channelSamplePhase?.[channelIndex] ?? 0,
			effectiveTone
		};
	}
	return byHardware;
}

export const ENVELOPE_SHAPE_REGISTER = 13;

export function envelopeShapeRegisterApplyMask(): number {
	return registerApplyMask(ENVELOPE_SHAPE_REGISTER);
}

export function sidStatesEqual(a: HardwareSidState, b: HardwareSidState): boolean {
	return (
		a.enabled === b.enabled &&
		a.pwm === b.pwm &&
		a.period === b.period &&
		a.periodLow === b.periodLow &&
		a.baseVolume === b.baseVolume &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

export function syncBuzzerStatesEqual(
	a: HardwareSyncBuzzerState,
	b: HardwareSyncBuzzerState
): boolean {
	return (
		a.enabled === b.enabled &&
		a.pwm === b.pwm &&
		a.period === b.period &&
		a.periodLow === b.periodLow &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

export function fmStatesEqual(a: HardwareFmState, b: HardwareFmState): boolean {
	return (
		a.enabled === b.enabled &&
		a.pwm === b.pwm &&
		a.period === b.period &&
		a.periodLow === b.periodLow &&
		a.baseTonePeriod === b.baseTonePeriod &&
		a.fmOffsetMode === b.fmOffsetMode &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}

export function envFmStatesEqual(a: HardwareEnvFmState, b: HardwareEnvFmState): boolean {
	return (
		a.enabled === b.enabled &&
		a.pwm === b.pwm &&
		a.period === b.period &&
		a.periodLow === b.periodLow &&
		a.baseEnvelopePeriod === b.baseEnvelopePeriod &&
		a.fmOffsetMode === b.fmOffsetMode &&
		a.waveformLoop === b.waveformLoop &&
		a.waveform.length === b.waveform.length &&
		a.waveform.every((value, index) => value === b.waveform[index])
	);
}
