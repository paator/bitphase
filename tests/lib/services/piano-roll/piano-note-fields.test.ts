import { describe, expect, it } from 'vitest';
import type { GenericRow } from '@/lib/models/song/generic';
import {
	captureNoteFields,
	clearNoteFields,
	NoteFieldsCarry,
	writeNoteFields
} from '@/lib/services/piano-roll/piano-note-fields';

const blank: GenericRow = { note: '---', instrument: 0, volume: 0, table: 0, effect: null };

describe('piano note fields', () => {
	it('captures every field except the note as independent copies', () => {
		const effect = { effect: 1, parameter: 2 };
		const row: GenericRow = { note: 'C-4', instrument: 3, volume: 12, effect };
		const fields = captureNoteFields(row, 'note');
		expect(fields).toEqual({ instrument: 3, volume: 12, effect });
		expect(fields.effect).not.toBe(effect);
	});

	it('writes fields and reports whether anything changed', () => {
		const row: GenericRow = { note: 'C-4', instrument: 3, volume: 12 };
		expect(writeNoteFields(row, { instrument: 3, volume: 12 })).toBe(false);
		expect(writeNoteFields(row, { volume: 4, table: 2 })).toBe(true);
		expect(row).toEqual({ note: 'C-4', instrument: 3, volume: 4, table: 2 });
	});

	it('resets only the fields present in the row to their blank values', () => {
		const row: GenericRow = { note: 'C-4', instrument: 3, volume: 12, effect: { effect: 1 } };
		expect(clearNoteFields(row, 'note', blank)).toBe(true);
		expect(row).toEqual({ note: 'C-4', instrument: 0, volume: 0, effect: null });
		expect(clearNoteFields(row, 'note', blank)).toBe(false);
	});

	it('carries all fields from one row to another only when a blank row is known', () => {
		const source: GenericRow = { note: 'C-4', instrument: 3, volume: 12, table: 5 };
		const destination: GenericRow = { note: '---', instrument: 0, volume: 0, table: 0 };
		const carry = new NoteFieldsCarry(blank, 'note', source);
		carry.clear(source);
		carry.apply(destination);
		expect(source).toEqual({ note: 'C-4', instrument: 0, volume: 0, table: 0 });
		expect(destination).toEqual({ note: '---', instrument: 3, volume: 12, table: 5 });

		const untouched: GenericRow = { note: 'D-4', volume: 7 };
		const inert = new NoteFieldsCarry(null, 'note', untouched);
		inert.clear(untouched);
		inert.apply(destination);
		expect(untouched).toEqual({ note: 'D-4', volume: 7 });
	});
});
