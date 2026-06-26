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
const TIMER_PWM_MODE_BY_STEP_VALUE = 1;
const TIMER_PWM_MODE_BY_DUTY_INDEX = 2;

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

export type SongCaptureFrame = {
	registers: number[];
	sid: HardwareSidState[];
	syncbuzzer: HardwareSyncBuzzerState[];
	fm: HardwareFmState[];
	envFm: HardwareEnvFmState[];
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

export function sidVolumeLevel(waveformStep: number, baseVolume: number): number {
	const w = waveformStep & 0xf;
	if (w === 0) {
		return 0;
	}
	const vol = Math.floor((w * baseVolume + 14) / 15);
	return Math.min(15, vol);
}

export { isTimerWaveformLowPhase, timerPwmStepPeriod } from '../../chips/ay/instrument';

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

export function createDisabledTimerCaptureStates(): {
	sid: HardwareSidState[];
	syncbuzzer: HardwareSyncBuzzerState[];
	fm: HardwareFmState[];
	envFm: HardwareEnvFmState[];
} {
	return {
		sid: Array.from({ length: TONE_CHANNELS }, createDisabledSidState),
		syncbuzzer: Array.from({ length: TONE_CHANNELS }, createDisabledSyncBuzzerState),
		fm: Array.from({ length: TONE_CHANNELS }, createDisabledFmState),
		envFm: Array.from({ length: TONE_CHANNELS }, createDisabledEnvFmState)
	};
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
		const enabled =
			!!timerEffect?.enabled && timerEffect.kind === TIMER_EFFECT_KIND_VOLUME;
		result.push({
			enabled,
			pwm: enabled && timerEffect.pwmMode === TIMER_PWM_MODE_BY_STEP_VALUE,
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
