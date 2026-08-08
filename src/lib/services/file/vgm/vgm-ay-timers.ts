import { computeEnvFmEnvelopePeriod, computeFmTonePeriod } from '../../../chips/ay/instrument';
import {
	ENVELOPE_SHAPE_REGISTER,
	sidVolumeLevel,
	timerPwmStepPeriod,
	TONE_CHANNELS,
	volumeRegisterIndex,
	writeEnvelopePeriodToPsgData,
	writeTonePeriodToPsgData,
	type HardwareEnvFmState,
	type HardwareFmState,
	type HardwareSidState,
	type HardwareSyncBuzzerState,
	type SongCaptureFrame
} from '../ay/ay-export-utils';
import { VGM_SAMPLE_RATE } from './vgm-encoder';

export type AyTimedWrite = {
	sample: number;
	register: number;
	value: number;
};

type TimerSlotKind = 'sid' | 'syncbuzzer' | 'fm' | 'envFm';

type TimerSlotRuntime = {
	kind: TimerSlotKind;
	channelIndex: number;
	enabled: boolean;
	position: number;
	samplesUntilStep: number;
	periodError: number;
	sid: HardwareSidState | null;
	syncbuzzer: HardwareSyncBuzzerState | null;
	fm: HardwareFmState | null;
	envFm: HardwareEnvFmState | null;
};

export type AyTimerRuntime = {
	slots: TimerSlotRuntime[];
};

function createDisabledSlot(kind: TimerSlotKind, channelIndex: number): TimerSlotRuntime {
	return {
		kind,
		channelIndex,
		enabled: false,
		position: 0,
		samplesUntilStep: 0,
		periodError: 0,
		sid: null,
		syncbuzzer: null,
		fm: null,
		envFm: null
	};
}

export function createAyTimerRuntime(): AyTimerRuntime {
	const slots: TimerSlotRuntime[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		slots.push(createDisabledSlot('sid', channelIndex));
		slots.push(createDisabledSlot('syncbuzzer', channelIndex));
		slots.push(createDisabledSlot('fm', channelIndex));
		slots.push(createDisabledSlot('envFm', channelIndex));
	}
	return { slots };
}

function samplesForYmPeriod(period: number, chipFrequency: number): number {
	const safePeriod = Math.max(1, period);
	const safeClock = Math.max(1, chipFrequency);
	return (VGM_SAMPLE_RATE * 8 * safePeriod) / safeClock;
}

function takeIntegerStepSamples(
	slot: TimerSlotRuntime,
	period: number,
	chipFrequency: number
): number {
	const exact = samplesForYmPeriod(period, chipFrequency);
	const rounded = Math.max(1, Math.round(exact + slot.periodError));
	slot.periodError += exact - rounded;
	return rounded;
}

export function collectOwnedAyRegisters(frame: SongCaptureFrame): Set<number> {
	const owned = new Set<number>();
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const sampleActive = frame.sample[channelIndex]?.enabled === true;
		if (sampleActive || frame.sid[channelIndex]?.enabled) {
			owned.add(volumeRegisterIndex(channelIndex));
		}
		if (frame.syncbuzzer[channelIndex]?.enabled) {
			owned.add(ENVELOPE_SHAPE_REGISTER);
		}
		if (frame.fm[channelIndex]?.enabled) {
			owned.add(channelIndex * 2);
			owned.add(channelIndex * 2 + 1);
		}
		if (frame.envFm[channelIndex]?.enabled) {
			owned.add(11);
			owned.add(12);
		}
	}
	return owned;
}

function resolveNextWaveformIndex(stepIndex: number, length: number, loop: number): number {
	const nextStep = stepIndex + 1;
	if (nextStep < length) {
		return nextStep;
	}
	if (loop >= 0 && loop < length) {
		return loop;
	}
	return 0;
}

function normalizePeriodLow(period: number, periodLow: number): number {
	return periodLow > 0 ? periodLow : period;
}

function isPwmActive(pwm: boolean, period: number, periodLow: number): boolean {
	const low = normalizePeriodLow(period, periodLow);
	return pwm || period !== low;
}

function dutyIndexStepPeriod(
	stepIndex: number,
	pwm: boolean,
	period: number,
	periodLow: number,
	waveformLength: number
): number {
	const low = normalizePeriodLow(period, periodLow);
	if (isPwmActive(pwm, period, periodLow) && waveformLength >= 2) {
		return stepIndex % 2 === 0 ? Math.max(1, period) : Math.max(1, low);
	}
	return Math.max(1, period);
}

