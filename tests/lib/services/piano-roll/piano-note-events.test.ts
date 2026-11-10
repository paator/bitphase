import { describe, expect, it } from 'vitest';
import type { GenericRow } from '@/lib/models/song/generic';
import {
	clearFollowingGate,
	clearNoteEvents,
	gateNote,
	nextNoteEvent,
	noteEventKind,
	notePitchIndex,
	pitchNoteText,
	previousNoteEvent,
	writeNoteGate
} from '@/lib/services/piano-roll/piano-note-events';

function rows(notes: string[]): GenericRow[] {
	return notes.map((note) => ({ note }));
}

describe('piano note events', () => {
	it('classifies note cells', () => {
		expect(noteEventKind(undefined)).toBe('empty');
		expect(noteEventKind('---')).toBe('empty');
		expect(noteEventKind(12)).toBe('empty');
		expect(noteEventKind('OFF')).toBe('off');
		expect(noteEventKind('R--')).toBe('off');
		expect(noteEventKind('===')).toBe('release');
		expect(noteEventKind('C-4')).toBe('pitched');
		expect(gateNote(true)).toBe('===');
		expect(gateNote(false)).toBe('OFF');
	});

	it('converts between note text and pitch index', () => {
		expect(notePitchIndex('C-4')).toBe(36);
		expect(notePitchIndex('OFF')).toBeNull();
		expect(pitchNoteText(36)).toBe('C-4');
		expect(notePitchIndex(pitchNoteText(41))).toBe(41);
	});

	it('finds the nearest event around a row', () => {
		const channel = rows(['C-4', '---', 'OFF', '---', 'E-4']);
		expect(nextNoteEvent(channel, 'note', 1)).toEqual({ row: 2, kind: 'off' });
		expect(nextNoteEvent(channel, 'note', 1, 2)).toBeNull();
		expect(previousNoteEvent(channel, 'note', 3)).toEqual({ row: 2, kind: 'off' });
		expect(previousNoteEvent(channel, 'note', 3, (row) => row === 2)).toEqual({
			row: 0,
			kind: 'pitched'
		});
		expect(previousNoteEvent(channel, 'note', -1)).toBeNull();
	});

	it('clears note bodies and writes a closing gate', () => {
		const channel = rows(['C-4', 'D-4', 'OFF', 'E-4', '---']);
		clearNoteEvents(channel, 'note', 1, 3, (row) => row === 2);
		expect(channel.map((row) => row.note)).toEqual(['C-4', '---', 'OFF', 'E-4', '---']);
		expect(writeNoteGate(channel, 'note', 3, false)).toBe(false);
		expect(writeNoteGate(channel, 'note', 4, true)).toBe(true);
		expect(writeNoteGate(channel, 'note', 4, true)).toBe(false);
		expect(writeNoteGate(channel, 'note', 9, true)).toBe(false);
		expect(channel[4].note).toBe('===');
	});

	it('clears only a gate that directly follows', () => {
		const gated = rows(['C-4', '---', 'OFF']);
		expect(clearFollowingGate(gated, 'note', 1)).toBe(true);
		expect(gated[2].note).toBe('---');
		const pitched = rows(['C-4', '---', 'E-4', 'OFF']);
		expect(clearFollowingGate(pitched, 'note', 1)).toBe(false);
		expect(pitched[3].note).toBe('OFF');
	});
});
