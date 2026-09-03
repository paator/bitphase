import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import { filterInstrumentsForChip } from '@/lib/services/instrument/instrument-filter';
import {
	applyInstrumentPreset,
	instrumentFromPreset,
	parseInstrumentPreset,
	serializeInstrumentPreset
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
		new Instrument('01', 'Lead', 'ay'),
		new Instrument('03', 'Empty NES slot', 'nes')
	];
}

describe('parseInstrumentPreset', () => {
	it('reads a bare instrument object', () => {
		expect(parseInstrumentPreset(AY_PRESET)).toEqual({
			chipType: 'ay',
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

	it('rejects payloads carrying neither macros nor a row array', () => {
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

	it('tags a preset built for another chip for the slot receiving it, macros as they stand', () => {
		const instrument = instrumentFromPreset(parseInstrumentPreset(AY_PRESET)!, '03', 'nes');

		expect(instrument.chipType).toBe('nes');
		expect(instrument.macros?.volumeOrRate?.values[0]).toBe(15);
	});

	it('carries the id, macros and name over', () => {
		const payload = parseInstrumentPreset(AY_PRESET)!;
		const instrument = instrumentFromPreset(payload, '01', 'ay');

		expect(instrument.id).toBe('01');
		expect(instrument.name).toBe('Glass Break');
		expect(instrument.macros?.volume?.values).toEqual([15, 7]);
		expect(instrument.macros?.tone?.values).toEqual([true, false]);
		expect(instrument.macros?.volume?.loop).toBe(1);
	});

	it('names the instrument after its slot when the preset has no name', () => {
		const payload = parseInstrumentPreset({ rows: [] })!;
		expect(instrumentFromPreset(payload, '07', 'ay').name).toBe('Instrument 07');
	});

	it('copies macros so editing the instrument leaves the payload alone', () => {
		const payload = parseInstrumentPreset(AY_PRESET)!;
		const instrument = instrumentFromPreset(payload, '01', 'ay');

		instrument.macros!.volume!.values[0] = 0;

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

describe('serializeInstrumentPreset', () => {
	it('round-trips PWM and sample fields', () => {
		const source = instrumentFromPreset(
			{
				name: 'Hit',
				macros: { volume: { values: [15], loop: 0 } },
				timerPwmDuty: 25,
				timerPwmSweep: 4,
				sampleData: [1, 2, 3, 4],
				sampleRate: 8000,
				sampleStart: 0,
				sampleEnd: 3,
				sampleLoopStart: 1,
				sampleLoopEnabled: true
			},
			'01',
			'ay'
		);
		const payload = parseInstrumentPreset(serializeInstrumentPreset(source))!;
		const restored = instrumentFromPreset(payload, '01', 'ay') as Instrument & {
			timerPwmDuty?: number;
			sampleData?: number[];
			sampleRate?: number;
			sampleLoopStart?: number;
		};

		expect(restored.timerPwmDuty).toBe(25);
		expect(restored.sampleData).toEqual([1, 2, 3, 4]);
		expect(restored.sampleRate).toBe(8000);
		expect(restored.sampleLoopStart).toBe(1);
	});
});