function arraysEqual(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sidConfigEqual(a: HardwareSidState, b: HardwareSidState): boolean {
	return (
		a.baseVolume === b.baseVolume &&
		a.waveformLoop === b.waveformLoop &&
		arraysEqual(a.waveform, b.waveform)
	);
}

function syncBuzzerConfigEqual(a: HardwareSyncBuzzerState, b: HardwareSyncBuzzerState): boolean {
	return a.waveformLoop === b.waveformLoop && arraysEqual(a.waveform, b.waveform);
}

function cloneSid(state: HardwareSidState): HardwareSidState {
	return { ...state, waveform: [...state.waveform] };
}

function cloneSyncBuzzer(state: HardwareSyncBuzzerState): HardwareSyncBuzzerState {
	return { ...state, waveform: [...state.waveform] };
}

function cloneFm(state: HardwareFmState): HardwareFmState {
	return { ...state, waveform: [...state.waveform] };
}

function cloneEnvFm(state: HardwareEnvFmState): HardwareEnvFmState {
	return { ...state, waveform: [...state.waveform] };
}

function writesAtSidStep(channelIndex: number, sid: HardwareSidState, stepIndex: number) {
	return [
		{
			register: volumeRegisterIndex(channelIndex),
			value: sidVolumeLevel(sid.waveform[stepIndex] ?? 0, sid.baseVolume)
		}
	];
}

function writesAtSyncBuzzerStep(syncbuzzer: HardwareSyncBuzzerState, stepIndex: number) {
	return [
		{
			register: ENVELOPE_SHAPE_REGISTER,
			value: (syncbuzzer.waveform[stepIndex] ?? 0) & 0xf
		}
	];
}

function writesAtFmStep(channelIndex: number, fm: HardwareFmState, stepIndex: number) {
	const psgData = new Array(14).fill(0);
	const tonePeriod = computeFmTonePeriod(
		fm.baseTonePeriod,
		fm.waveform[stepIndex] ?? 0,
		fm.fmOffsetMode
	);
	writeTonePeriodToPsgData(psgData, channelIndex, tonePeriod);
	const toneReg = channelIndex * 2;
	return [
		{ register: toneReg, value: psgData[toneReg]! },
		{ register: toneReg + 1, value: psgData[toneReg + 1]! }
	];
}

function writesAtEnvFmStep(envFm: HardwareEnvFmState, stepIndex: number) {
	const psgData = new Array(14).fill(0);
	const envelopePeriod = computeEnvFmEnvelopePeriod(
		envFm.baseEnvelopePeriod,
		envFm.waveform[stepIndex] ?? 0,
		envFm.fmOffsetMode
	);
	writeEnvelopePeriodToPsgData(psgData, envelopePeriod);
	return [
		{ register: 11, value: psgData[11]! },
		{ register: 12, value: psgData[12]! }
	];
}

function stepPeriodForSlot(slot: TimerSlotRuntime): number {
	if (slot.kind === 'sid' && slot.sid) {
		return Math.max(
			1,
			timerPwmStepPeriod(
				slot.sid.waveform[slot.position] ?? 0,
				slot.sid.period,
				slot.sid.periodLow
			)
		);
	}
	if (slot.kind === 'syncbuzzer' && slot.syncbuzzer) {
		return dutyIndexStepPeriod(
			slot.position,
			slot.syncbuzzer.pwm,
			slot.syncbuzzer.period,
			slot.syncbuzzer.periodLow,
			slot.syncbuzzer.waveform.length
		);
	}
	if (slot.kind === 'fm' && slot.fm) {
		return dutyIndexStepPeriod(
			slot.position,
			slot.fm.pwm,
			slot.fm.period,
			slot.fm.periodLow,
			slot.fm.waveform.length
		);
	}
	if (slot.kind === 'envFm' && slot.envFm) {
		return dutyIndexStepPeriod(
			slot.position,
			slot.envFm.pwm,
			slot.envFm.period,
			slot.envFm.periodLow,
			slot.envFm.waveform.length
		);
	}
	return 1;
}

function writesAtCurrentStep(slot: TimerSlotRuntime): { register: number; value: number }[] {
	if (slot.kind === 'sid' && slot.sid) {
		return writesAtSidStep(slot.channelIndex, slot.sid, slot.position);
	}
	if (slot.kind === 'syncbuzzer' && slot.syncbuzzer) {
		return writesAtSyncBuzzerStep(slot.syncbuzzer, slot.position);
	}
	if (slot.kind === 'fm' && slot.fm) {
		return writesAtFmStep(slot.channelIndex, slot.fm, slot.position);
	}
	if (slot.kind === 'envFm' && slot.envFm) {
		return writesAtEnvFmStep(slot.envFm, slot.position);
	}
	return [];
}

function waveformMeta(slot: TimerSlotRuntime): { length: number; loop: number } {
	if (slot.kind === 'sid' && slot.sid) {
		return { length: slot.sid.waveform.length, loop: slot.sid.waveformLoop };
	}
	if (slot.kind === 'syncbuzzer' && slot.syncbuzzer) {
		return { length: slot.syncbuzzer.waveform.length, loop: slot.syncbuzzer.waveformLoop };
	}
	if (slot.kind === 'fm' && slot.fm) {
		return { length: slot.fm.waveform.length, loop: slot.fm.waveformLoop };
	}
	if (slot.kind === 'envFm' && slot.envFm) {
		return { length: slot.envFm.waveform.length, loop: slot.envFm.waveformLoop };
	}
	return { length: 0, loop: 0 };
}

function pushWrites(
	out: AyTimedWrite[],
	sample: number,
	writes: { register: number; value: number }[]
): void {
	const quantized = Math.max(0, Math.round(sample));
	for (const write of writes) {
		out.push({ sample: quantized, register: write.register, value: write.value });
	}
}

function findSlot(
	runtime: AyTimerRuntime,
	kind: TimerSlotKind,
	channelIndex: number
): TimerSlotRuntime {
	return runtime.slots.find(
		(slot) => slot.kind === kind && slot.channelIndex === channelIndex
	)!;
}

function configureSidSlot(
	slot: TimerSlotRuntime,
	next: HardwareSidState,
	chipFrequency: number,
	frameStart: number,
	out: AyTimedWrite[]
): void {
	const wasEnabled = slot.enabled && slot.sid != null;
	const hardConfigChanged = !wasEnabled || !slot.sid || !sidConfigEqual(slot.sid, next);
	const previous = slot.sid;
	if (!next.enabled || next.waveform.length === 0 || next.period <= 0) {
		slot.enabled = false;
		slot.sid = cloneSid(next);
		return;
	}
	slot.sid = cloneSid(next);
	if (hardConfigChanged) {
		slot.enabled = true;
		slot.position = 0;
		slot.periodError = 0;
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
		slot.samplesUntilStep = takeIntegerStepSamples(
			slot,
			stepPeriodForSlot(slot),
			chipFrequency
		);
		return;
	}
	slot.enabled = true;
	if (previous && previous.baseVolume !== next.baseVolume) {
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
	}
}

function configureSyncBuzzerSlot(
	slot: TimerSlotRuntime,
	next: HardwareSyncBuzzerState,
	chipFrequency: number,
	frameStart: number,
	out: AyTimedWrite[]
): void {
	const wasEnabled = slot.enabled && slot.syncbuzzer != null;
	const hardConfigChanged =
		!wasEnabled || !slot.syncbuzzer || !syncBuzzerConfigEqual(slot.syncbuzzer, next);
	if (!next.enabled || next.waveform.length === 0 || next.period <= 0) {
		slot.enabled = false;
		slot.syncbuzzer = cloneSyncBuzzer(next);
		return;
	}
	slot.syncbuzzer = cloneSyncBuzzer(next);
	if (hardConfigChanged) {
		slot.enabled = true;
		slot.position = 0;
		slot.periodError = 0;
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
		slot.samplesUntilStep = takeIntegerStepSamples(
			slot,
			stepPeriodForSlot(slot),
			chipFrequency
		);
		return;
	}
	slot.enabled = true;
}

function configureFmSlot(
	slot: TimerSlotRuntime,
	next: HardwareFmState,
	chipFrequency: number,
	frameStart: number,
	out: AyTimedWrite[]
): void {
	const wasEnabled = slot.enabled && slot.fm != null;
	const hardConfigChanged =
		!wasEnabled ||
		!slot.fm ||
		!arraysEqual(slot.fm.waveform, next.waveform) ||
		slot.fm.waveformLoop !== next.waveformLoop ||
		slot.fm.fmOffsetMode !== next.fmOffsetMode;
	const previous = slot.fm;
	if (!next.enabled || next.waveform.length === 0 || next.period <= 0) {
		slot.enabled = false;
		slot.fm = cloneFm(next);
		return;
	}
	slot.fm = cloneFm(next);
	if (hardConfigChanged) {
		slot.enabled = true;
		slot.position = 0;
		slot.periodError = 0;
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
		slot.samplesUntilStep = takeIntegerStepSamples(
			slot,
			stepPeriodForSlot(slot),
			chipFrequency
		);
		return;
	}
	slot.enabled = true;
	if (previous && previous.baseTonePeriod !== next.baseTonePeriod) {
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
	}
}

function configureEnvFmSlot(
	slot: TimerSlotRuntime,
	next: HardwareEnvFmState,
	chipFrequency: number,
	frameStart: number,
	out: AyTimedWrite[]
): void {
	const wasEnabled = slot.enabled && slot.envFm != null;
	const hardConfigChanged =
		!wasEnabled ||
		!slot.envFm ||
		!arraysEqual(slot.envFm.waveform, next.waveform) ||
		slot.envFm.waveformLoop !== next.waveformLoop ||
		slot.envFm.fmOffsetMode !== next.fmOffsetMode;
	const previous = slot.envFm;
	if (!next.enabled || next.waveform.length === 0 || next.period <= 0) {
		slot.enabled = false;
		slot.envFm = cloneEnvFm(next);
		return;
	}
	slot.envFm = cloneEnvFm(next);
	if (hardConfigChanged) {
		slot.enabled = true;
		slot.position = 0;
		slot.periodError = 0;
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
		slot.samplesUntilStep = takeIntegerStepSamples(
			slot,
			stepPeriodForSlot(slot),
			chipFrequency
		);
		return;
	}
	slot.enabled = true;
	if (previous && previous.baseEnvelopePeriod !== next.baseEnvelopePeriod) {
		pushWrites(out, frameStart, writesAtCurrentStep(slot));
	}
}

function advanceSlot(
	slot: TimerSlotRuntime,
	chipFrequency: number,
	frameStart: number,
	frameEnd: number,
	out: AyTimedWrite[]
): void {
	if (!slot.enabled) {
		return;
	}
	const meta = waveformMeta(slot);
	if (meta.length <= 0) {
		slot.enabled = false;
		return;
	}

	let cursor = frameStart;
	let remaining = slot.samplesUntilStep;
	while (cursor + remaining < frameEnd) {
		cursor += remaining;
		slot.position = resolveNextWaveformIndex(slot.position, meta.length, meta.loop);
		pushWrites(out, cursor, writesAtCurrentStep(slot));
		remaining = takeIntegerStepSamples(slot, stepPeriodForSlot(slot), chipFrequency);
	}
	slot.samplesUntilStep = remaining - (frameEnd - cursor);
}

function disabledSid(): HardwareSidState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseVolume: 0,
		waveform: [],
		waveformLoop: 0
	};
}

