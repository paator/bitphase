import { describe, expect, it } from 'vitest';
import { Instrument } from '@/lib/models/song';
import { migrateLegacyInstrument } from '@/lib/services/instrument/instrument-legacy-migration';
import { sampleTimerRowFromInstrument } from '@/lib/chips/ay/instrument';

describe('migrateLegacyInstrument', () => {
	it('returns an Instrument class instance without leftover row fields', () => {
		const migrated = migrateLegacyInstrument({
			id: '01',
			name: 'Lead',
			chipType: 'ay',
			rows: [{ tone: true, volume: 15 }],
			loop: 0,
			timerRows: [{ sid: true }],
			timerLoop: 0
		} as Instrument & {
			rows: Record<string, unknown>[];
			loop: number;
			timerRows: Record<string, unknown>[];
			timerLoop: number;
		});

		expect(migrated).toBeInstanceOf(Instrument);
		expect(migrated.macros?.volume?.values).toEqual([15]);
		expect((migrated as { rows?: unknown }).rows).toBeUndefined();
		expect((migrated as { loop?: unknown }).loop).toBeUndefined();
		expect((migrated as { timerRows?: unknown }).timerRows).toBeUndefined();

		expect(sampleTimerRowFromInstrument(migrated, 0).sid).toBe(true);
	});

	it('keeps SAA left and right volume steps', () => {
		const migrated = migrateLegacyInstrument({
			id: '03',
			name: 'SAA',
			chipType: 'saa',
			macros: {
				left: { values: [4, 8], loop: 0 },
				right: { values: [2, 1], loop: 0 },
				amplitudeSlide: { values: [0, 1], loop: 0 }
			}
		} as Instrument);

		expect(migrated.macros?.left?.values).toEqual([4, 8]);
		expect(migrated.macros?.right?.values).toEqual([2, 1]);
		expect(migrated.macros?.amplitudeSlide?.values).toEqual([0, 1]);
		expect(migrated.macros?.tone?.values).toEqual([true]);
		expect(migrated.macros?.toneAdd?.values).toEqual([0]);
		expect(migrated.macros?.toneAccumulation?.values).toEqual([false]);
		expect(migrated.macros?.noise?.values).toEqual([false]);
		expect(migrated.macros?.noiseAdd?.values).toEqual([0]);
		expect(migrated.macros?.noiseAccumulation?.values).toEqual([false]);
		expect(migrated.macros?.envelope).toBeUndefined();
		expect(migrated.macros?.volume).toBeUndefined();
	});
});
