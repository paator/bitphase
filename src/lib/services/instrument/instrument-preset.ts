import { Instrument, InstrumentRow } from '../../models/song';

export type InstrumentPresetPayload = {
	rows: Record<string, unknown>[];
	loop: number;
	name: string;
};

/**
 * Reads an instrument preset payload out of parsed JSON, taking a bare instrument object or
 * the first entry when the JSON holds an array of them. Returns null when the payload carries
 * no row array.
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
 * Builds the instrument a preset replaces a slot with, tagged for the chip that owns the slot
 * so it stays in the list it was loaded into.
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
		payload.name,
		chipType
	);
}

/**
 * Places a preset in the instrument slot carrying the given id, tagged for the chip that owns
 * the slot. Returns the updated instrument list, or null when the project holds no such slot.
 */
export function applyInstrumentPreset(
	instruments: Instrument[],
	payload: InstrumentPresetPayload,
	id: string,
	chipType: string
): Instrument[] | null {
	const index = instruments.findIndex((instrument) => instrument.id === id);
	if (index < 0) return null;

	const updated = [...instruments];
	updated[index] = instrumentFromPreset(payload, id, chipType);
	return updated;
}
