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

function ensureAutoEnvelopeTables(state) {
	if (state.autoEnvelopeTableIndex) return;
	state.autoEnvelopeTableIndex = [-1, -1];
	state.autoEnvelopeTablePosition = [0, 0];
	state.autoEnvelopeTableSource = [-1, -1];
}

export function clearSaaEffectTables(state) {
	if (state.channelMixerTableIndex) {
		state.channelMixerTableIndex.fill(-1);
		state.channelMixerTablePosition.fill(0);
	}
	if (state.autoEnvelopeTableIndex) {
		state.autoEnvelopeTableIndex.fill(-1);
		state.autoEnvelopeTablePosition.fill(0);
		state.autoEnvelopeTableSource.fill(-1);
	}
}

export function applySaaMixerCommand(state, channelIndex, effect, applyParameter) {
	if (usesTable(effect)) {
		ensureMixerTables(state, channelIndex);
		state.channelMixerTableIndex[channelIndex] = effect.tableIndex;
		state.channelMixerTablePosition[channelIndex] = 0;
		applyParameter(readTableValue(state, effect.tableIndex, 0));
		return;
	}
	if (state.channelMixerTableIndex?.[channelIndex] !== undefined) {
		state.channelMixerTableIndex[channelIndex] = -1;
		state.channelMixerTablePosition[channelIndex] = 0;
	}
	applyParameter(effect.parameter | 0);
}

export function applySaaAutoEnvelopeCommand(
	state,
	channelIndex,
	effect,
	applyParameter,
	hardwareIndex = channelIndex
) {
	ensureAutoEnvelopeTables(state);
	const group = hardwareIndex < 3 ? 0 : 1;
	if (usesTable(effect)) {
		state.autoEnvelopeTableIndex[group] = effect.tableIndex;
		state.autoEnvelopeTablePosition[group] = 0;
		state.autoEnvelopeTableSource[group] = channelIndex;
		applyParameter(channelIndex, readTableValue(state, effect.tableIndex, 0));
		return;
	}
	state.autoEnvelopeTableIndex[group] = -1;
	state.autoEnvelopeTablePosition[group] = 0;
	state.autoEnvelopeTableSource[group] = -1;
	applyParameter(channelIndex, effect.parameter | 0);
}

export function advanceSaaEffectTables(state, applyMixer, applyAutoEnvelope) {
	const mixerTables = state.channelMixerTableIndex;
	if (mixerTables) {
		for (let channelIndex = 0; channelIndex < mixerTables.length; channelIndex++) {
			const tableIndex = mixerTables[channelIndex];
			if (tableIndex < 0) continue;
			const table = state.getTable?.(tableIndex);
			if (!table?.rows?.length) continue;
			const next = advancePosition(table, state.channelMixerTablePosition[channelIndex]);
			state.channelMixerTablePosition[channelIndex] = next;
			applyMixer(channelIndex, readTableValue(state, tableIndex, next));
		}
	}

	const envelopeTables = state.autoEnvelopeTableIndex;
	if (!envelopeTables) return;
	for (let group = 0; group < envelopeTables.length; group++) {
		const tableIndex = envelopeTables[group];
		if (tableIndex < 0) continue;
		const source = state.autoEnvelopeTableSource?.[group] ?? -1;
		if (source < 0) continue;
		const table = state.getTable?.(tableIndex);
		if (!table?.rows?.length) continue;
		const next = advancePosition(table, state.autoEnvelopeTablePosition[group]);
		state.autoEnvelopeTablePosition[group] = next;
		applyAutoEnvelope(source, readTableValue(state, tableIndex, next));
	}
}
