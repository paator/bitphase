export const NES_PULSE_WIDTH_CYCLE_SUBCOMMAND = 1;
export const NES_SWEEP_UP_SUBCOMMAND = 2;
export const NES_SWEEP_DOWN_SUBCOMMAND = 3;

export function isNesPulseWidthCycleEffect(effect: {
	effect: number;
	delay: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_PULSE_WIDTH_CYCLE_SUBCOMMAND
	);
}

export function isNesPulseWidthTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		isNesPulseWidthCycleEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isNesSweepUpEffect(effect: { effect: number; delay: number }): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_SWEEP_UP_SUBCOMMAND
	);
}

export function isNesSweepDownEffect(effect: { effect: number; delay: number }): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_SWEEP_DOWN_SUBCOMMAND
	);
}

export function isNesSweepUpTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		isNesSweepUpEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isNesSweepDownTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		isNesSweepDownEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isNesSweepEffect(effect: { effect: number; delay: number }): boolean {
	return isNesSweepUpEffect(effect) || isNesSweepDownEffect(effect);
}

export function describeNesEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): string | null {
	const table = effect.tableIndex !== undefined && effect.tableIndex >= 0;
	if (isNesPulseWidthCycleEffect(effect)) {
		return table
			? 'E1TY: Pulse Width (Y: table)'
			: 'E1XY: Pulse Width (XY: duty, 00=inst)';
	}
	if (isNesSweepUpEffect(effect)) {
		return table
			? 'E2TY: Sweep Up (Y: table)'
			: 'E2XY: Sweep Up (X: time; Y: shift)';
	}
	if (isNesSweepDownEffect(effect)) {
		return table
			? 'E3TY: Sweep Down (Y: table)'
			: 'E3XY: Sweep Down (X: time; Y: shift)';
	}
	return null;
}
