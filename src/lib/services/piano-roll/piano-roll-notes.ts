import {
	getEffectColumnCountFromGenericRow,
	readEffectsFromGenericRow
} from '../../chips/base/channel-effect-columns';
import {
	generalPianoEffectGesture,
	type PianoEffectGesture
} from '../../chips/base/piano-effect-gesture';
import type { GenericRow } from '../../models/song/generic';
import { TUNING_TABLE_NOTE_COUNT } from '../../utils/note-utils';
import { MAX_TABLE_ID } from '../../utils/table-id';
import type { EffectLike } from '../../utils/type-guards';
import { isGateKind, nextNoteEvent, noteEventKind, notePitchIndex } from './piano-note-events';
import { INSTRUMENT_FIELD_KEY, TABLE_FIELD_KEY, type AmplitudeField } from './piano-roll-schema';

export const PIANO_ROLL_PITCH_COUNT = TUNING_TABLE_NOTE_COUNT;

export interface PianoNoteSpot {
	startRow: number;
	pitchIndex: number;
}

export interface PianoNoteBlock extends PianoNoteSpot {
	endRow: number;
	note: string;
	instrument: number | null;
	gestures: PianoEffectGesture[];
	level?: number | null;
	conflict?: boolean;
}

export interface PianoGateMarker {
	row: number;
	kind: 'off' | 'release';
}

export interface PianoRollNotes {
	blocks: PianoNoteBlock[];
	gates: PianoGateMarker[];
}

export type OrnamentTable = { rows: readonly number[]; additive: boolean };
export type OrnamentLookup = (tableId: number) => OrnamentTable | null;
export type OrnamentCarry = { id: number | null };
export type PianoGestureReader = (effect: EffectLike) => PianoEffectGesture | null;

export interface CollectPianoNotesOptions {
	gestureFor?: PianoGestureReader;
	amplitude?: readonly AmplitudeField[];
	amplitudeCarry?: Map<string, number>;
	ornament?: { lookup: OrnamentLookup; carry: OrnamentCarry };
}

const NOTE_FILL_ALPHA = 0.92;
const QUIET_NOTE_FILL_ALPHA = 0.26;

export function sameNoteSpot(left: PianoNoteSpot, right: PianoNoteSpot): boolean {
	return left.startRow === right.startRow && left.pitchIndex === right.pitchIndex;
}

export function noteSpotKey(spot: PianoNoteSpot): string {
	return `${spot.startRow}:${spot.pitchIndex}`;
}

export function blockLength(block: { startRow: number; endRow: number }): number {
	return Math.max(1, block.endRow - block.startRow);
}

export function noteLevelAlpha(level: number | null | undefined): number {
	if (level === null || level === undefined) return NOTE_FILL_ALPHA;
	const clamped = Math.min(1, Math.max(0, level));
	const shaped = clamped ** 1.45;
	return QUIET_NOTE_FILL_ALPHA + (NOTE_FILL_ALPHA - QUIET_NOTE_FILL_ALPHA) * shaped;
}

export function carryAmplitude(
	rows: readonly GenericRow[],
	fields: readonly AmplitudeField[],
	carry: Map<string, number>
): void {
	if (fields.length === 0) return;
	for (const row of rows) applyRowAmplitude(row, fields, carry);
}

export function ornamentSteps(rows: readonly number[], additive: boolean): number[] {
	const steps: number[] = [];
	const seen = new Set<number>();
	let cursor = 0;
	for (const raw of rows) {
		if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
		const offset = additive ? cursor + raw : raw;
		if (additive) cursor = offset;
		const step = Math.trunc(offset);
		if (step === 0 || seen.has(step)) continue;
		seen.add(step);
		steps.push(step);
	}
	return steps;
}

export function patternTableId(value: unknown): number | null | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return undefined;
	if (value < 0) return null;
	const id = Math.trunc(value) - 1;
	if (id < 0 || id > MAX_TABLE_ID) return undefined;
	return id;
}

export function carryOrnament(rows: readonly GenericRow[], carry: OrnamentCarry): void {
	for (const row of rows) {
		const next = patternTableId(row?.[TABLE_FIELD_KEY]);
		if (next !== undefined) carry.id = next;
	}
}

