import { describe, expect, it } from 'vitest';
import {
	clampPianoHexInput,
	formatPianoEnvelopeNote,
	formatPianoHexInput,
	laneShowsNote,
	pianoHexInputValue,
	pianoNoteInputPeriod
} from '@/lib/services/piano-roll/piano-hex-input';

const tuning = Array.from({ length: 12 }, (_, index) => (index + 1) * 160);

describe('piano hex input', () => {
	it('types a long hex lane and keeps a short one as a bar', () => {
		expect(clampPianoHexInput('12gg', 4)).toBe('12');
		expect(formatPianoHexInput(255, 4, true)).toBe('00FF');
		expect(pianoHexInputValue('ff', 4, true)).toBe(255);
		expect(pianoHexInputValue('0000', 4, true)).toBe(-1);
		expect(pianoHexInputValue('', 4, true)).toBe(0);
	});

	it('edits an envelope period as a note when that view is on', () => {
		expect(laneShowsNote({ noteEquivalent: true }, true)).toBe(true);
		expect(laneShowsNote({ noteEquivalent: true }, false)).toBe(false);
		expect(pianoNoteInputPeriod('C-1', tuning)).toBe(10);
		expect(pianoNoteInputPeriod('c1', tuning)).toBe(10);
		expect(formatPianoEnvelopeNote(10, 4, true, tuning)).toBe('C-1');
		expect(pianoNoteInputPeriod('', tuning)).toBe(0);
		expect(pianoNoteInputPeriod('C-', tuning)).toBeUndefined();
	});
});
