function usesTable(effect) {
	return effect?.tableIndex !== undefined && effect.tableIndex >= 0;
}

function readTableValue(state, tableIndex, position) {
	const rows = state.getTable?.(tableIndex)?.rows ?? [];
	if (rows.length === 0) return 0;
	return rows[position] ?? 0;
}

function advancePosition(table, position) {
	const rows = table?.rows ?? [];
	if (rows.length === 0) return 0;
	let next = position + 1;
	if (next >= rows.length) {
		const loop = table.loop;
		if (loop != null && loop >= 0 && loop < rows.length) next = loop;
		else next = 0;
	}
	return next;
}

function ensureMixerTables(state, channelIndex) {
	const count = Math.max(channelIndex + 1, state.channelMixerTableIndex?.length ?? 0, 1);
	if (!state.channelMixerTableIndex) {
		state.channelMixerTableIndex = Array(count).fill(-1);
		state.channelMixerTablePosition = Array(count).fill(0);
		return;
	}
	while (state.channelMixerTableIndex.length < count) {
		state.channelMixerTableIndex.push(-1);
		state.channelMixerTablePosition.push(0);
	}
}

function storeMixerMask(state, channelIndex, parameter, followInstrumentAt) {
	if (!state.channelSourceMask) return;
	const value = parameter | 0;
	state.channelSourceMask[channelIndex] = value >= followInstrumentAt ? null : value & 7;
}

export function applyAyAutoEnvelopeValue(state, parameter) {
	const numerator = (parameter >> 4) & 0xf;
	const denominator = parameter & 0xf;
	if (numerator > 0 && denominator > 0) {
		state.autoEnvelopeActive = true;
		state.autoEnvelopeNumerator = numerator;
		state.autoEnvelopeDenominator = denominator;
		return;
	}
	state.autoEnvelopeActive = false;
	state.autoEnvelopeNumerator = 0;
	state.autoEnvelopeDenominator = 0;
}

export function clearAyAutoEnvelopeTable(state) {
	state.autoEnvelopeTableIndex = -1;
	state.autoEnvelopeTablePosition = 0;
}

export function applyAyMixerCommand(state, channelIndex, effect, followInstrumentAt) {
	if (usesTable(effect)) {
		ensureMixerTables(state, channelIndex);
		state.channelMixerTableIndex[channelIndex] = effect.tableIndex;
		state.channelMixerTablePosition[channelIndex] = 0;
		storeMixerMask(
			state,
			channelIndex,
			readTableValue(state, effect.tableIndex, 0),
			followInstrumentAt
		);
		return;
	}
	if (state.channelMixerTableIndex?.[channelIndex] !== undefined) {
		state.channelMixerTableIndex[channelIndex] = -1;
		state.channelMixerTablePosition[channelIndex] = 0;
	}
	storeMixerMask(state, channelIndex, effect.parameter | 0, followInstrumentAt);
}

export function startAyAutoEnvelopeTable(state, effect) {
	state.autoEnvelopeTableIndex = effect.tableIndex;
	state.autoEnvelopeTablePosition = 0;
	applyAyAutoEnvelopeValue(state, readTableValue(state, effect.tableIndex, 0));
}

export function advanceAyMixerTables(state, followInstrumentAt) {
	const indexes = state.channelMixerTableIndex;
	if (!indexes) return;
	for (let channelIndex = 0; channelIndex < indexes.length; channelIndex++) {
		const tableIndex = indexes[channelIndex];
		if (tableIndex < 0) continue;
		const table = state.getTable?.(tableIndex);
		if (!table?.rows?.length) continue;
		const next = advancePosition(table, state.channelMixerTablePosition[channelIndex]);
		state.channelMixerTablePosition[channelIndex] = next;
		storeMixerMask(
			state,
			channelIndex,
			readTableValue(state, tableIndex, next),
			followInstrumentAt
		);
	}
}

export function advanceAyAutoEnvelopeTable(state) {
	const tableIndex = state.autoEnvelopeTableIndex ?? -1;
	if (tableIndex < 0) return;
	const table = state.getTable?.(tableIndex);
	if (!table?.rows?.length) return;
	const next = advancePosition(table, state.autoEnvelopeTablePosition ?? 0);
	state.autoEnvelopeTablePosition = next;
	applyAyAutoEnvelopeValue(state, readTableValue(state, tableIndex, next));
}
