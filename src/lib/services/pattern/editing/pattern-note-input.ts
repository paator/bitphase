import { NoteName } from '../../../models/song';
import type { Pattern } from '../../../models/song';
import {
	formatNoteFromEnum,
	isNoteInTuningTable,
	isTrackerNoteStringInTuningTable,
	midiNoteToNoteString
} from '../../../utils/note-utils';
import type { EditingContext, FieldInfo, PatternEditingResult } from './editing-context';
import { PatternValueUpdates } from './pattern-value-updates';
import { editorStateStore } from '../../../stores/editor-state.svelte';
import { settingsStore } from '../../../stores/settings.svelte';
import { parseSymbol } from '../../../chips/base/field-formatters';
import { resolveInstrumentChipType } from '../../instrument/instrument-filter';

export class PatternNoteInput {
	private static readonly PIANO_KEYBOARD_MAP: Record<
		string,
		{ noteName: NoteName; octaveOffset: number }
	> = {
		KeyQ: { noteName: NoteName.C, octaveOffset: 1 },
		Digit2: { noteName: NoteName.CSharp, octaveOffset: 1 },
		KeyW: { noteName: NoteName.D, octaveOffset: 1 },
		Digit3: { noteName: NoteName.DSharp, octaveOffset: 1 },
		KeyE: { noteName: NoteName.E, octaveOffset: 1 },
		KeyR: { noteName: NoteName.F, octaveOffset: 1 },
		Digit5: { noteName: NoteName.FSharp, octaveOffset: 1 },
		KeyT: { noteName: NoteName.G, octaveOffset: 1 },
		Digit6: { noteName: NoteName.GSharp, octaveOffset: 1 },
		KeyY: { noteName: NoteName.A, octaveOffset: 1 },
		Digit7: { noteName: NoteName.ASharp, octaveOffset: 1 },
		KeyU: { noteName: NoteName.B, octaveOffset: 1 },
		KeyI: { noteName: NoteName.C, octaveOffset: 2 },
		Digit9: { noteName: NoteName.CSharp, octaveOffset: 2 },
		KeyO: { noteName: NoteName.D, octaveOffset: 2 },
		Digit0: { noteName: NoteName.DSharp, octaveOffset: 2 },
		KeyP: { noteName: NoteName.E, octaveOffset: 2 },
		BracketLeft: { noteName: NoteName.F, octaveOffset: 2 },
		KeyZ: { noteName: NoteName.C, octaveOffset: 0 },
		KeyS: { noteName: NoteName.CSharp, octaveOffset: 0 },
		KeyX: { noteName: NoteName.D, octaveOffset: 0 },
		KeyD: { noteName: NoteName.DSharp, octaveOffset: 0 },
		KeyC: { noteName: NoteName.E, octaveOffset: 0 },
		KeyV: { noteName: NoteName.F, octaveOffset: 0 },
		KeyG: { noteName: NoteName.FSharp, octaveOffset: 0 },
		KeyB: { noteName: NoteName.G, octaveOffset: 0 },
		KeyH: { noteName: NoteName.GSharp, octaveOffset: 0 },
		KeyN: { noteName: NoteName.A, octaveOffset: 0 },
		KeyJ: { noteName: NoteName.ASharp, octaveOffset: 0 },
		KeyM: { noteName: NoteName.B, octaveOffset: 0 },
		Comma: { noteName: NoteName.C, octaveOffset: 1 },
		KeyL: { noteName: NoteName.CSharp, octaveOffset: 1 },
		Period: { noteName: NoteName.D, octaveOffset: 1 },
		Semicolon: { noteName: NoteName.DSharp, octaveOffset: 1 },
		Slash: { noteName: NoteName.E, octaveOffset: 1 }
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
		key: string,
		code: string
	): PatternEditingResult | null {
		if (fieldInfo.isGlobal || fieldInfo.channelIndex < 0) {
			return null;
		}

		const keyboardNote = this.mapKeyboardCodeToNote(code);
		if (keyboardNote) {
			const noteStr = formatNoteFromEnum(keyboardNote.noteName, keyboardNote.octave);
			return this.applyNoteToField(context, fieldInfo, noteStr);
		}

		if (this.isPianoCode(code)) {
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
	): PatternEditingResult | null {
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
	): PatternEditingResult | null {
		if (!isTrackerNoteStringInTuningTable(noteStr)) {
			return null;
		}
		const noteUnchanged = PatternValueUpdates.getFieldValue(context, fieldInfo) === noteStr;
		let updatedPattern = noteUnchanged
			? context.pattern
			: PatternValueUpdates.updateFieldValue(context, fieldInfo, noteStr);
		const patternBeforeInstrument = updatedPattern;
		updatedPattern = this.autoEnterInstrument(context, fieldInfo, updatedPattern);
		const instrumentChanged = updatedPattern !== patternBeforeInstrument;
		if (noteUnchanged && !instrumentChanged) {
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };
		}
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

		const chipType = context.schema.chipType;
		const currentInstrumentId = editorStateStore.getCurrentInstrument(chipType);
		if (
			!currentInstrumentId ||
			!context.instruments?.some(
				(instrument) =>
					instrument.id === currentInstrumentId &&
					resolveInstrumentChipType(instrument) === chipType
			)
		) {
			return pattern;
		}

		const instrumentValue = parseSymbol(currentInstrumentId, instrumentFieldDef.length);

		const instrumentFieldInfo: FieldInfo = {
			fieldKey: 'instrument',
			fieldType: instrumentFieldDef.type,
			isGlobal: false,
			channelIndex: fieldInfo.channelIndex,
			charOffset: 0
		};

		const updatedContext = { ...context, pattern };
		const currentInstrumentValue = PatternValueUpdates.getFieldValue(
			updatedContext,
			instrumentFieldInfo
		);
		if (currentInstrumentValue === instrumentValue) {
			return pattern;
		}

		return PatternValueUpdates.updateFieldValue(
			updatedContext,
			instrumentFieldInfo,
			instrumentValue
		);
	}

	static isPianoCode(code: string): boolean {
		return code in this.PIANO_KEYBOARD_MAP;
	}

	static mapKeyboardCodeToNote(code: string): { noteName: NoteName; octave: number } | null {
		const keyMapping = this.PIANO_KEYBOARD_MAP[code];
		if (!keyMapping) {
			return null;
		}

		const currentOctave = editorStateStore.octave;
		const calculatedOctave = currentOctave + keyMapping.octaveOffset;

		if (!isNoteInTuningTable(keyMapping.noteName, calculatedOctave)) {
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
