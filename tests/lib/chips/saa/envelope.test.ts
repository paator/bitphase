import { describe, expect, it } from 'vitest';
import {
	SAA_LEGACY_ENVELOPE_BYTES,
	saaEnvelopeByteFromCode,
	saaMigrateLegacyEnvelope
} from '../../../../public/saa/saa-levels.js';
import { describeSaaEnvelope } from '@/lib/chips/saa/envelope';

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

	it('describes a packed code in words', () => {
		expect(describeSaaEnvelope(0x32)).toBe('Decay, repeating, 8 steps, right normal');
		expect(describeSaaEnvelope(-1)).toBe('off');
		expect(describeSaaEnvelope(4)).toBe('unused, keeps current');
		expect(describeSaaEnvelope(0x17)).toBe('unused, keeps current');
	});
});