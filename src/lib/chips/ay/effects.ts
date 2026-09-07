import { formatEffectStatusHint, type EffectStatusHint } from '../base/effect-status';

export const AY_TIMER_PWM_MIN_SUBCOMMAND = 1;
export const AY_TIMER_PWM_MAX_SUBCOMMAND = 2;
export const AY_TIMER_PWM_SWEEP_SUBCOMMAND = 3;
export const AY_TIMER_PWM_SHAPE_SUBCOMMAND = 4;
export const AY_TIMER_PWM_START_SUBCOMMAND = 5;
export const AY_AUTO_ENVELOPE_SUBCOMMAND = 0xa;

export const AY_TIMER_PWM_SWEEP_SHAPE_BY_INDEX = [
	'triangle',
	'sine',
	'sawUp',
	'sawDown',
	'square'
] as const;

export type AyTimerPwmSweepShapeCommand = (typeof AY_TIMER_PWM_SWEEP_SHAPE_BY_INDEX)[number];

export function isAyTimerPwmMinEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_MIN_SUBCOMMAND;
}

export function isAyTimerPwmMaxEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_MAX_SUBCOMMAND;
}

export function isAyTimerPwmSweepEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_SWEEP_SUBCOMMAND;
}

export function isAyTimerPwmShapeEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_SHAPE_SUBCOMMAND;
}

export function isAyTimerPwmStartEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_START_SUBCOMMAND;
}

export function isAyTimerPwmEffect(effect: { effect: number; delay: number }): boolean {
	return (
		isAyTimerPwmMinEffect(effect) ||
		isAyTimerPwmMaxEffect(effect) ||
		isAyTimerPwmSweepEffect(effect) ||
		isAyTimerPwmShapeEffect(effect) ||
		isAyTimerPwmStartEffect(effect)
	);
}

export function isAyTimerPwmTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return isAyTimerPwmEffect(effect) && effect.tableIndex !== undefined && effect.tableIndex >= 0;
}

const AY_PWM_MIN_HINT: EffectStatusHint = {
	format: 'E1XY',
	name: 'PWM Min',
	params: 'XY: duty'
};
const AY_PWM_MIN_TABLE_HINT: EffectStatusHint = {
	format: 'E1TY',
	name: 'PWM Min',
	params: 'Y: table'
};
const AY_PWM_MAX_HINT: EffectStatusHint = {
	format: 'E2XY',
	name: 'PWM Max',
	params: 'XY: duty'
};
const AY_PWM_MAX_TABLE_HINT: EffectStatusHint = {
	format: 'E2TY',
	name: 'PWM Max',
	params: 'Y: table'
};
const AY_PWM_SWEEP_HINT: EffectStatusHint = {
	format: 'E3XY',
	name: 'PWM Sweep',
	params: 'XY: speed'
};
const AY_PWM_SWEEP_TABLE_HINT: EffectStatusHint = {
	format: 'E3TY',
	name: 'PWM Sweep',
	params: 'Y: table'
};
const AY_PWM_SHAPE_HINT: EffectStatusHint = {
	format: 'E4XY',
	name: 'PWM Shape',
	params: 'XY: shape'
};
const AY_PWM_SHAPE_TABLE_HINT: EffectStatusHint = {
	format: 'E4TY',
	name: 'PWM Shape',
	params: 'Y: table'
};
const AY_PWM_START_HINT: EffectStatusHint = {
	format: 'E5XY',
	name: 'PWM Start',
	params: 'XY: phase'
};
const AY_PWM_START_TABLE_HINT: EffectStatusHint = {
	format: 'E5TY',
	name: 'PWM Start',
	params: 'Y: table'
};
const AY_AUTO_ENVELOPE_HINT: EffectStatusHint = {
	format: 'EAXY',
	name: 'Auto-Envelope',
	params: 'X: num; Y: den'
};

const AY_EFFECT_STATUS_HINTS: EffectStatusHint[] = [
	AY_PWM_MIN_HINT,
	AY_PWM_MIN_TABLE_HINT,
	AY_PWM_MAX_HINT,
	AY_PWM_MAX_TABLE_HINT,
	AY_PWM_SWEEP_HINT,
	AY_PWM_SWEEP_TABLE_HINT,
	AY_PWM_SHAPE_HINT,
	AY_PWM_SHAPE_TABLE_HINT,
	AY_PWM_START_HINT,
	AY_PWM_START_TABLE_HINT,
	AY_AUTO_ENVELOPE_HINT
];

export function describeAyEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): string | null {
	const table = effect.tableIndex !== undefined && effect.tableIndex >= 0;
	if (isAyTimerPwmMinEffect(effect)) {
		return formatEffectStatusHint(table ? AY_PWM_MIN_TABLE_HINT : AY_PWM_MIN_HINT);
	}
	if (isAyTimerPwmMaxEffect(effect)) {
		return formatEffectStatusHint(table ? AY_PWM_MAX_TABLE_HINT : AY_PWM_MAX_HINT);
	}
	if (isAyTimerPwmSweepEffect(effect)) {
		return formatEffectStatusHint(table ? AY_PWM_SWEEP_TABLE_HINT : AY_PWM_SWEEP_HINT);
	}
	if (isAyTimerPwmShapeEffect(effect)) {
		return formatEffectStatusHint(table ? AY_PWM_SHAPE_TABLE_HINT : AY_PWM_SHAPE_HINT);
	}
	if (isAyTimerPwmStartEffect(effect)) {
		return formatEffectStatusHint(table ? AY_PWM_START_TABLE_HINT : AY_PWM_START_HINT);
	}
	if (isAyAutoEnvelopeEffect(effect)) {
		return formatEffectStatusHint(AY_AUTO_ENVELOPE_HINT);
	}
	return null;
}

export function listAyEffectStatusHints(): EffectStatusHint[] {
	return AY_EFFECT_STATUS_HINTS;
}

export function isAyAutoEnvelopeEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_AUTO_ENVELOPE_SUBCOMMAND;
}

export function mapHexParameterToTimerPwmPercent(parameter: number): number {
	return Math.round(((parameter & 0xff) * 100) / 255);
}

export function mapTimerPwmPercentToHexParameter(percent: number): number {
	const clamped = Math.max(0, Math.min(100, Math.round(percent)));
	return Math.round((clamped * 255) / 100) & 0xff;
}

export function mapHexParameterToTimerPwmSweepShape(
	parameter: number
): AyTimerPwmSweepShapeCommand {
	const index = (parameter & 0xff) % AY_TIMER_PWM_SWEEP_SHAPE_BY_INDEX.length;
	return AY_TIMER_PWM_SWEEP_SHAPE_BY_INDEX[index]!;
}

export function mapHexParameterToTimerPwmSweepStartPhase(parameter: number): number {
	return Math.round(((parameter & 0xff) * 1000) / 255);
}
