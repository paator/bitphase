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

	it('round-trips extra effect columns', () => {
		const converter = new NESConverter();
		const pattern = new Pattern(0, 2, NES_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 3;
		pattern.channels[0].rows[0].effects = [
			{ effect: 'A'.charCodeAt(0), delay: 1, parameter: 0x12 },
			{ effect: 'V'.charCodeAt(0), delay: 2, parameter: 0x34 },
			null
		];

		const generic = converter.toGeneric(pattern);
		expect(generic.channels[0].effectColumnCount).toBe(3);
		expect(generic.channels[0].rows[0].effect1).toEqual(
			expect.objectContaining({ effect: 'V'.charCodeAt(0), parameter: 0x34 })
		);
		expect('effect2' in generic.channels[0].rows[0]).toBe(true);

		const restored = converter.fromGeneric(generic);
		expect(restored.channels[0].effectColumnCount).toBe(3);
		expect(restored.channels[0].rows[0].effects).toHaveLength(3);
		expect(restored.channels[0].rows[0].effects[1]?.effect).toBe('V'.charCodeAt(0));
		expect(restored.channels[0].rows[0].effects[2]).toBeNull();
	});
});
