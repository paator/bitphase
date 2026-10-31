import { describe, expect, it } from 'vitest';
import { SAAConverter } from '@/lib/chips/saa/adapter';
import { SAAFormatter } from '@/lib/chips/saa/formatter';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import { NoteName, Pattern } from '@/lib/models/song';

describe('SAAConverter', () => {
	it('round-trips both channel volumes and both noise columns', () => {
		const converter = new SAAConverter();
		const pattern = new Pattern(1, 4, SAA_CHIP_SCHEMA);
		pattern.channels[0].rows[0].note.name = NoteName.C;
		pattern.channels[0].rows[0].note.octave = 4;
		pattern.channels[0].rows[0].instrument = 1;
		pattern.channels[0].rows[0].left = 15;
		pattern.channels[0].rows[0].right = 8;
		pattern.channels[3].rows[1].left = 3;
		pattern.patternRows[0].noise0 = 1;
		pattern.patternRows[0].noise1 = 3;
		pattern.patternRows[0].env0 = 4;
		pattern.patternRows[0].env1 = 2;

		const generic = converter.toGeneric(pattern);
		expect(generic.channels).toHaveLength(6);
		expect(generic.patternRows[0].noise0).toBe(1);
		expect(generic.patternRows[0].noise1).toBe(3);
		expect(generic.patternRows[0].env0).toBe(4);
		expect(generic.patternRows[0].env1).toBe(2);
		expect(generic.channels[0].rows[0].left).toBe(15);
		expect(generic.channels[0].rows[0].right).toBe(8);
		expect(generic.channels[0].rows[0].envelopeShape).toBeUndefined();

		const restored = converter.fromGeneric(generic);
		expect(restored.channels.map((channel) => channel.label)).toEqual([
			'A',
			'B',
			'C',
			'D',
			'E',
			'F'
		]);
		expect(restored.channels[0].rows[0].note.name).toBe(NoteName.C);
		expect(restored.channels[0].rows[0].note.octave).toBe(4);
		expect(restored.channels[0].rows[0].left).toBe(15);
		expect(restored.channels[0].rows[0].right).toBe(8);
		expect(restored.channels[3].rows[1].left).toBe(3);
		expect(restored.patternRows[0].noise0).toBe(1);
		expect(restored.patternRows[0].noise1).toBe(3);
		expect(restored.patternRows[0].env0).toBe(4);
		expect(restored.patternRows[0].env1).toBe(2);

		const row = new SAAFormatter().formatRow(
			generic.patternRows[0],
			generic.channels.map((channel) => channel.rows[0]),
			0,
			SAA_CHIP_SCHEMA
		);
		const parsed = new SAAFormatter().parseRow(row, SAA_CHIP_SCHEMA);
		expect(parsed.patternRow.noise0).toBe(1);
		expect(parsed.patternRow.env0).toBe(4);
		expect(parsed.patternRow.noise1).toBe(3);
		expect(parsed.patternRow.env1).toBe(2);
	});
});
