export const NES_PULSE_WIDTHS = [0, 1, 2, 3];

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;

function normalizeToneAdd(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, Math.round(parsed)));
}

export function createDefaultNesInstrumentRow() {
	return { pulseWidth: 2, retrigger: false, toneAdd: 0, toneAccumulation: false };
}

export function normalizeNesInstrumentRow(row) {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row?.pulseWidth) ? row.pulseWidth : defaults.pulseWidth;
	return {
		pulseWidth,
		retrigger: Boolean(row?.retrigger),
		toneAdd: normalizeToneAdd(row?.toneAdd),
		toneAccumulation: Boolean(row?.toneAccumulation)
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
