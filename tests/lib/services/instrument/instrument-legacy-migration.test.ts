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
});
