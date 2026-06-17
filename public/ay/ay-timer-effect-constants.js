export const TIMER_EFFECT_KIND_NONE = 0;
export const TIMER_EFFECT_KIND_VOLUME = 1;
export const TIMER_EFFECT_KIND_ENVELOPE_SHAPE = 2;
export const TIMER_EFFECT_KIND_TONE = 3;
export const TIMER_EFFECT_KIND_ENVELOPE_PERIOD = 4;

export const TIMER_PWM_MODE_OFF = 0;
export const TIMER_PWM_MODE_BY_STEP_VALUE = 1;
export const TIMER_PWM_MODE_BY_DUTY_INDEX = 2;

export const TIMER_FM_OFFSET_SEMITONE = 0;
export const TIMER_FM_OFFSET_PERIOD = 1;

export const TIMER_EFFECT_SLOT_SID = 0;
export const TIMER_EFFECT_SLOT_SYNCBUZZER = 1;
export const TIMER_EFFECT_SLOT_FM = 2;
export const TIMER_EFFECT_SLOT_ENV_FM = 3;
export const TIMER_EFFECT_SLOT_COUNT = 4;

export const TIMER_EFFECT_SLOT_KEYS = ['sid', 'syncbuzzer', 'fm', 'envFm'];

export function timerEffectSlotIndex(key) {
	switch (key) {
		case 'sid':
			return TIMER_EFFECT_SLOT_SID;
		case 'syncbuzzer':
			return TIMER_EFFECT_SLOT_SYNCBUZZER;
		case 'fm':
			return TIMER_EFFECT_SLOT_FM;
		case 'envFm':
			return TIMER_EFFECT_SLOT_ENV_FM;
		default:
			return TIMER_EFFECT_SLOT_SID;
	}
}

export function createDefaultChannelTimerEffects() {
	return {
		sid: createDefaultTimerEffect(),
		syncbuzzer: createDefaultTimerEffect(),
		fm: createDefaultTimerEffect(),
		envFm: createDefaultTimerEffect()
	};
}

export function ensureChannelTimerEffects(channel) {
	if (!channel.timerEffects) {
		channel.timerEffects = createDefaultChannelTimerEffects();
	}
	return channel.timerEffects;
}

export function disableAllChannelTimerEffects(channelTimerEffects) {
	if (!channelTimerEffects) {
		return;
	}
	disableTimerEffect(channelTimerEffects.sid);
	disableTimerEffect(channelTimerEffects.syncbuzzer);
	disableTimerEffect(channelTimerEffects.fm);
	disableTimerEffect(channelTimerEffects.envFm);
}

export function resolveTimerFmOffsetMode(mode) {
	return mode === TIMER_FM_OFFSET_PERIOD || mode === 'period'
		? TIMER_FM_OFFSET_PERIOD
		: TIMER_FM_OFFSET_SEMITONE;
}

export function createDefaultTimerEffect() {
	return {
		enabled: false,
		kind: TIMER_EFFECT_KIND_NONE,
		pwmMode: TIMER_PWM_MODE_OFF,
		period: 100,
		periodLow: 100,
		baseVolume: 0,
		baseTonePeriod: 1,
		fmOffsetMode: TIMER_FM_OFFSET_SEMITONE,
		waveform: [15, 0],
		waveformLoop: 0,
		resetPhase: false
	};
}

export function createVolumeTimerEffect({
	enabled = false,
	pwm = false,
	pwmByDutyIndex = false,
	period = 100,
	periodLow = period,
	baseVolume = 0,
	waveform = [15, 0],
	waveformLoop = 0,
	resetPhase = false
} = {}) {
	return {
		enabled,
		kind: enabled ? TIMER_EFFECT_KIND_VOLUME : TIMER_EFFECT_KIND_NONE,
		pwmMode: pwmByDutyIndex
			? TIMER_PWM_MODE_BY_DUTY_INDEX
			: pwm
				? TIMER_PWM_MODE_BY_STEP_VALUE
				: TIMER_PWM_MODE_OFF,
		period,
		periodLow,
		baseVolume,
		baseTonePeriod: 1,
		fmOffsetMode: TIMER_FM_OFFSET_SEMITONE,
		waveform: [...waveform],
		waveformLoop,
		resetPhase
	};
}

