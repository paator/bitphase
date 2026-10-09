import { formatEffectStatusHint, type EffectStatusHint } from '../base/effect-status';

export const NES_PULSE_WIDTH_CYCLE_SUBCOMMAND = 1;
export const NES_SWEEP_UP_SUBCOMMAND = 2;
export const NES_SWEEP_DOWN_SUBCOMMAND = 3;
export const NES_DELTA_COUNTER_SUBCOMMAND = 4;
export const NES_LENGTH_COUNTER_SUBCOMMAND = 5;
export const NES_ENVELOPE_MODE_SUBCOMMAND = 6;
export const NES_DPCM_PITCH_SUBCOMMAND = 7;

export function isNesPulseWidthCycleEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_PULSE_WIDTH_CYCLE_SUBCOMMAND;
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
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_SWEEP_UP_SUBCOMMAND;
}

export function isNesSweepDownEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_SWEEP_DOWN_SUBCOMMAND;
}

export function isNesSweepUpTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return isNesSweepUpEffect(effect) && effect.tableIndex !== undefined && effect.tableIndex >= 0;
}

export function isNesSweepDownTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		isNesSweepDownEffect(effect) && effect.tableIndex !== undefined && effect.tableIndex >= 0
	);
}

export function isNesSweepEffect(effect: { effect: number; delay: number }): boolean {
	return isNesSweepUpEffect(effect) || isNesSweepDownEffect(effect);
}

export function isNesDeltaCounterEffect(effect: { effect: number; delay: number }): boolean {
	return effect.effect === 'E'.charCodeAt(0) && effect.delay === NES_DELTA_COUNTER_SUBCOMMAND;
}

export function isNesDeltaCounterTableEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		isNesDeltaCounterEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function isNesLengthCounterEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_LENGTH_COUNTER_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

export function isNesEnvelopeModeEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_ENVELOPE_MODE_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

export function isNesDpcmPitchEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): boolean {
	return (
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_DPCM_PITCH_SUBCOMMAND &&
		(effect.tableIndex === undefined || effect.tableIndex < 0)
	);
}

const NES_PULSE_WIDTH_HINT: EffectStatusHint = {
	format: 'E1XY',
	name: 'Pulse Width',
	params: 'XY: duty, 00=inst'
};
const NES_PULSE_WIDTH_TABLE_HINT: EffectStatusHint = {
	format: 'E1TY',
	name: 'Pulse Width',
	params: 'Y: table'
};
const NES_SWEEP_UP_HINT: EffectStatusHint = {
	format: 'E2XY',
	name: 'Sweep Up',
	params: 'X: time; Y: shift'
};
const NES_SWEEP_UP_TABLE_HINT: EffectStatusHint = {
	format: 'E2TY',
	name: 'Sweep Up',
	params: 'Y: table'
};
const NES_SWEEP_DOWN_HINT: EffectStatusHint = {
	format: 'E3XY',
	name: 'Sweep Down',
	params: 'X: time; Y: shift'
};
const NES_SWEEP_DOWN_TABLE_HINT: EffectStatusHint = {
	format: 'E3TY',
	name: 'Sweep Down',
	params: 'Y: table'
};
const NES_DELTA_COUNTER_HINT: EffectStatusHint = {
	format: 'E4XY',
	name: 'Delta Counter',
	params: 'XY: 00-7F, DPCM'
};
const NES_DELTA_COUNTER_TABLE_HINT: EffectStatusHint = {
	format: 'E4TY',
	name: 'Delta Counter',
	params: 'Y: table'
};
const NES_LENGTH_COUNTER_HINT: EffectStatusHint = {
	format: 'E5XY',
	name: 'Length Counter',
	params: 'XY: 00-1F'
};
const NES_ENVELOPE_MODE_HINT: EffectStatusHint = {
	format: 'E6XY',
	name: 'Envelope Mode',
	params: 'XY: 0-3'
};
const NES_DPCM_PITCH_HINT: EffectStatusHint = {
	format: 'E7XY',
	name: 'DPCM Frequency',
	params: 'XY: 00-0F'
};

const NES_EFFECT_STATUS_HINTS: EffectStatusHint[] = [
	NES_PULSE_WIDTH_HINT,
	NES_PULSE_WIDTH_TABLE_HINT,
	NES_SWEEP_UP_HINT,
	NES_SWEEP_UP_TABLE_HINT,
	NES_SWEEP_DOWN_HINT,
	NES_SWEEP_DOWN_TABLE_HINT,
	NES_DELTA_COUNTER_HINT,
	NES_DELTA_COUNTER_TABLE_HINT,
	NES_LENGTH_COUNTER_HINT,
	NES_ENVELOPE_MODE_HINT,
	NES_DPCM_PITCH_HINT
];

export function describeNesEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): string | null {
	const table = effect.tableIndex !== undefined && effect.tableIndex >= 0;
	if (isNesPulseWidthCycleEffect(effect)) {
		return formatEffectStatusHint(table ? NES_PULSE_WIDTH_TABLE_HINT : NES_PULSE_WIDTH_HINT);
	}
	if (isNesSweepUpEffect(effect)) {
		return formatEffectStatusHint(table ? NES_SWEEP_UP_TABLE_HINT : NES_SWEEP_UP_HINT);
	}
	if (isNesSweepDownEffect(effect)) {
		return formatEffectStatusHint(table ? NES_SWEEP_DOWN_TABLE_HINT : NES_SWEEP_DOWN_HINT);
	}
	if (isNesDeltaCounterEffect(effect)) {
		return formatEffectStatusHint(
			table ? NES_DELTA_COUNTER_TABLE_HINT : NES_DELTA_COUNTER_HINT
		);
	}
	if (isNesLengthCounterEffect(effect)) {
		return formatEffectStatusHint(NES_LENGTH_COUNTER_HINT);
	}
	if (isNesEnvelopeModeEffect(effect)) {
		return formatEffectStatusHint(NES_ENVELOPE_MODE_HINT);
	}
	if (isNesDpcmPitchEffect(effect)) {
		return formatEffectStatusHint(NES_DPCM_PITCH_HINT);
	}
	return null;
}

export function listNesEffectStatusHints(): EffectStatusHint[] {
	return NES_EFFECT_STATUS_HINTS;
}
