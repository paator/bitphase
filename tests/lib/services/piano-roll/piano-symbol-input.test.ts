import { describe, expect, it } from 'vitest';
import {
	clampPianoSymbolInput,
	formatPianoSymbolInput,
	laneValueIsTyped,
	pianoSymbolInputValue
} from '@/lib/services/piano-roll/piano-symbol-input';

describe('piano symbol input', () => {
	it('types symbol lanes, including a one-character table', () => {
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'symbol', length: 2 })).toBe(true);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'symbol', length: 1 })).toBe(true);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'hex', length: 1 })).toBe(false);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'hex', length: 4 })).toBe(true);
	});

	it('keeps a typed instrument to its symbol length', () => {
		expect(clampPianoSymbolInput('1a3', 2)).toBe('1A');
		expect(clampPianoSymbolInput(' z9', 2)).toBe('Z9');
		expect(clampPianoSymbolInput('..', 2)).toBe('..');
	});

	it('pads a short id and clears an empty one', () => {
		expect(formatPianoSymbolInput(3, 2, false)).toBe('03');
		expect(formatPianoSymbolInput(0, 2, false)).toBe('');
		expect(pianoSymbolInputValue('3', 2, false)).toBe(3);
		expect(pianoSymbolInputValue('0A', 2, false)).toBe(10);
		expect(pianoSymbolInputValue('', 2, false)).toBe(0);
		expect(pianoSymbolInputValue('..', 2, false)).toBe(0);
		expect(formatPianoSymbolInput(10, 1)).toBe('A');
		expect(pianoSymbolInputValue('a', 1)).toBe(10);
		expect(pianoSymbolInputValue('0', 1)).toBe(0);
	});
});
