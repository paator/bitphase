import { formatHex, parseHex } from '../../chips/base/field-formatters';
import {
	envelopePeriodToNoteString,
	noteStringToEnvelopePeriod
} from '../../utils/envelope-note-conversion';
import { NoteName } from '../../models/song';
import { parseNoteFromString } from '../../utils/note-utils';
import { formatPianoSymbolInput } from './piano-symbol-input';
import type { PianoRollLane } from './piano-roll-model';

export function clampPianoHexInput(text: string, length: number): string {
	return text
		.toUpperCase()
		.replace(/[^0-9A-F.]/g, '')
		.slice(0, Math.max(1, length));
}

export function formatPianoHexInput(
	value: unknown,
	length: number,
	allowZeroValue?: boolean
): string {
	const raw =
		typeof value === 'number' || typeof value === 'string' || value == null ? value : null;
	const text = formatHex(raw, length, allowZeroValue);
	return /^\.+$/.test(text) ? '' : text;
}

export function pianoHexInputValue(
	text: string,
	length: number,
	allowZeroValue?: boolean
): number | undefined {
	const cleaned = clampPianoHexInput(text, length);
	if (!cleaned || /^\.+$/.test(cleaned)) return 0;
	const digits = cleaned.replace(/\./g, '0');
	if (!/^[0-9A-F]+$/.test(digits)) return undefined;
	const parsed = parseHex(digits.padStart(length, '0'), length, allowZeroValue);
	return parsed ?? undefined;
}

export function laneShowsNote(
	lane: Pick<PianoRollLane, 'noteEquivalent'> | null | undefined,
	envelopeAsNote: boolean
): boolean {
	return !!lane?.noteEquivalent && envelopeAsNote;
}

export function clampPianoNoteInput(text: string): string {
	return text
		.toUpperCase()
		.replace(/[^A-G0-9#\-]/g, '')
		.slice(0, 3);
}

export function pianoNoteInputPeriod(text: string, tuningTable: readonly number[]): number | undefined {
	const cleaned = clampPianoNoteInput(text).replace(/^([A-G])(\d)$/, '$1-$2');
	if (!cleaned || cleaned === '---' || cleaned === 'OFF' || cleaned === '===') return 0;
	if (!tuningTable.length) return undefined;
	const parsed = parseNoteFromString(cleaned);
	if (parsed.noteName < NoteName.C || parsed.noteName > NoteName.B) return undefined;
	return noteStringToEnvelopePeriod(cleaned, [...tuningTable], parsed.octave);
}

export function formatPianoEnvelopeNote(
	value: unknown,
	length: number,
	allowZeroValue: boolean | undefined,
	tuningTable: readonly number[]
): string {
	if (typeof value === 'number' && value > 0 && tuningTable.length > 0) {
		const note = envelopePeriodToNoteString(value, [...tuningTable]);
		if (note) return note;
	}
	return formatPianoHexInput(value, length, allowZeroValue);
}

export function formatPianoTypedLabel(
	raw: unknown,
	lane: Pick<PianoRollLane, 'fieldType' | 'length' | 'allowZeroValue' | 'noteEquivalent'>,
	envelopeAsNote: boolean,
	tuningTable: readonly number[] | undefined
): string {
	if (laneShowsNote(lane, envelopeAsNote) && tuningTable) {
		return formatPianoEnvelopeNote(raw, lane.length, lane.allowZeroValue, tuningTable);
	}
	if (lane.fieldType === 'hex') return formatPianoHexInput(raw, lane.length, lane.allowZeroValue);
	return formatPianoSymbolInput(raw, lane.length, lane.allowZeroValue);
}