export function createToneTimerEffect({
	enabled = false,
	pwm = false,
	period = 100,
	periodLow = period,
	baseTonePeriod = 1,
	fmOffsetMode = TIMER_FM_OFFSET_SEMITONE,
	waveform = [0, 7],
	waveformLoop = 0,
	resetPhase = false
} = {}) {
	return {
		enabled,
		kind: enabled ? TIMER_EFFECT_KIND_TONE : TIMER_EFFECT_KIND_NONE,
		pwmMode: pwm ? TIMER_PWM_MODE_BY_DUTY_INDEX : TIMER_PWM_MODE_OFF,
		period,
		periodLow,
		baseVolume: 0,
		baseTonePeriod,
		fmOffsetMode: resolveTimerFmOffsetMode(fmOffsetMode),
		waveform: [...waveform],
		waveformLoop,
		resetPhase
	};
}

export function createEnvelopePeriodTimerEffect({
	enabled = false,
	pwm = false,
	period = 100,
	periodLow = period,
	baseEnvelopePeriod = 1,
	fmOffsetMode = TIMER_FM_OFFSET_SEMITONE,
	waveform = [0, 7],
	waveformLoop = 0,
	resetPhase = false
} = {}) {
	return {
		enabled,
		kind: enabled ? TIMER_EFFECT_KIND_ENVELOPE_PERIOD : TIMER_EFFECT_KIND_NONE,
		pwmMode: pwm ? TIMER_PWM_MODE_BY_DUTY_INDEX : TIMER_PWM_MODE_OFF,
		period,
		periodLow,
		baseVolume: 0,
		baseTonePeriod: baseEnvelopePeriod,
		fmOffsetMode: resolveTimerFmOffsetMode(fmOffsetMode),
		waveform: [...waveform],
		waveformLoop,
		resetPhase
	};
}

export function createEnvelopeShapeTimerEffect({
	enabled = false,
	pwm = false,
	period = 100,
	periodLow = period,
	waveform = [8],
	waveformLoop = 0,
	resetPhase = false
} = {}) {
	return {
		enabled,
		kind: enabled ? TIMER_EFFECT_KIND_ENVELOPE_SHAPE : TIMER_EFFECT_KIND_NONE,
		pwmMode: pwm ? TIMER_PWM_MODE_BY_DUTY_INDEX : TIMER_PWM_MODE_OFF,
		period,
		periodLow,
		baseVolume: 0,
		baseTonePeriod: 1,
		fmOffsetMode: TIMER_FM_OFFSET_SEMITONE,
		waveform: [...waveform],
		waveformLoop,
		resetPhase
	};
}

export function disableTimerEffect(timerEffect) {
	timerEffect.enabled = false;
	timerEffect.kind = TIMER_EFFECT_KIND_NONE;
	timerEffect.pwmMode = TIMER_PWM_MODE_OFF;
	timerEffect.resetPhase = false;
}

export function copyTimerEffect(timerEffect) {
	return {
		enabled: timerEffect.enabled,
		kind: timerEffect.kind ?? TIMER_EFFECT_KIND_NONE,
		pwmMode: timerEffect.pwmMode ?? 0,
		period: timerEffect.period,
		periodLow: timerEffect.periodLow ?? timerEffect.period,
		baseVolume: timerEffect.baseVolume ?? 0,
		baseTonePeriod: timerEffect.baseTonePeriod ?? 1,
		fmOffsetMode: timerEffect.fmOffsetMode ?? 0,
		waveform: [...(timerEffect.waveform ?? [15, 0])],
		waveformLoop: timerEffect.waveformLoop ?? 0,
		resetPhase: timerEffect.resetPhase ?? false
	};
}

export function copyChannelTimerEffects(timerEffects) {
	return {
		sid: copyTimerEffect(timerEffects.sid),
		syncbuzzer: copyTimerEffect(timerEffects.syncbuzzer),
		fm: copyTimerEffect(timerEffects.fm),
		envFm: copyTimerEffect(timerEffects.envFm)
	};
}
