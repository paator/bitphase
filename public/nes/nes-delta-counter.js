export const NES_DPCM_HARDWARE_CHANNEL = 4;
export const NES_DELTA_COUNTER_SUBCOMMAND = 4;
const DELTA_COUNTER_MAX = 0x7f;

export function isNesDeltaCounterEffect(effect) {
	return (
		effect &&
		effect.effect === 'E'.charCodeAt(0) &&
		effect.delay === NES_DELTA_COUNTER_SUBCOMMAND
	);
}

export function isNesDeltaCounterTableEffect(effect) {
	return (
		isNesDeltaCounterEffect(effect) &&
		effect.tableIndex !== undefined &&
		effect.tableIndex >= 0
	);
}

function clampDeltaCounter(parameter) {
	return Math.min(DELTA_COUNTER_MAX, parameter & 0xff);
}

function readDeltaCounterTableValue(state, tableIndex, position) {
	const table = state.getTable?.(tableIndex);
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;
	return rows[position] ?? 0;
}

function advanceDeltaCounterTablePosition(table, position) {
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

function latchDeltaCounter(state, channelIndex, level) {
	state.channelDpcmDelta[channelIndex] = level;
	state.channelDpcmDeltaWrite[channelIndex] = true;
}

function clearDeltaCounterTable(state, channelIndex) {
	if (!state.channelDpcmDeltaTableMode) return;
	state.channelDpcmDeltaTableMode[channelIndex] = false;
	state.channelDpcmDeltaTableIndex[channelIndex] = -1;
	state.channelDpcmDeltaTablePosition[channelIndex] = 0;
}

export function processNesDeltaCounterEffect(state, channelIndex, row, hardwareType) {
	const writes = state.channelDpcmDeltaWrite;
	if (!writes) return;
	if (hardwareType !== NES_DPCM_HARDWARE_CHANNEL || state.channelMuted?.[channelIndex]) {
		writes[channelIndex] = false;
		return;
	}
	const effects = row?.effects;
	if (!effects) return;
	for (const effect of effects) {
		if (!isNesDeltaCounterEffect(effect)) continue;
		if (isNesDeltaCounterTableEffect(effect) && state.channelDpcmDeltaTableMode) {
			state.channelDpcmDeltaTableMode[channelIndex] = true;
			state.channelDpcmDeltaTableIndex[channelIndex] = effect.tableIndex;
			state.channelDpcmDeltaTablePosition[channelIndex] = 0;
			latchDeltaCounter(
				state,
				channelIndex,
				clampDeltaCounter(readDeltaCounterTableValue(state, effect.tableIndex, 0))
			);
		} else {
			clearDeltaCounterTable(state, channelIndex);
			latchDeltaCounter(state, channelIndex, clampDeltaCounter(effect.parameter));
		}
	}
}

export function cutNesDeltaCounter(state, channelIndex) {
	if (!state.channelDpcmDelta || !state.channelDpcmDeltaWrite) return;
	clearDeltaCounterTable(state, channelIndex);
	latchDeltaCounter(state, channelIndex, 0);
}

export function advanceNesDeltaCounterTable(state) {
	const modes = state.channelDpcmDeltaTableMode;
	if (!modes) return;
	for (let channelIndex = 0; channelIndex < modes.length; channelIndex++) {
		if (!modes[channelIndex]) continue;
		const tableIndex = state.channelDpcmDeltaTableIndex[channelIndex];
		const table = state.getTable?.(tableIndex);
		if (!table?.rows?.length) continue;
		const nextPosition = advanceDeltaCounterTablePosition(
			table,
			state.channelDpcmDeltaTablePosition[channelIndex]
		);
		state.channelDpcmDeltaTablePosition[channelIndex] = nextPosition;
		const level = clampDeltaCounter(readDeltaCounterTableValue(state, tableIndex, nextPosition));
		if (state.channelDpcmDelta[channelIndex] === level) continue;
		latchDeltaCounter(state, channelIndex, level);
	}
}
