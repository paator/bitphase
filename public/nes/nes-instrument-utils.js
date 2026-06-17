export const NES_PULSE_WIDTHS = [0, 1, 2, 3];

export function createDefaultNesInstrumentRow() {
	return { pulseWidth: 2, retrigger: false };
}

export function normalizeNesInstrumentRow(row) {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row?.pulseWidth) ? row.pulseWidth : defaults.pulseWidth;
	return {
		pulseWidth,
		retrigger: Boolean(row?.retrigger)
	};
}

export function ensureNesInstrumentRows(rows) {
	if (!rows || rows.length === 0) {
		return [createDefaultNesInstrumentRow()];
	}
	return rows.map((row) => normalizeNesInstrumentRow(row));
}

export function normalizeNesInstrument(instrument) {
	if (!instrument) {
		return { rows: [createDefaultNesInstrumentRow()], loop: 0 };
	}
	return {
		...instrument,
		rows: ensureNesInstrumentRows(instrument.rows),
		loop: instrument.loop ?? 0
	};
}
