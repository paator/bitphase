import { NES_PULSE_WIDTHS } from './nes-instrument-utils.js';

export const NES_PULSE_WIDTH_CYCLE_SUBCOMMAND = 1;
const PULSE_WIDTH_COUNT = NES_PULSE_WIDTHS.length;

export function isNesPulseWidthCycleEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_PULSE_WIDTH_CYCLE_SUBCOMMAND
	);
}

export function isNesPulseWidthTableEffect(effect) {
	return (
		isNesPulseWidthCycleEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

export function normalizeNesPulseWidthIndex(index) {
	return ((index % PULSE_WIDTH_COUNT) + PULSE_WIDTH_COUNT) % PULSE_WIDTH_COUNT;
}

export function applyNesPulseWidthEffectParameter(state, channelIndex, parameter, keepTableMode = false) {
	if (parameter === 0) {
		state.channelPulseWidthCycleActive[channelIndex] = false;
		state.channelPulseWidthCurrent[channelIndex] = 0;
		if (!keepTableMode) {
			state.channelPulseWidthTableMode[channelIndex] = false;
			state.channelPulseWidthTableIndex[channelIndex] = -1;
			state.channelPulseWidthTablePosition[channelIndex] = 0;
		}
		return;
	}

	state.channelPulseWidthCycleActive[channelIndex] = true;
	state.channelPulseWidthCurrent[channelIndex] = normalizeNesPulseWidthIndex(parameter - 1);
}

function readNesPulseWidthTableValue(state, tableIndex, position) {
	const table = state.getTable?.(tableIndex);
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;
	return rows[position] ?? 0;
}

function advanceNesPulseWidthTablePosition(table, position) {
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;

	let nextPosition = position + 1;
	if (nextPosition >= rows.length) {
		const loop = table.loop;
		if (loop != null && loop >= 0 && loop < rows.length) {
			nextPosition = loop;
		} else {
			nextPosition = 0;
		}
	}
	return nextPosition;
}

export function resetNesChannelPulseWidthCycle(state, channelIndex) {
	state.channelPulseWidthCycleActive[channelIndex] = false;
	state.channelPulseWidthCurrent[channelIndex] = 0;
	state.channelPulseWidthTableMode[channelIndex] = false;
	state.channelPulseWidthTableIndex[channelIndex] = -1;
	state.channelPulseWidthTablePosition[channelIndex] = 0;
}

export function processNesPulseWidthCycleEffect(state, channelIndex, row) {
	const effects = row.effects;
	if (!effects) return;
	for (const effect of effects) {
		if (!isNesPulseWidthCycleEffect(effect)) continue;
		if (isNesPulseWidthTableEffect(effect)) {
			state.channelPulseWidthTableMode[channelIndex] = true;
			state.channelPulseWidthTableIndex[channelIndex] = effect.tableIndex;
			state.channelPulseWidthTablePosition[channelIndex] = 0;
			applyNesPulseWidthEffectParameter(
				state,
				channelIndex,
				readNesPulseWidthTableValue(state, effect.tableIndex, 0),
				true
			);
			if (state.channelEffectTables) {
				state.channelEffectTables[channelIndex] = -1;
			}
		} else {
			state.channelPulseWidthTableMode[channelIndex] = false;
			state.channelPulseWidthTableIndex[channelIndex] = -1;
			state.channelPulseWidthTablePosition[channelIndex] = 0;
			applyNesPulseWidthEffectParameter(state, channelIndex, effect.parameter);
		}
	}
}

export function advanceNesPulseWidthTable(state) {
	for (
		let channelIndex = 0;
		channelIndex < state.channelPulseWidthTableMode.length;
		channelIndex++
	) {
		if (!state.channelPulseWidthTableMode[channelIndex]) continue;

		const tableIndex = state.channelPulseWidthTableIndex[channelIndex];
		const table = state.getTable?.(tableIndex);
		if (!table?.rows?.length) continue;

		const nextPosition = advanceNesPulseWidthTablePosition(
			table,
			state.channelPulseWidthTablePosition[channelIndex]
		);
		state.channelPulseWidthTablePosition[channelIndex] = nextPosition;
		applyNesPulseWidthEffectParameter(
			state,
			channelIndex,
			readNesPulseWidthTableValue(state, tableIndex, nextPosition),
			true
		);
	}
}
