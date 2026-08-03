import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import { filterInstrumentsForChip } from '@/lib/services/instrument/instrument-filter';
import {
	applyInstrumentPreset,
	instrumentFromPreset,
	parseInstrumentPreset
} from '@/lib/services/instrument/instrument-preset';

const AY_PRESET = {
	chipType: 'ay',
	name: 'Glass Break',
	loop: 1,
	rows: [
		{ tone: true, volume: 15 },
		{ tone: false, volume: 7 }
	]
};

const NES_PRESET = {
	chipType: 'nes',
	name: 'Square Lead',
	loop: 0,
	rows: [{ pulseWidth: 2, volumeOrRate: 15 }]
};

function projectInstruments(): Instrument[] {
	return [
		new Instrument('01', [], 0, 'Lead', 'ay'),
		new Instrument('03', [], 0, 'Empty NES slot', 'nes')
	];
}

describe('parseInstrumentPreset', () => {
	it('reads a bare instrument object', () => {
		expect(parseInstrumentPreset(AY_PRESET)).toEqual({
			name: 'Glass Break',
			loop: 1,
			rows: AY_PRESET.rows
		});
	});

	it('reads the first entry when the JSON holds an array', () => {
		const second = { ...AY_PRESET, name: 'Kick' };
		expect(parseInstrumentPreset([AY_PRESET, second])?.name).toBe('Glass Break');
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
		const ayInstrument = instrumentFromPreset(parseInstrumentPreset(AY_PRESET)!, '01', 'ay');
		const nesInstrument = instrumentFromPreset(parseInstrumentPreset(NES_PRESET)!, '03', 'nes');

		expect(ayInstrument.chipType).toBe('ay');
		expect(nesInstrument.chipType).toBe('nes');
	});

	it('tags a preset built for another chip for the slot receiving it, rows as they stand', () => {
		const instrument = instrumentFromPreset(parseInstrumentPreset(AY_PRESET)!, '03', 'nes');

		expect(instrument.chipType).toBe('nes');
		expect(instrument.rows.map((row) => ({ ...row }))).toEqual(AY_PRESET.rows);
	});

	it('carries the id, rows, loop and name over', () => {
		const payload = parseInstrumentPreset(AY_PRESET)!;
		const instrument = instrumentFromPreset(payload, '01', 'ay');

		expect(instrument.id).toBe('01');
		expect(instrument.loop).toBe(1);
		expect(instrument.name).toBe('Glass Break');
		expect(instrument.rows.map((row) => ({ ...row }))).toEqual(AY_PRESET.rows);
	});

	it('names the instrument after its slot when the preset has no name', () => {
		const payload = parseInstrumentPreset({ rows: [] })!;
		expect(instrumentFromPreset(payload, '07', 'ay').name).toBe('Instrument 07');
	});

	it('copies rows so editing the instrument leaves the payload alone', () => {
		const payload = parseInstrumentPreset(AY_PRESET)!;
		const instrument = instrumentFromPreset(payload, '01', 'ay');

		instrument.rows[0].volume = 0;

		expect(AY_PRESET.rows[0].volume).toBe(15);
	});
});

describe('applyInstrumentPreset', () => {
	it('keeps the loaded instrument in the list of the chip that owns the slot', () => {
		const intoAySlot = applyInstrumentPreset(
			projectInstruments(),
			parseInstrumentPreset(AY_PRESET)!,
			'01',
			'ay'
		)!;
		const intoNesSlot = applyInstrumentPreset(
			projectInstruments(),
			parseInstrumentPreset(NES_PRESET)!,
			'03',
			'nes'
		)!;

		expect(filterInstrumentsForChip(intoAySlot, 'ay').map((inst) => inst.id)).toEqual(['01']);
		expect(filterInstrumentsForChip(intoNesSlot, 'nes').map((inst) => inst.id)).toEqual(['03']);
	});

	it('replaces the addressed slot and holds on to the rest', () => {
		const instruments = projectInstruments();
		const payload = parseInstrumentPreset(NES_PRESET)!;
		const updated = applyInstrumentPreset(instruments, payload, '03', 'nes')!;

		expect(updated).toHaveLength(2);
		expect(updated[0]).toBe(instruments[0]);
		expect(updated[1].name).toBe('Square Lead');
	});

	it('leaves the list it was given untouched', () => {
		const instruments = projectInstruments();
		applyInstrumentPreset(instruments, parseInstrumentPreset(NES_PRESET)!, '03', 'nes');

		expect(instruments[1].name).toBe('Empty NES slot');
	});

	it('reports no slot when the project holds no instrument with that id', () => {
		const payload = parseInstrumentPreset(AY_PRESET)!;
		expect(applyInstrumentPreset(projectInstruments(), payload, '99', 'ay')).toBeNull();
	});
});
