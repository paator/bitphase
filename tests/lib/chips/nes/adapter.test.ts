import { describe, expect, it } from 'vitest';
import { NESConverter } from '@/lib/chips/nes/adapter';
import { Pattern, NoteName } from '@/lib/models/song';
import { NES_CHIP_SCHEMA } from '@/lib/chips/nes/schema';

describe('NESConverter', () => {
	it('round-trips patterns with more channels than hardware (virtual channels)', () => {
		const converter = new NESConverter();
		const labels = ['Pulse 11', 'Pulse 12', 'Pulse 2', 'Triangle', 'Noise', 'DPCM'];
		const pattern = new Pattern(3, 8, NES_CHIP_SCHEMA, labels);
		pattern.channels[0].rows[0].note.name = NoteName.C;
		pattern.channels[0].rows[0].note.octave = 4;
		pattern.channels[1].rows[1].volume = 10;

		const generic = converter.toGeneric(pattern);
		expect(generic.channels).toHaveLength(6);
		expect(generic.channels.map((channel) => channel.label)).toEqual(labels);

		const restored = converter.fromGeneric(generic);
		expect(restored.channels).toHaveLength(6);
		expect(restored.channels.map((channel) => channel.label)).toEqual(labels);
		expect(restored.channels[0].rows[0].note.name).toBe(NoteName.C);
		expect(restored.channels[0].rows[0].note.octave).toBe(4);
		expect(restored.channels[1].rows[1].volume).toBe(10);
	});
});
