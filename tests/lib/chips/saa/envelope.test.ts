import { describe, expect, it } from 'vitest';
import {
	SAA_ENVELOPE_SHAPE_VALUES,
	SAA_LEGACY_ENVELOPE_BYTES,
	saaEnvelopeByteFromCode,
	saaMigrateLegacyEnvelope
} from '../../../../public/saa/saa-levels.js';
import {
	describeSaaEnvelope,
	saaEnvelopeColumnTooltip,
	saaEnvelopeMacroTooltip
} from '@/lib/chips/saa/envelope';

describe('SAA envelope codes', () => {
	it('keeps every old one-digit shape on the same hardware byte', () => {
		for (let index = 1; index <= 12; index++) {
			const packed = saaMigrateLegacyEnvelope(index);
			expect(packed).toBeGreaterThanOrEqual(0x10);
			expect(saaEnvelopeByteFromCode(packed)).toBe(SAA_LEGACY_ENVELOPE_BYTES[index]);
			expect(saaMigrateLegacyEnvelope(packed)).toBe(packed);
		}
	});

	it('leaves blank, off, and current codes unchanged', () => {
		expect(saaMigrateLegacyEnvelope(0)).toBe(0);
		expect(saaMigrateLegacyEnvelope(-1)).toBe(-1);
		expect(saaMigrateLegacyEnvelope(0x20)).toBe(0x20);
	});

	it('lists only the shape codes a macro can set', () => {
		expect(SAA_ENVELOPE_SHAPE_VALUES).toHaveLength(33);
		expect(SAA_ENVELOPE_SHAPE_VALUES[0]).toBe(0);
		expect(SAA_ENVELOPE_SHAPE_VALUES.at(-1)).toBe(0x83);
		expect(SAA_ENVELOPE_SHAPE_VALUES).not.toContain(0x1f);
		for (const code of SAA_ENVELOPE_SHAPE_VALUES) {
			if (code === 0) continue;
			expect(saaEnvelopeByteFromCode(code)).not.toBeNull();
		}
	});

	it('draws a repeating shape twice and a one-shot shape into silence', () => {
		const repeating = saaEnvelopeMacroTooltip(0x32);
		const once = saaEnvelopeMacroTooltip(0x20);
		const flipped = saaEnvelopeMacroTooltip(0x11);
		const follow = saaEnvelopeMacroTooltip(0);
		expect(repeating.detail).toBe('Decay, repeating · 8 steps · right non-mirrored');
		expect(repeating.series?.[0]?.levels.slice(0, 8)).toEqual([14, 12, 10, 8, 6, 4, 2, 0]);
		expect(repeating.series?.[0]?.levels.slice(8)).toEqual([14, 12, 10, 8, 6, 4, 2, 0]);
		expect(once.series?.[0]?.levels.slice(16).every((level) => level === 0)).toBe(true);
		expect(flipped.series?.[1]?.levels.every((level) => level === 0)).toBe(true);
		expect(follow.detail).toBe('Follows the E column');
		expect(follow.series).toBeUndefined();
		expect(saaEnvelopeColumnTooltip(0).detail).toBe('Keeps the current mode');
		expect(saaEnvelopeColumnTooltip(0).heading).toBe('..');
		expect(saaEnvelopeColumnTooltip(-1).detail).toBe('Off');
		expect(saaEnvelopeColumnTooltip(-1).heading).toBe('00');
		expect(saaEnvelopeColumnTooltip(0x32).detail).toBe(repeating.detail);
		expect(repeating.legend?.find((item) => item.active)?.label).toBe('3');
		expect(repeating.legend).toHaveLength(8);
	});

	it('describes a packed code in words', () => {
		expect(describeSaaEnvelope(0x32)).toBe('Decay, repeating, 8 steps, right non-mirrored');
		expect(describeSaaEnvelope(-1)).toBe('off');
		expect(describeSaaEnvelope(4)).toBe('unused, keeps current');
		expect(describeSaaEnvelope(0x17)).toBe('unused, keeps current');
	});
});
