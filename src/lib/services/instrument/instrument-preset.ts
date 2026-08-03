import { Instrument, InstrumentRow } from '../../models/song';

export type InstrumentPresetPayload = {
	rows: Record<string, unknown>[];
	loop: number;
	name: string;
};

/**
 * Reads an instrument preset payload, accepting either a bare instrument object or a
 * single-element array of one, which is the shape both the bundled presets and exported
 * instrument files come in. Returns null when the payload carries no row array.
 */
export function parseInstrumentPreset(parsed: unknown): InstrumentPresetPayload | null {
	const item = Array.isArray(parsed) ? parsed[0] : parsed;
	if (item == null || typeof item !== 'object') return null;

	const record = item as Record<string, unknown>;
	if (!Array.isArray(record.rows)) return null;

	return {
		rows: record.rows as Record<string, unknown>[],
		loop: typeof record.loop === 'number' ? record.loop : 0,
		name: record.name != null ? String(record.name) : ''
	};
}

/**
 * Builds the instrument a preset replaces a slot with, tagged for the chip that owns the
 * slot. The chip comes from the slot rather than the payload so the instrument stays
 * visible in the list it was loaded into.
 */
export function instrumentFromPreset(
	payload: InstrumentPresetPayload,
	id: string,
	chipType: string
): Instrument {
	return new Instrument(
		id,
		payload.rows.map((row) => new InstrumentRow(row)),
		payload.loop,
		payload.name || `Instrument ${id}`,
		chipType
	);
}
