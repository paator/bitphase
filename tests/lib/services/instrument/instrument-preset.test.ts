import { describe, expect, it } from 'vitest';
import { resolveInstrumentChipType } from '@/lib/services/instrument/instrument-filter';
import {
	instrumentFromPreset,
	parseInstrumentPreset
} from '@/lib/services/instrument/instrument-preset';

const PRESET = {
	chipType: 'ay',
	name: 'Glass Break',
	loop: 1,
	rows: [
		{ tone: true, volume: 15 },
		{ tone: false, volume: 7 }
	]
};

describe('parseInstrumentPreset', () => {
	it('reads a bare instrument object', () => {
		expect(parseInstrumentPreset(PRESET)).toEqual({
			name: 'Glass Break',
			loop: 1,
			rows: PRESET.rows
		});
	});

	it('reads the first entry of a single-element array', () => {
		expect(parseInstrumentPreset([PRESET])?.name).toBe('Glass Break');
	});

	it('defaults a missing loop and name', () => {
		const payload = parseInstrumentPreset({ rows: [] });
		expect(payload).toEqual({ rows: [], loop: 0, name: '' });
	});

	it('rejects payloads carrying no row array', () => {
		expect(parseInstrumentPreset(null)).toBeNull();
		expect(parseInstrumentPreset('instrument')).toBeNull();
		expect(parseInstrumentPreset({ name: 'No rows' })).toBeNull();
		expect(parseInstrumentPreset({ rows: 'nope' })).toBeNull();
	});
});

describe('instrumentFromPreset', () => {
	it('tags the instrument with the chip that owns the slot', () => {
		const payload = parseInstrumentPreset(PRESET)!;
		const instrument = instrumentFromPreset(payload, '03', 'nes');

		expect(instrument.chipType).toBe('nes');
		expect(resolveInstrumentChipType(instrument)).toBe('nes');
	});

	it('keeps the loaded instrument visible in the list it was loaded into', () => {
		const payload = parseInstrumentPreset(PRESET)!;
		const instrument = instrumentFromPreset(payload, '03', 'nes');

		expect(resolveInstrumentChipType(instrument)).not.toBe(PRESET.chipType);
	});

	it('carries the id, rows, loop and name over', () => {
		const payload = parseInstrumentPreset(PRESET)!;
		const instrument = instrumentFromPreset(payload, '03', 'ay');

		expect(instrument.id).toBe('03');
		expect(instrument.loop).toBe(1);
		expect(instrument.name).toBe('Glass Break');
		expect(instrument.rows.map((row) => ({ ...row }))).toEqual(PRESET.rows);
	});

	it('names the instrument after its slot when the preset has no name', () => {
		const payload = parseInstrumentPreset({ rows: [] })!;
		expect(instrumentFromPreset(payload, '07', 'ay').name).toBe('Instrument 07');
	});

	it('copies rows so editing the instrument leaves the payload alone', () => {
		const payload = parseInstrumentPreset(PRESET)!;
		const instrument = instrumentFromPreset(payload, '03', 'ay');

		(instrument.rows[0] as Record<string, unknown>).volume = 0;

		expect(PRESET.rows[0].volume).toBe(15);
	});
});
