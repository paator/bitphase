import { NoteName } from '../../../models/song';
import { formatNoteFromEnum, midiNoteToNoteString } from '../../../utils/note-utils';
import type { EditingContext, FieldInfo } from './editing-context';
import type { Pattern } from '../../../models/song';
import { PatternValueUpdates } from './pattern-value-updates';
import { editorStateStore } from '../../../stores/editor-state.svelte';
import { settingsStore } from '../../../stores/settings.svelte';
import { parseSymbol } from '../../../chips/base/field-formatters';

export class PatternNoteInput {
	private static readonly PIANO_KEYBOARD_MAP: Record<
		string,
		{ noteName: NoteName; octaveOffset: number }
	> = {
		q: { noteName: NoteName.C, octaveOffset: 1 },
		'2': { noteName: NoteName.CSharp, octaveOffset: 1 },
		w: { noteName: NoteName.D, octaveOffset: 1 },
		'3': { noteName: NoteName.DSharp, octaveOffset: 1 },
		e: { noteName: NoteName.E, octaveOffset: 1 },
		r: { noteName: NoteName.F, octaveOffset: 1 },
		'5': { noteName: NoteName.FSharp, octaveOffset: 1 },
		t: { noteName: NoteName.G, octaveOffset: 1 },
		'6': { noteName: NoteName.GSharp, octaveOffset: 1 },
		y: { noteName: NoteName.A, octaveOffset: 1 },
		'7': { noteName: NoteName.ASharp, octaveOffset: 1 },
		u: { noteName: NoteName.B, octaveOffset: 1 },
		i: { noteName: NoteName.C, octaveOffset: 2 },
		'9': { noteName: NoteName.CSharp, octaveOffset: 2 },
		o: { noteName: NoteName.D, octaveOffset: 2 },
		'0': { noteName: NoteName.DSharp, octaveOffset: 2 },
		p: { noteName: NoteName.E, octaveOffset: 2 },
		'[': { noteName: NoteName.F, octaveOffset: 2 },
		z: { noteName: NoteName.C, octaveOffset: 0 },
		s: { noteName: NoteName.CSharp, octaveOffset: 0 },
		x: { noteName: NoteName.D, octaveOffset: 0 },
		d: { noteName: NoteName.DSharp, octaveOffset: 0 },
		c: { noteName: NoteName.E, octaveOffset: 0 },
		v: { noteName: NoteName.F, octaveOffset: 0 },
		g: { noteName: NoteName.FSharp, octaveOffset: 0 },
		b: { noteName: NoteName.G, octaveOffset: 0 },
		h: { noteName: NoteName.GSharp, octaveOffset: 0 },
		n: { noteName: NoteName.A, octaveOffset: 0 },
		j: { noteName: NoteName.ASharp, octaveOffset: 0 },
		m: { noteName: NoteName.B, octaveOffset: 0 },
		',': { noteName: NoteName.C, octaveOffset: 1 },
		l: { noteName: NoteName.CSharp, octaveOffset: 1 },
		'.': { noteName: NoteName.D, octaveOffset: 1 },
		';': { noteName: NoteName.DSharp, octaveOffset: 1 },
		'/': { noteName: NoteName.E, octaveOffset: 1 }
	};

	private static readonly LETTER_NOTE_MAP: Record<string, NoteName> = {
		C: NoteName.C,
		D: NoteName.D,
		E: NoteName.E,
		F: NoteName.F,
		G: NoteName.G,
		B: NoteName.B
	};

	static handleNoteInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): { updatedPattern: Pattern; shouldMoveNext: boolean } | null {
		if (fieldInfo.isGlobal || fieldInfo.channelIndex < 0) {
			return null;
		}

		const keyboardNote = this.mapKeyboardKeyToNote(key);
		if (keyboardNote) {
			const noteStr = formatNoteFromEnum(keyboardNote.noteName, keyboardNote.octave);
			return this.applyNoteToField(context, fieldInfo, noteStr);
		}

		if (this.isPianoKey(key)) {
			return null;
		}

		const upperKey = key.toUpperCase();
		if (upperKey === 'A') {
			const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, 'OFF');
			return { updatedPattern, shouldMoveNext: false };
		}

		if (this.LETTER_NOTE_MAP[upperKey]) {
			const currentOctave = editorStateStore.octave;
			const noteStr = formatNoteFromEnum(this.LETTER_NOTE_MAP[upperKey], currentOctave);
			return this.applyNoteToField(context, fieldInfo, noteStr);
		}

		return null;
	}

	static handleMidiNoteInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		midiNote: number
	): { updatedPattern: Pattern; shouldMoveNext: boolean } | null {
		if (fieldInfo.isGlobal || fieldInfo.channelIndex < 0) {
			return null;
		}
		const noteStr = midiNoteToNoteString(midiNote);
		if (!noteStr) return null;
		return this.applyNoteToField(context, fieldInfo, noteStr);
	}

	private static applyNoteToField(
		context: EditingContext,
		fieldInfo: FieldInfo,
		noteStr: string
	): { updatedPattern: Pattern; shouldMoveNext: boolean } {
		let updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, noteStr);
		updatedPattern = this.autoEnterInstrument(context, fieldInfo, updatedPattern);
		return { updatedPattern, shouldMoveNext: false };
	}

	private static autoEnterInstrument(
		context: EditingContext,
		fieldInfo: FieldInfo,
		pattern: Pattern
	): Pattern {
		const autoEnterEnabled = settingsStore.autoEnterInstrument;
		if (!autoEnterEnabled || fieldInfo.isGlobal || fieldInfo.channelIndex < 0) {
			return pattern;
		}

		const instrumentFieldDef = context.schema.fields.instrument;
		if (!instrumentFieldDef) {
			return pattern;
		}

		const currentInstrumentId = editorStateStore.currentInstrument;
		const instrumentValue = parseSymbol(currentInstrumentId, instrumentFieldDef.length);

		const instrumentFieldInfo: FieldInfo = {
			fieldKey: 'instrument',
			fieldType: instrumentFieldDef.type,
			isGlobal: false,
			channelIndex: fieldInfo.channelIndex,
			charOffset: 0
		};

		const updatedContext = { ...context, pattern };
		return PatternValueUpdates.updateFieldValue(
			updatedContext,
			instrumentFieldInfo,
			instrumentValue
		);
	}

	static isPianoKey(key: string): boolean {
		return key.length === 1 && key.toLowerCase() in this.PIANO_KEYBOARD_MAP;
	}

	static mapKeyboardKeyToNote(key: string): { noteName: NoteName; octave: number } | null {
		const lowerKey = key.toLowerCase();
		const keyMapping = this.PIANO_KEYBOARD_MAP[lowerKey];
		if (!keyMapping) {
			return null;
		}

		const currentOctave = editorStateStore.octave;
		const calculatedOctave = currentOctave + keyMapping.octaveOffset;

		if (calculatedOctave < 0 || calculatedOctave > 8) {
			return null;
		}

		return {
			noteName: keyMapping.noteName,
			octave: calculatedOctave
		};
	}

	static getLetterNote(key: string): NoteName | null {
		const upperKey = key.toUpperCase();
		return this.LETTER_NOTE_MAP[upperKey] || null;
	}
}
