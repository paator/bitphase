import {
	AY_TIMER_PWM_DUTY_MAX,
	AY_TIMER_PWM_SWEEP_SHAPES,
	AY_TIMER_PWM_SWEEP_START_PHASE_MAX,
	clampTimerPwmDuty,
	clampTimerPwmSweep,
	clampTimerPwmSweepMin,
	clampTimerPwmSweepStartPhase,
	DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE,
	resolveTimerPwmSweepShape
} from './ay-instrument-utils.js';

export const AY_TIMER_PWM_MIN_SUBCOMMAND = 1;
export const AY_TIMER_PWM_MAX_SUBCOMMAND = 2;
export const AY_TIMER_PWM_SWEEP_SUBCOMMAND = 3;
export const AY_TIMER_PWM_SHAPE_SUBCOMMAND = 4;
export const AY_TIMER_PWM_START_SUBCOMMAND = 5;
export const AY_AUTO_ENVELOPE_SUBCOMMAND = 0xa;
export const AY_TIMER_PWM_OVERRIDE_INACTIVE = -1;
export const AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE = null;

export function isAyTimerPwmMinEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_MIN_SUBCOMMAND
	);
}

export function isAyTimerPwmMaxEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_MAX_SUBCOMMAND
	);
}

export function isAyTimerPwmSweepEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_SWEEP_SUBCOMMAND
	);
}

export function isAyTimerPwmShapeEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_SHAPE_SUBCOMMAND
	);
}

export function isAyTimerPwmStartEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_TIMER_PWM_START_SUBCOMMAND
	);
}

export function isAyTimerPwmEffect(effect) {
	return (
		isAyTimerPwmMinEffect(effect) ||
		isAyTimerPwmMaxEffect(effect) ||
		isAyTimerPwmSweepEffect(effect) ||
		isAyTimerPwmShapeEffect(effect) ||
		isAyTimerPwmStartEffect(effect)
	);
}

export function isAyAutoEnvelopeEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === AY_AUTO_ENVELOPE_SUBCOMMAND
	);
}

export function mapHexParameterToTimerPwmPercent(parameter) {
	return Math.round(((parameter & 0xff) * AY_TIMER_PWM_DUTY_MAX) / 255);
}

export function mapTimerPwmPercentToHexParameter(percent) {
	const clamped = Math.max(0, Math.min(AY_TIMER_PWM_DUTY_MAX, Math.round(percent)));
	return Math.round((clamped * 255) / AY_TIMER_PWM_DUTY_MAX) & 0xff;
}

export function mapHexParameterToTimerPwmSweepShape(parameter) {
	const shapes = AY_TIMER_PWM_SWEEP_SHAPES;
	const index = (parameter & 0xff) % shapes.length;
	return shapes[index] ?? DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE;
}

export function mapHexParameterToTimerPwmSweepStartPhase(parameter) {
	return clampTimerPwmSweepStartPhase(
		Math.round(((parameter & 0xff) * AY_TIMER_PWM_SWEEP_START_PHASE_MAX) / 255)
	);
}

export function resetAyChannelTimerPwmOverrides(state, channelIndex) {
	if (!state.channelTimerPwmDutyOverride) return;
	state.channelTimerPwmDutyOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	state.channelTimerPwmSweepMinOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	state.channelTimerPwmSweepOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	if (state.channelTimerPwmSweepShapeOverride) {
		state.channelTimerPwmSweepShapeOverride[channelIndex] = AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE;
	}
	if (state.channelTimerPwmSweepStartPhaseOverride) {
		state.channelTimerPwmSweepStartPhaseOverride[channelIndex] = AY_TIMER_PWM_OVERRIDE_INACTIVE;
	}
}

export function processAyTimerPwmEffect(state, channelIndex, row) {
	const effects = row.effects;
	if (!effects) return;
	for (const effect of effects) {
		if (!isAyTimerPwmEffect(effect)) continue;
		applyAyTimerPwmEffect(state, channelIndex, effect);
	}
}

function applyAyTimerPwmEffect(state, channelIndex, effect) {
	if (isAyTimerPwmMinEffect(effect)) {
		state.channelTimerPwmSweepMinOverride[channelIndex] = clampTimerPwmDuty(
			mapHexParameterToTimerPwmPercent(effect.parameter)
		);
		return;
	}
	if (isAyTimerPwmMaxEffect(effect)) {
		state.channelTimerPwmDutyOverride[channelIndex] = clampTimerPwmDuty(
			mapHexParameterToTimerPwmPercent(effect.parameter)
		);
		return;
	}
	if (isAyTimerPwmSweepEffect(effect)) {
		state.channelTimerPwmSweepOverride[channelIndex] = clampTimerPwmSweep(
			mapHexParameterToTimerPwmPercent(effect.parameter)
		);
		return;
	}
	if (isAyTimerPwmShapeEffect(effect)) {
		state.channelTimerPwmSweepShapeOverride[channelIndex] = mapHexParameterToTimerPwmSweepShape(
			effect.parameter
		);
		return;
	}

	const startPhase = mapHexParameterToTimerPwmSweepStartPhase(effect.parameter);
	state.channelTimerPwmSweepStartPhaseOverride[channelIndex] = startPhase;
	if (state.channelTimerPwmSweep) {
		state.channelTimerPwmSweep[channelIndex] = startPhase;
	}
}

export function resolveChannelTimerPwmDuty(state, channelIndex, instrumentDuty) {
	const override = state.channelTimerPwmDutyOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmDuty(instrumentDuty);
	}
	return clampTimerPwmDuty(override);
}

export function resolveChannelTimerPwmSweep(state, channelIndex, instrumentSweep) {
	const override = state.channelTimerPwmSweepOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmSweep(instrumentSweep);
	}
	return clampTimerPwmSweep(override);
}

export function resolveChannelTimerPwmSweepMin(state, channelIndex, instrumentMin, maxDuty) {
	const override = state.channelTimerPwmSweepMinOverride?.[channelIndex];
	const min =
		override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE
			? instrumentMin
			: override;
	return clampTimerPwmSweepMin(min, maxDuty);
}

export function resolveChannelTimerPwmSweepShape(state, channelIndex, instrumentShape) {
	const override = state.channelTimerPwmSweepShapeOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_SHAPE_OVERRIDE_INACTIVE) {
		return resolveTimerPwmSweepShape(instrumentShape);
	}
	return resolveTimerPwmSweepShape(override);
}

export function resolveChannelTimerPwmSweepStartPhase(state, channelIndex, instrumentPhase) {
	const override = state.channelTimerPwmSweepStartPhaseOverride?.[channelIndex];
	if (override === undefined || override === AY_TIMER_PWM_OVERRIDE_INACTIVE) {
		return clampTimerPwmSweepStartPhase(instrumentPhase);
	}
	return clampTimerPwmSweepStartPhase(override);
}
