import { describe, expect, it } from 'vitest';
import { AYConverter } from '@/lib/chips/ay/adapter';
import { Effect, EffectType, Pattern } from '@/lib/models/song';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';

describe('AYConverter', () => {
	it('round-trips extra effect columns', () => {
		const converter = new AYConverter();
		const pattern = new Pattern(0, 2, AY_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 2;
		pattern.channels[0].rows[0].effects = [
			new Effect(EffectType.Arpeggio, 1, 0x37),
			new Effect(EffectType.Vibrato, 4, 0x44)
		];

		const generic = converter.toGeneric(pattern);
		expect(generic.channels[0].effectColumnCount).toBe(2);
		expect(generic.channels[0].rows[0].effect1).toEqual(
			expect.objectContaining({ effect: EffectType.Vibrato, parameter: 0x44 })
		);

		const restored = converter.fromGeneric(generic);
		expect(restored.channels[0].effectColumnCount).toBe(2);
		expect(restored.channels[0].rows[0].effects).toHaveLength(2);
		expect(restored.channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
		expect(restored.channels[0].rows[0].effects[1]?.effect).toBe(EffectType.Vibrato);
		expect(restored.channels[0].rows[0].effects[1]?.parameter).toBe(0x44);
	});
});
