export const NES_PULSE_WIDTHS = [0, 1, 2, 3];

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;
const SWEEP_RATE_MIN = 0;
const SWEEP_RATE_MAX = 7;
const SWEEP_SHIFT_MIN = -7;
const SWEEP_SHIFT_MAX = 7;
export const NES_SQUARE_SWEEP_DISABLED = 0x08;

function normalizeToneAdd(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, Math.round(parsed)));
}

export function createDefaultNesInstrumentRow() {
	return {
		pulseWidth: 2,
		retrigger: false,
		toneAdd: 0,
		toneAccumulation: false,
		sweep: false,
		sweepRate: 0,
		sweepShift: 0
	};
}

function normalizeSweepRate(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_RATE_MIN, Math.min(SWEEP_RATE_MAX, Math.round(parsed)));
}

function normalizeSweepShift(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_SHIFT_MIN, Math.min(SWEEP_SHIFT_MAX, Math.round(parsed)));
}

export function buildSquareSweepReg(enabled, rate, shift) {
	if (!enabled || shift === 0) {
		return NES_SQUARE_SWEEP_DISABLED;
	}
	const amount = Math.abs(shift);
	const packed = ((rate & 7) << 4) | (amount & 7);
	return shift < 0 ? 0x88 | packed : 0x80 | packed;
}

export function normalizeNesInstrumentRow(row) {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row?.pulseWidth) ? row.pulseWidth : defaults.pulseWidth;
	return {
		pulseWidth,
		retrigger: Boolean(row?.retrigger),
		toneAdd: normalizeToneAdd(row?.toneAdd),
		toneAccumulation: Boolean(row?.toneAccumulation),
		sweep: Boolean(row?.sweep),
		sweepRate: normalizeSweepRate(row?.sweepRate),
		sweepShift: normalizeSweepShift(row?.sweepShift)
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
