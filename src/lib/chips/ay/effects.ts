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

export type AyTimerPwmSweepShapeCommand =
	(typeof AY_TIMER_PWM_SWEEP_SHAPE_BY_INDEX)[number];

export function isAyTimerPwmMinEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_MIN_SUBCOMMAND
	);
}

export function isAyTimerPwmMaxEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_MAX_SUBCOMMAND
	);
}

export function isAyTimerPwmSweepEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_SWEEP_SUBCOMMAND
	);
}

export function isAyTimerPwmShapeEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_SHAPE_SUBCOMMAND
	);
}

export function isAyTimerPwmStartEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_TIMER_PWM_START_SUBCOMMAND
	);
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
	return (
		isAyTimerPwmEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function describeAyEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): string | null {
	const table = effect.tableIndex !== undefined && effect.tableIndex >= 0;
	if (isAyTimerPwmMinEffect(effect)) {
		return table
			? 'E1TY: PWM Min (Y: table)'
			: 'E1XY: PWM Min (XY: duty)';
	}
	if (isAyTimerPwmMaxEffect(effect)) {
		return table
			? 'E2TY: PWM Max (Y: table)'
			: 'E2XY: PWM Max (XY: duty)';
	}
	if (isAyTimerPwmSweepEffect(effect)) {
		return table
			? 'E3TY: PWM Sweep (Y: table)'
			: 'E3XY: PWM Sweep (XY: speed)';
	}
	if (isAyTimerPwmShapeEffect(effect)) {
		return table
			? 'E4TY: PWM Shape (Y: table)'
			: 'E4XY: PWM Shape (XY: shape)';
	}
	if (isAyTimerPwmStartEffect(effect)) {
		return table
			? 'E5TY: PWM Start (Y: table)'
			: 'E5XY: PWM Start (XY: phase)';
	}
	if (isAyAutoEnvelopeEffect(effect)) {
		return 'EAXY: Auto-Envelope (X: num; Y: den)';
	}
	return null;
}

export function isAyAutoEnvelopeEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === AY_AUTO_ENVELOPE_SUBCOMMAND
	);
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
