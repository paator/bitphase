import type { EditingContext, FieldInfo } from './editing-context';
import type { Pattern } from '../../../models/song';
import { PatternValueUpdates } from './pattern-value-updates';
import { editorStateStore } from '../../../stores/editor-state.svelte';
import { formatNoteFromEnum, midiNoteToNoteString } from '../../../utils/note-utils';
import { noteStringToEnvelopePeriod } from '../../../utils/envelope-note-conversion';
import { PatternNoteInput } from './pattern-note-input';

export class PatternEnvelopeNoteInput {
	static handleEnvelopeNoteInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): { updatedPattern: Pattern; shouldMoveNext: boolean } | null {
		if (!context.tuningTable) {
			return null;
		}

		const keyboardNote = PatternNoteInput.mapKeyboardKeyToNote(key);
		if (keyboardNote) {
			const noteStr = formatNoteFromEnum(keyboardNote.noteName, keyboardNote.octave);
			const envelopePeriod = noteStringToEnvelopePeriod(
				noteStr,
				context.tuningTable,
				editorStateStore.octave
			);
			const updatedPattern = PatternValueUpdates.updateFieldValue(
				context,
				fieldInfo,
				envelopePeriod
			);
			return { updatedPattern, shouldMoveNext: false };
		}

		const upperKey = key.toUpperCase();
		if (upperKey === 'A') {
			const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, 0);
			return { updatedPattern, shouldMoveNext: false };
		}

		const letterNote = PatternNoteInput.getLetterNote(key);
		if (letterNote) {
			const currentOctave = editorStateStore.octave;
			const noteStr = formatNoteFromEnum(letterNote, currentOctave);
			const envelopePeriod = noteStringToEnvelopePeriod(
				noteStr,
				context.tuningTable,
				currentOctave
			);
			const updatedPattern = PatternValueUpdates.updateFieldValue(
				context,
				fieldInfo,
				envelopePeriod
			);
			return { updatedPattern, shouldMoveNext: false };
		}

		return null;
	}

	static handleMidiNoteInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		midiNote: number
	): { updatedPattern: Pattern; shouldMoveNext: boolean } | null {
		if (!context.tuningTable) {
			return null;
		}
		const noteStr = midiNoteToNoteString(midiNote);
		if (!noteStr) return null;
		const envelopePeriod = noteStringToEnvelopePeriod(
			noteStr,
			context.tuningTable,
			editorStateStore.octave
		);
		const updatedPattern = PatternValueUpdates.updateFieldValue(
			context,
			fieldInfo,
			envelopePeriod
		);
		return { updatedPattern, shouldMoveNext: false };
	}
}
