export const NES_PULSE_WIDTHS = [0, 1, 2, 3] as const;

export type NesPulseWidth = (typeof NES_PULSE_WIDTHS)[number];

export const NES_PULSE_WIDTH_LABELS: Record<NesPulseWidth, string> = {
	0: '⅛',
	1: '¼',
	2: '½',
	3: '¾'
};

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;
const SWEEP_RATE_MIN = 0;
const SWEEP_RATE_MAX = 7;
const SWEEP_SHIFT_MIN = -7;
const SWEEP_SHIFT_MAX = 7;
export const NES_SQUARE_SWEEP_DISABLED = 0x08;

export type NesInstrumentRow = {
	pulseWidth: NesPulseWidth;
	retrigger: boolean;
	toneAdd: number;
	toneAccumulation: boolean;
	sweep: boolean;
	sweepRate: number;
	sweepShift: number;
};

export function createDefaultNesInstrumentRow(): NesInstrumentRow {
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

function normalizeToneAdd(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, Math.round(parsed)));
}

function normalizeSweepRate(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_RATE_MIN, Math.min(SWEEP_RATE_MAX, Math.round(parsed)));
}

function normalizeSweepShift(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_SHIFT_MIN, Math.min(SWEEP_SHIFT_MAX, Math.round(parsed)));
}

export function buildSquareSweepReg(enabled: boolean, rate: number, shift: number): number {
	if (!enabled || shift === 0) {
		return NES_SQUARE_SWEEP_DISABLED;
	}
	const amount = Math.abs(shift);
	const packed = ((rate & 7) << 4) | (amount & 7);
	return shift < 0 ? 0x88 | packed : 0x80 | packed;
}

export function normalizeNesInstrumentRow(row: Record<string, unknown>): NesInstrumentRow {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row.pulseWidth as NesPulseWidth)
		? (row.pulseWidth as NesPulseWidth)
		: defaults.pulseWidth;
	return {
		pulseWidth,
		retrigger: Boolean(row.retrigger),
		toneAdd: normalizeToneAdd(row.toneAdd),
		toneAccumulation: Boolean(row.toneAccumulation),
		sweep: Boolean(row.sweep),
		sweepRate: normalizeSweepRate(row.sweepRate),
		sweepShift: normalizeSweepShift(row.sweepShift)
	};
}

export function ensureNesInstrumentRows(rows: Record<string, unknown>[]): NesInstrumentRow[] {
	if (rows.length === 0) {
		return [createDefaultNesInstrumentRow()];
	}
	return rows.map((row) => normalizeNesInstrumentRow(row));
}

export function cyclePulseWidth(current: NesPulseWidth): NesPulseWidth {
	const index = NES_PULSE_WIDTHS.indexOf(current);
	const nextIndex = index < 0 ? 0 : (index + 1) % NES_PULSE_WIDTHS.length;
	return NES_PULSE_WIDTHS[nextIndex];
}
