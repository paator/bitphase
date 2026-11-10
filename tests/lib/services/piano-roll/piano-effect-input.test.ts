import { describe, expect, it } from 'vitest';
import {
	clampPianoEffectInput,
	effectCommandFromFormat,
	pianoEffectInputValue
} from '@/lib/services/piano-roll/piano-effect-input';

describe('piano effect input', () => {
	it('turns a command hint into a usable command', () => {
		expect(effectCommandFromFormat('2XYZ')).toBe('2040');
		expect(effectCommandFromFormat('AXYZ')).toBe('A040');
		expect(effectCommandFromFormat('7.XY')).toBe('7.04');
		expect(effectCommandFromFormat('Q...')).toBe('Q...');
		expect(effectCommandFromFormat('E2XY')).toBe('E204');
		expect(effectCommandFromFormat('E2TY')).toBe('E2T4');
	});

	it('keeps an effect command to four symbols', () => {
		expect(clampPianoEffectInput('20401')).toBe('2040');
		expect(clampPianoEffectInput('v04')).toBe('V04');
		expect(clampPianoEffectInput('  e2t4xx')).toBe('E2T4');
	});

	it('parses a typed command and leaves a broken one untouched', () => {
		expect(pianoEffectInputValue('')).toBeNull();
		expect(pianoEffectInputValue('....')).toBeNull();
		expect(pianoEffectInputValue('2040')).toEqual({ effect: 2, delay: 0, parameter: 0x40 });
		expect(pianoEffectInputValue('v040')).toMatchObject({
			effect: 'V'.charCodeAt(0),
			delay: 0,
			parameter: 0x40
		});
		expect(pianoEffectInputValue('Q...')).toMatchObject({ effect: 'Q'.charCodeAt(0) });
		expect(pianoEffectInputValue('H')).toBeUndefined();
	});
});