function disabledSyncBuzzer(): HardwareSyncBuzzerState {
	return { enabled: false, pwm: false, period: 0, periodLow: 0, waveform: [], waveformLoop: 0 };
}

function disabledFm(): HardwareFmState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseTonePeriod: 0,
		fmOffsetMode: 'semitone',
		waveform: [],
		waveformLoop: 0
	};
}

function disabledEnvFm(): HardwareEnvFmState {
	return {
		enabled: false,
		pwm: false,
		period: 0,
		periodLow: 0,
		baseEnvelopePeriod: 0,
		fmOffsetMode: 'semitone',
		waveform: [],
		waveformLoop: 0
	};
}

export function expandAyFrameTimerWrites(
	frame: SongCaptureFrame,
	runtime: AyTimerRuntime,
	chipFrequency: number,
	frameStartSample: number,
	frameEndSample: number
): AyTimedWrite[] {
	const out: AyTimedWrite[] = [];

	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const sampleActive = frame.sample[channelIndex]?.enabled === true;
		const sid =
			!sampleActive && frame.sid[channelIndex]?.enabled
				? frame.sid[channelIndex]!
				: disabledSid();
		const syncbuzzer = frame.syncbuzzer[channelIndex]?.enabled
			? frame.syncbuzzer[channelIndex]!
			: disabledSyncBuzzer();
		const fm = frame.fm[channelIndex]?.enabled ? frame.fm[channelIndex]! : disabledFm();
		const envFm = frame.envFm[channelIndex]?.enabled
			? frame.envFm[channelIndex]!
			: disabledEnvFm();

		configureSidSlot(
			findSlot(runtime, 'sid', channelIndex),
			sid,
			chipFrequency,
			frameStartSample,
			out
		);
		configureSyncBuzzerSlot(
			findSlot(runtime, 'syncbuzzer', channelIndex),
			syncbuzzer,
			chipFrequency,
			frameStartSample,
			out
		);
		configureFmSlot(
			findSlot(runtime, 'fm', channelIndex),
			fm,
			chipFrequency,
			frameStartSample,
			out
		);
		configureEnvFmSlot(
			findSlot(runtime, 'envFm', channelIndex),
			envFm,
			chipFrequency,
			frameStartSample,
			out
		);
	}

	for (const slot of runtime.slots) {
		advanceSlot(slot, chipFrequency, frameStartSample, frameEndSample, out);
	}

	out.sort((a, b) => a.sample - b.sample || a.register - b.register);
	return out;
}

export function samplesForTimerPeriod(period: number, chipFrequency: number): number {
	return samplesForYmPeriod(period, chipFrequency);
}
