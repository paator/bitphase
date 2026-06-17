export const NES_PULSE_WIDTHS = [0, 1, 2, 3] as const;

export type NesPulseWidth = (typeof NES_PULSE_WIDTHS)[number];

export const NES_PULSE_WIDTH_LABELS: Record<NesPulseWidth, string> = {
	0: '⅛',
	1: '¼',
	2: '½',
	3: '¾'
};

export type NesInstrumentRow = {
	pulseWidth: NesPulseWidth;
	retrigger: boolean;
};

export function createDefaultNesInstrumentRow(): NesInstrumentRow {
	return { pulseWidth: 2, retrigger: false };
}

export function normalizeNesInstrumentRow(row: Record<string, unknown>): NesInstrumentRow {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row.pulseWidth as NesPulseWidth)
		? (row.pulseWidth as NesPulseWidth)
		: defaults.pulseWidth;
	return {
		pulseWidth,
		retrigger: Boolean(row.retrigger)
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