export function collectPianoNotes(
	rows: GenericRow[],
	noteKey: string,
	options: CollectPianoNotesOptions = {}
): PianoRollNotes {
	const {
		gestureFor = generalPianoEffectGesture,
		amplitude = [],
		amplitudeCarry = new Map<string, number>(),
		ornament
	} = options;
	const blocks: PianoNoteBlock[] = [];
	const gates: PianoGateMarker[] = [];
	for (let row = 0; row < rows.length; row++) {
		const level =
			amplitude.length > 0 ? applyRowAmplitude(rows[row], amplitude, amplitudeCarry) : null;
		const tableBefore = ornament?.carry.id ?? null;
		if (ornament) {
			const nextTable = patternTableId(rows[row]?.[TABLE_FIELD_KEY]);
			if (nextTable !== undefined) ornament.carry.id = nextTable;
		}
		const value = rows[row]?.[noteKey];
		const kind = noteEventKind(value);
		if (isGateKind(kind)) {
			gates.push({ row, kind });
			continue;
		}
		const pitchIndex = notePitchIndex(value);
		if (pitchIndex === null || typeof value !== 'string') continue;
		const endRow = nextNoteEvent(rows, noteKey, row + 1)?.row ?? rows.length;
		const gestures = gesturesForSpan(
			rows,
			row,
			endRow,
			blocks.at(-1)?.pitchIndex ?? null,
			gestureFor
		);
		if (ornament) {
			const steps = ornamentGestureSteps(rows, row, endRow, tableBefore, ornament.lookup);
			if (steps.length > 0) gestures.push({ kind: 'arpeggio', steps });
		}
		blocks.push({
			startRow: row,
			endRow,
			pitchIndex,
			note: value,
			instrument: positiveNumber(rows[row]?.[INSTRUMENT_FIELD_KEY]),
			gestures,
			...(amplitude.length > 0 ? { level } : {})
		});
	}
	return { blocks, gates };
}

function positiveNumber(value: unknown): number | null {
	return typeof value === 'number' && value > 0 ? value : null;
}

function readAmplitude(value: unknown, field: AmplitudeField): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value === 0 || field.max <= 0)
		return null;
	if (value < 0) return field.allowZeroValue ? 0 : null;
	return Math.min(field.max, value) / field.max;
}

function applyRowAmplitude(
	row: GenericRow | undefined,
	fields: readonly AmplitudeField[],
	carry: Map<string, number>
): number | null {
	for (const field of fields) {
		const level = readAmplitude(row?.[field.key], field);
		if (level !== null) carry.set(field.key, level);
	}
	if (carry.size === 0) return null;
	let peak = 0;
	for (const level of carry.values()) if (level > peak) peak = level;
	return peak;
}

function ornamentGestureSteps(
	rows: readonly GenericRow[],
	start: number,
	end: number,
	initial: number | null,
	lookup: OrnamentLookup
): number[] {
	let id = initial;
	const steps = new Set<number>();
	for (let row = start; row < end; row++) {
		const next = patternTableId(rows[row]?.[TABLE_FIELD_KEY]);
		if (next !== undefined) id = next;
		if (id === null) continue;
		const table = lookup(id);
		if (!table) continue;
		for (const step of ornamentSteps(table.rows, table.additive)) steps.add(step);
	}
	return [...steps];
}

function gesturesForSpan(
	rows: GenericRow[],
	startRow: number,
	endRow: number,
	previousPitch: number | null,
	gestureFor: PianoGestureReader
): PianoEffectGesture[] {
	const gestures: PianoEffectGesture[] = [];
	for (let row = startRow; row < endRow; row++) {
		const source = rows[row];
		if (!source) continue;
		for (const effect of readEffectsFromGenericRow(
			source,
			getEffectColumnCountFromGenericRow(source)
		)) {
			const gesture = effect ? gestureFor(effect) : null;
			if (!gesture) continue;
			gestures.push(
				gesture.kind === 'portamento'
					? { ...gesture, fromPitch: gesture.fromPitch ?? previousPitch }
					: gesture
			);
		}
	}
	return gestures;
}
