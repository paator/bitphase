import type { ChipField, ChipSchema, FieldType } from '../../chips/base/schema';
import { getGlobalColumnLabel } from '../../chips/base/schema';
import {
	getChannelEffectColumnLabel,
	getChannelLayout,
	getEffectColumnCountFromGenericRow,
	isEffectFieldKey,
	readEffectsFromGenericRow
} from '../../chips/base/channel-effect-columns';
import {
	generalPianoEffectGesture,
	type PianoEffectGesture
} from '../../chips/base/piano-effect-gesture';
import type { GenericPattern, GenericRow } from '../../models/song/generic';
import { MAX_TABLE_ID } from '../../utils/table-id';
import type { EffectLike } from '../../utils/type-guards';
import {
	noteToTuningTableIndex,
	parseNoteFromString,
	TUNING_TABLE_NOTE_COUNT
} from '../../utils/note-utils';

export const PIANO_ROLL_PITCH_COUNT = TUNING_TABLE_NOTE_COUNT;

export interface PianoRollChannelOption {
	songIndex: number;
	channelIndex: number;
	chipName: string;
	chipType: string;
	label: string;
}

export interface PianoRollLane {
	key: string;
	fieldKey: string;
	label: string;
	kind: 'value' | 'effect';
	isGlobal: boolean;
	fieldType: FieldType;
	length: number;
	allowZeroValue?: boolean;
	noteEquivalent?: boolean;
	color?: string;
	maxValue: number;
}

export interface PianoNoteBlock {
	startRow: number;
	endRow: number;
	pitchIndex: number;
	note: string;
	instrument: number | null;
	gestures: PianoEffectGesture[];
	level?: number | null;
	conflict?: boolean;
}

export interface PianoTimelineBlock extends PianoNoteBlock {
	orderIndex: number;
	patternId: number;
	localStartRow: number;
}

export interface PianoGateMarker {
	row: number;
	kind: 'off' | 'release';
}

export interface PianoTimelineGate extends PianoGateMarker {
	orderIndex: number;
	patternId: number;
	localRow: number;
}

export interface PianoTimelineSpan {
	orderIndex: number;
	patternId: number;
	length: number;
	startRow: number;
}

export interface PianoRollNotes {
	blocks: PianoNoteBlock[];
	gates: PianoGateMarker[];
}

export interface AmplitudeField {
	key: string;
	max: number;
	allowZeroValue?: boolean;
}

const NOTE_FILL_ALPHA = 0.92;
const QUIET_NOTE_FILL_ALPHA = 0.26;

export function noteLevelAlpha(level: number | null | undefined): number {
	if (level === null || level === undefined) return NOTE_FILL_ALPHA;
	const clamped = Math.min(1, Math.max(0, level));
	const shaped = clamped ** 1.45;
	return QUIET_NOTE_FILL_ALPHA + (NOTE_FILL_ALPHA - QUIET_NOTE_FILL_ALPHA) * shaped;
}

export function amplitudeFields(schema: ChipSchema): AmplitudeField[] {
	const fields: AmplitudeField[] = [];
	for (const field of Object.values(schema.fields)) {
		if (!field.amplitude || field.skip) continue;
		fields.push({
			key: field.key,
			max: maxForField(field),
			allowZeroValue: field.allowZeroValue
		});
	}
	return fields;
}

function readAmplitude(value: unknown, field: AmplitudeField): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value === 0 || field.max <= 0) return null;
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

export function carryAmplitude(
	rows: readonly GenericRow[],
	fields: readonly AmplitudeField[],
	carry: Map<string, number>
): void {
	if (fields.length === 0) return;
	for (const row of rows) applyRowAmplitude(row, fields, carry);
}

export function findNoteFieldKey(schema: ChipSchema): string | null {
	for (const field of Object.values(schema.fields)) {
		if (field.type === 'note' && !field.skip) return field.key;
	}
	return null;
}

export function listPianoRollChannels(
	songs: Array<{ getEffectiveChannelLabels(): string[] }>,
	chips: Array<{ name: string; type: string } | null | undefined>
): PianoRollChannelOption[] {
	const options: PianoRollChannelOption[] = [];
	for (let songIndex = 0; songIndex < songs.length; songIndex++) {
		const song = songs[songIndex];
		const chip = chips[songIndex];
		if (!song || !chip) continue;
		const labels = song.getEffectiveChannelLabels();
		for (let channelIndex = 0; channelIndex < labels.length; channelIndex++) {
			options.push({
				songIndex,
				channelIndex,
				chipName: chip.name,
				chipType: chip.type,
				label: labels[channelIndex] ?? `${channelIndex + 1}`
			});
		}
	}
	return options;
}

export function listPianoRollLanes(schema: ChipSchema, effectColumnCount: number): PianoRollLane[] {
	const layout = getChannelLayout(schema, effectColumnCount);
	const lanes: PianoRollLane[] = [];
	for (const fieldKey of orderedFieldKeys(layout.template, layout.fields)) {
		const field = layout.fields[fieldKey];
		if (!field || field.skip || field.type === 'note') continue;
		lanes.push(laneFromField(field, false, schema));
	}
	if (schema.globalFields) {
		for (const fieldKey of orderedFieldKeys(schema.globalTemplate ?? '', schema.globalFields)) {
			const field = schema.globalFields[fieldKey];
			if (!field || field.skip || field.type === 'note') continue;
			lanes.push(laneFromField(field, true, schema));
		}
	}
	return disambiguateLabels(lanes);
}

export function noteEventKind(value: unknown): 'empty' | 'pitched' | 'off' | 'release' {
	if (value == null) return 'empty';
	if (typeof value !== 'string' || value === '' || value === '---') return 'empty';
	if (value === 'OFF' || value === 'R--') return 'off';
	if (value === '===') return 'release';
	const parsed = parseNoteFromString(value);
	const pitch = noteToTuningTableIndex(parsed.noteName, parsed.octave);
	return pitch === null ? 'empty' : 'pitched';
}

export type OrnamentTable = { rows: readonly number[]; additive: boolean };
export type OrnamentLookup = (tableId: number) => OrnamentTable | null;
export type OrnamentCarry = { id: number | null };

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
		const next = patternTableId(row?.table);
		if (next !== undefined) carry.id = next;
	}
}

function ornamentGestureSteps(
	rows: readonly GenericRow[],
	start: number,
	end: number,
	initial: number | null,
	lookup: OrnamentLookup
): number[] {
	let id = initial;
	const steps: number[] = [];
	const seen = new Set<number>();
	for (let row = start; row < end; row++) {
		const next = patternTableId(rows[row]?.table);
		if (next !== undefined) id = next;
		if (id === null) continue;
		const table = lookup(id);
		if (!table) continue;
		for (const step of ornamentSteps(table.rows, table.additive)) {
			if (seen.has(step)) continue;
			seen.add(step);
			steps.push(step);
		}
	}
	return steps;
}

function gesturesForSpan(
	rows: GenericRow[],
	startRow: number,
	endRow: number,
	previousPitch: number | null,
	gestureFor: (effect: EffectLike) => PianoEffectGesture | null
): PianoEffectGesture[] {
	const gestures: PianoEffectGesture[] = [];
	for (let row = startRow; row < endRow; row++) {
		const source = rows[row];
		if (!source) continue;
		const effects = readEffectsFromGenericRow(source, getEffectColumnCountFromGenericRow(source));
		for (const effect of effects) {
			if (!effect) continue;
			const gesture = gestureFor(effect);
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

export function collectPianoNotes(
	rows: GenericRow[],
	noteKey: string,
	gestureFor: (effect: EffectLike) => PianoEffectGesture | null = generalPianoEffectGesture,
	amplitude: readonly AmplitudeField[] = [],
	carry: Map<string, number> = new Map(),
	ornament?: { lookup: OrnamentLookup; carry: OrnamentCarry }
): PianoRollNotes {
	const blocks: PianoNoteBlock[] = [];
	const gates: PianoGateMarker[] = [];
	for (let row = 0; row < rows.length; row++) {
		const level = amplitude.length > 0 ? applyRowAmplitude(rows[row], amplitude, carry) : null;
		const tableBefore = ornament?.carry.id ?? null;
		if (ornament) {
			const nextTable = patternTableId(rows[row]?.table);
			if (nextTable !== undefined) ornament.carry.id = nextTable;
		}
		const value = rows[row]?.[noteKey];
		const kind = noteEventKind(value);
		if (kind === 'off' || kind === 'release') {
			gates.push({ row, kind });
			continue;
		}
		if (kind !== 'pitched' || typeof value !== 'string') continue;
		const parsed = parseNoteFromString(value);
		const pitchIndex = noteToTuningTableIndex(parsed.noteName, parsed.octave);
		if (pitchIndex === null) continue;
		let endRow = rows.length;
		for (let next = row + 1; next < rows.length; next++) {
			if (noteEventKind(rows[next]?.[noteKey]) !== 'empty') {
				endRow = next;
				break;
			}
		}
		const instrumentRaw = rows[row]?.instrument;
		const instrument =
			typeof instrumentRaw === 'number' && instrumentRaw > 0 ? instrumentRaw : null;
		const gestures = gesturesForSpan(rows, row, endRow, blocks.at(-1)?.pitchIndex ?? null, gestureFor);
		if (ornament) {
			const steps = ornamentGestureSteps(rows, row, endRow, tableBefore, ornament.lookup);
			if (steps.length > 0) gestures.push({ kind: 'arpeggio', steps });
		}
		blocks.push({
			startRow: row,
			endRow,
			pitchIndex,
			note: value,
			instrument,
			gestures,
			...(amplitude.length > 0 ? { level } : {})
		});
	}
	return { blocks, gates };
}

export function buildPianoTimeline(
	order: readonly number[],
	lengthOf: (patternId: number) => number | undefined
): PianoTimelineSpan[] {
	const spans: PianoTimelineSpan[] = [];
	let startRow = 0;
	for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
		const patternId = order[orderIndex];
		if (patternId === undefined) continue;
		const length = lengthOf(patternId);
		if (length === undefined || length <= 0) continue;
		spans.push({ orderIndex, patternId, length, startRow });
		startRow += length;
	}
	return spans;
}

export function timelineColumnCount(spans: readonly PianoTimelineSpan[]): number {
	const last = spans[spans.length - 1];
	if (!last) return 0;
	return last.startRow + last.length;
}

export function continueOpenNoteBlocks<T extends { startRow: number; endRow: number }>(
	blocks: T[],
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	rowsForSpan: (span: PianoTimelineSpan) => readonly GenericRow[] | undefined
): void {
	for (const block of blocks) {
		let spanIndex = 0;
		while (
			spanIndex < spans.length &&
			block.startRow >= (spans[spanIndex]?.startRow ?? 0) + (spans[spanIndex]?.length ?? 0)
		) {
			spanIndex++;
		}
		const span = spans[spanIndex];
		if (!span || block.endRow !== span.startRow + span.length) continue;
		let end = block.endRow;
		for (let index = spanIndex + 1; index < spans.length; index++) {
			const next = spans[index];
			if (!next) break;
			const rows = rowsForSpan(next);
			if (!rows) break;
			let stopped = false;
			for (let local = 0; local < next.length; local++) {
				if (noteEventKind(rows[local]?.[noteKey]) === 'empty') continue;
				end = next.startRow + local;
				stopped = true;
				break;
			}
			if (stopped) break;
			end = next.startRow + next.length;
		}
		if (end > block.endRow) block.endRow = end;
	}
}

function eachTimelineRow(
	spans: readonly PianoTimelineSpan[],
	from: number,
	to: number,
	rowsForSpan: (span: PianoTimelineSpan) => GenericRow[] | undefined,
	visit: (cell: GenericRow, span: PianoTimelineSpan) => void
): void {
	for (const span of spans) {
		const spanEnd = span.startRow + span.length;
		if (spanEnd <= from) continue;
		if (span.startRow >= to) break;
		const rows = rowsForSpan(span);
		if (!rows) continue;
		const start = Math.max(span.startRow, from);
		const end = Math.min(spanEnd, to);
		for (let absolute = start; absolute < end; absolute++) {
			const cell = rows[absolute - span.startRow];
			if (cell) visit(cell, span);
		}
	}
}

export function writeSpilledNoteTail(
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	absoluteStart: number,
	length: number,
	release: boolean,
	rowsForSpan: (span: PianoTimelineSpan) => GenericRow[] | undefined
): Set<number> {
	const changed = new Set<number>();
	if (length < 1) return changed;
	const gate = release ? '===' : 'OFF';
	const end = absoluteStart + length;
	eachTimelineRow(spans, absoluteStart + 1, end, rowsForSpan, (cell, span) => {
		if (noteEventKind(cell[noteKey]) === 'empty') return;
		cell[noteKey] = '---';
		changed.add(span.patternId);
	});
	eachTimelineRow(spans, end, end + 1, rowsForSpan, (cell, span) => {
		if (noteEventKind(cell[noteKey]) === 'pitched' || cell[noteKey] === gate) return;
		cell[noteKey] = gate;
		changed.add(span.patternId);
	});
	return changed;
}

export function clearSpilledNoteGate(
	spans: readonly PianoTimelineSpan[],
	noteKey: string,
	patternEnd: number,
	rowsForSpan: (span: PianoTimelineSpan) => GenericRow[] | undefined
): Set<number> {
	const changed = new Set<number>();
	for (const span of spans) {
		const spanEnd = span.startRow + span.length;
		if (spanEnd <= patternEnd) continue;
		const rows = rowsForSpan(span);
		if (!rows) break;
		const from = Math.max(0, patternEnd - span.startRow);
		for (let local = from; local < span.length; local++) {
			const cell = rows[local];
			const kind = noteEventKind(cell?.[noteKey]);
			if (kind === 'empty') continue;
			if ((kind === 'off' || kind === 'release') && cell) {
				cell[noteKey] = '---';
				changed.add(span.patternId);
			}
			return changed;
		}
	}
	return changed;
}

export function timelineSpanIndex(spans: readonly PianoTimelineSpan[], absoluteRow: number): number {
	let low = 0;
	let high = spans.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		const span = spans[mid];
		if (!span || absoluteRow < span.startRow) high = mid - 1;
		else if (absoluteRow >= span.startRow + span.length) low = mid + 1;
		else return mid;
	}
	return -1;
}

export function timelineSpanAt(
	spans: readonly PianoTimelineSpan[],
	absoluteRow: number
): { span: PianoTimelineSpan; localRow: number } | null {
	const index = timelineSpanIndex(spans, absoluteRow);
	const span = index < 0 ? undefined : spans[index];
	if (!span) return null;
	return { span, localRow: absoluteRow - span.startRow };
}

export function timelineWindow(
	spans: readonly PianoTimelineSpan[],
	startRow: number,
	endRow: number
): PianoTimelineSpan[] {
	if (spans.length === 0 || endRow <= startRow) return [];
	let first = timelineSpanIndex(spans, Math.max(0, startRow));
	if (first < 0) {
		const tail = spans[spans.length - 1];
		first = tail && startRow >= tail.startRow + tail.length ? spans.length - 1 : 0;
	}
	let last = first;
	while (last + 1 < spans.length && (spans[last + 1]?.startRow ?? Number.POSITIVE_INFINITY) < endRow) {
		last++;
	}
	const from = Math.max(0, first - 1);
	const to = Math.min(spans.length - 1, last + 1);
	return spans.slice(from, to + 1);
}

export function shiftPianoNotes(
	notes: PianoRollNotes,
	span: PianoTimelineSpan
): { blocks: PianoTimelineBlock[]; gates: PianoTimelineGate[] } {
	return {
		blocks: notes.blocks.map((block) => ({
			...block,
			startRow: block.startRow + span.startRow,
			endRow: block.endRow + span.startRow,
			localStartRow: block.startRow,
			orderIndex: span.orderIndex,
			patternId: span.patternId
		})),
		gates: notes.gates.map((gate) => ({
			...gate,
			row: gate.row + span.startRow,
			localRow: gate.row,
			orderIndex: span.orderIndex,
			patternId: span.patternId
		}))
	};
}

export function setNoteValue(
	generic: GenericPattern,
	channelIndex: number,
	row: number,
	noteKey: string,
	note: string
): boolean {
	const target = generic.channels[channelIndex]?.rows[row];
	if (!target || target[noteKey] === note) return false;
	target[noteKey] = note;
	return true;
}

export function movePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	instrumentKey: string | null,
	fromRow: number,
	toRow: number,
	note: string,
	length: number | null = null
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	const source = rows?.[fromRow];
	const destination = rows?.[toRow];
	if (!source || !destination) return false;
	if (noteEventKind(source[noteKey]) !== 'pitched') return false;
	if (fromRow === toRow && source[noteKey] === note) return false;
	const sourceInstrument = instrumentKey ? source[instrumentKey] : undefined;
	const carryInstrument = typeof sourceInstrument === 'number' && sourceInstrument > 0;
	if (length === null || length < 1) {
		if (fromRow !== toRow) {
			source[noteKey] = '---';
			if (carryInstrument && instrumentKey) source[instrumentKey] = 0;
		}
		destination[noteKey] = note;
		if (carryInstrument && instrumentKey && fromRow !== toRow) destination[instrumentKey] = sourceInstrument;
		return true;
	}
	const release = noteEventKind(rows[fromRow + length]?.[noteKey]) === 'release';
	let covered = false;
	for (let row = toRow - 1; row >= 0; row--) {
		if (row === fromRow) continue;
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		covered = kind === 'pitched';
		break;
	}
	let terminator: number | null = null;
	for (let row = fromRow + 1; row < rows.length; row++) {
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		if (kind === 'off' || kind === 'release') terminator = row;
		break;
	}
	if (fromRow !== toRow) {
		let previousExtends = false;
		for (let row = fromRow - 1; row >= 0; row--) {
			const kind = noteEventKind(rows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			previousExtends = kind === 'pitched';
			break;
		}
		source[noteKey] = previousExtends ? 'OFF' : '---';
		if (carryInstrument && instrumentKey) source[instrumentKey] = 0;
		const end = toRow + length;
		if (terminator !== null && terminator !== toRow && (terminator <= toRow || terminator >= end)) {
			rows[terminator][noteKey] = '---';
		}
	}
	destination[noteKey] = note;
	if (carryInstrument && instrumentKey && fromRow !== toRow) destination[instrumentKey] = sourceInstrument;
	const end = toRow + length;
	for (let row = toRow + 1; row < end && row < rows.length; row++) {
		if (noteEventKind(rows[row]?.[noteKey]) !== 'empty') rows[row][noteKey] = '---';
	}
	if (end < rows.length && noteEventKind(rows[end]?.[noteKey]) !== 'pitched') {
		rows[end][noteKey] = release ? '===' : 'OFF';
	}
	if (covered && noteEventKind(rows[end]?.[noteKey]) !== 'pitched') {
		for (let row = end + 1; row < rows.length; row++) {
			const kind = noteEventKind(rows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			if (kind === 'off' || kind === 'release') rows[row][noteKey] = '---';
			break;
		}
	}
	return true;
}

export function relocatePitchedNote(
	sourcePattern: GenericPattern,
	destinationPattern: GenericPattern,
	channelIndex: number,
	noteKey: string,
	instrumentKey: string | null,
	fromRow: number,
	toRow: number,
	note: string,
	length: number | null
): boolean {
	if (sourcePattern === destinationPattern) {
		return movePitchedNote(
			sourcePattern,
			channelIndex,
			noteKey,
			instrumentKey,
			fromRow,
			toRow,
			note,
			length
		);
	}
	const sourceRows = sourcePattern.channels[channelIndex]?.rows;
	const destinationRows = destinationPattern.channels[channelIndex]?.rows;
	const source = sourceRows?.[fromRow];
	const destination = destinationRows?.[toRow];
	if (!sourceRows || !destinationRows || !source || !destination) return false;
	if (noteEventKind(source[noteKey]) !== 'pitched') return false;
	const sourceInstrument = instrumentKey ? source[instrumentKey] : undefined;
	const carryInstrument = typeof sourceInstrument === 'number' && sourceInstrument > 0;
	const release =
		length !== null && length > 0 && noteEventKind(sourceRows[fromRow + length]?.[noteKey]) === 'release';
	let previousExtends = false;
	for (let row = fromRow - 1; row >= 0; row--) {
		const kind = noteEventKind(sourceRows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		previousExtends = kind === 'pitched';
		break;
	}
	source[noteKey] = length !== null && length > 0 && previousExtends ? 'OFF' : '---';
	if (carryInstrument && instrumentKey) source[instrumentKey] = 0;
	if (length !== null && length > 0) {
		for (let row = fromRow + 1; row < sourceRows.length; row++) {
			const kind = noteEventKind(sourceRows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			if (kind === 'off' || kind === 'release') sourceRows[row][noteKey] = '---';
			break;
		}
	}
	destination[noteKey] = note;
	if (carryInstrument && instrumentKey) destination[instrumentKey] = sourceInstrument;
	if (length === null || length < 1) return true;
	const end = toRow + length;
	for (let row = toRow + 1; row < end && row < destinationRows.length; row++) {
		if (noteEventKind(destinationRows[row]?.[noteKey]) !== 'empty') destinationRows[row][noteKey] = '---';
	}
	if (end < destinationRows.length && noteEventKind(destinationRows[end]?.[noteKey]) !== 'pitched') {
		destinationRows[end][noteKey] = release ? '===' : 'OFF';
	}
	return true;
}

export function pitchedBlockSpan(
	rows: readonly GenericRow[],
	noteKey: string,
	startRow: number
): { length: number; bounded: boolean } | null {
	if (noteEventKind(rows[startRow]?.[noteKey]) !== 'pitched') return null;
	for (let row = startRow + 1; row < rows.length; row++) {
		if (noteEventKind(rows[row]?.[noteKey]) !== 'empty') {
			return { length: row - startRow, bounded: true };
		}
	}
	return { length: Math.max(1, rows.length - startRow), bounded: false };
}

export function removePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRow: number
): boolean {
	return removePitchedNotes(generic, channelIndex, noteKey, [startRow]);
}

export function removePitchedNotes(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRows: readonly number[]
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	if (!rows) return false;
	const starts = [...new Set(startRows)]
		.filter((row) => noteEventKind(rows[row]?.[noteKey]) === 'pitched')
		.sort((left, right) => left - right);
	if (starts.length === 0) return false;
	const startSet = new Set(starts);
	const gates = new Set<number>();
	for (const start of starts) {
		for (let row = start + 1; row < rows.length; row++) {
			if (startSet.has(row)) break;
			const kind = noteEventKind(rows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			if (kind === 'off' || kind === 'release') gates.add(row);
			break;
		}
	}
	const replacements = new Map<number, string>();
	let pendingOff = false;
	for (const start of starts) {
		let previousKind: 'pitched' | 'other' | 'selected' | 'empty' = 'empty';
		for (let row = start - 1; row >= 0; row--) {
			if (gates.has(row)) continue;
			if (startSet.has(row)) {
				previousKind = 'selected';
				break;
			}
			const kind = noteEventKind(rows[row]?.[noteKey]);
			if (kind === 'empty') continue;
			previousKind = kind === 'pitched' ? 'pitched' : 'other';
			break;
		}
		if (previousKind === 'pitched' && !pendingOff) {
			replacements.set(start, 'OFF');
			pendingOff = true;
			continue;
		}
		replacements.set(start, '---');
		if (previousKind !== 'selected') pendingOff = false;
	}
	for (const [row, value] of replacements) {
		const cell = rows[row];
		if (cell) cell[noteKey] = value;
	}
	for (const gate of gates) {
		const cell = rows[gate];
		if (cell) cell[noteKey] = '---';
	}
	return true;
}

export function resizePitchedNote(
	generic: GenericPattern,
	channelIndex: number,
	noteKey: string,
	startRow: number,
	newEndRow: number
): boolean {
	const rows = generic.channels[channelIndex]?.rows;
	if (!rows?.[startRow] || noteEventKind(rows[startRow][noteKey]) !== 'pitched') return false;
	let ownGate: number | null = null;
	let ownRelease = false;
	let blockLimit = rows.length;
	for (let row = startRow + 1; row < rows.length; row++) {
		const kind = noteEventKind(rows[row]?.[noteKey]);
		if (kind === 'empty') continue;
		if ((kind === 'off' || kind === 'release') && ownGate === null) {
			ownGate = row;
			ownRelease = kind === 'release';
			continue;
		}
		blockLimit = row;
		break;
	}
	const end = Math.max(startRow + 1, Math.min(blockLimit, newEndRow));
	if (end >= blockLimit) {
		if (ownGate === null) return false;
		rows[ownGate][noteKey] = '---';
		return true;
	}
	if (ownGate === end) return false;
	if (ownGate !== null) rows[ownGate][noteKey] = '---';
	rows[end][noteKey] = ownRelease ? '===' : 'OFF';
	return true;
}

export function readPianoFieldValue(
	generic: GenericPattern,
	lane: Pick<PianoRollLane, 'isGlobal' | 'fieldKey'>,
	channelIndex: number,
	row: number
): unknown {
	if (lane.isGlobal) return generic.patternRows[row]?.[lane.fieldKey];
	return generic.channels[channelIndex]?.rows[row]?.[lane.fieldKey];
}

export function setPianoFieldValue(
	generic: GenericPattern,
	lane: Pick<PianoRollLane, 'isGlobal' | 'fieldKey'>,
	channelIndex: number,
	row: number,
	value: string | number | null | Record<string, unknown>
): boolean {
	const target = lane.isGlobal
		? generic.patternRows[row]
		: generic.channels[channelIndex]?.rows[row];
	if (!target || target[lane.fieldKey] === value) return false;
	target[lane.fieldKey] = value;
	return true;
}

export function pianoLaneBarValue(raw: unknown, lane: PianoRollLane): number | null {
	if (lane.kind !== 'value' || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
	if (raw === 0) return null;
	if (raw < 0) return 0;
	return Math.min(lane.maxValue, raw);
}

export function pianoLaneValueFromRatio(ratioFromBottom: number, lane: PianoRollLane): number {
	const clamped = Math.max(0, Math.min(1, ratioFromBottom));
	const value = Math.round(clamped * lane.maxValue);
	if (value <= 0) return lane.allowZeroValue ? -1 : 0;
	return value;
}

function orderedFieldKeys(template: string, fields: Record<string, ChipField>): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	for (const match of template.matchAll(/\{([^}]+)\}/g)) {
		const key = match[1];
		if (!key || seen.has(key)) continue;
		seen.add(key);
		keys.push(key);
	}
	for (const key of Object.keys(fields)) {
		if (seen.has(key)) continue;
		seen.add(key);
		keys.push(key);
	}
	return keys;
}

function laneFromField(field: ChipField, isGlobal: boolean, schema: ChipSchema): PianoRollLane {
	const effect = isEffectFieldKey(field.key);
	const globalLabel = isGlobal ? getGlobalColumnLabel(schema, field.key) : field.key;
	const effectLabel = getChannelEffectColumnLabel(field.key);
	const label =
		effectLabel ??
		(isGlobal && globalLabel !== field.key ? globalLabel : humanizeFieldKey(field.key));
	return {
		key: `${isGlobal ? 'g' : 'c'}:${field.key}`,
		fieldKey: field.key,
		label,
		kind: effect ? 'effect' : 'value',
		isGlobal,
		fieldType: field.type,
		length: field.length,
		allowZeroValue: field.allowZeroValue,
		noteEquivalent: field.noteEquivalent,
		color: field.color,
		maxValue: effect ? 0 : maxForField(field)
	};
}

function disambiguateLabels(lanes: PianoRollLane[]): PianoRollLane[] {
	const counts = new Map<string, number>();
	for (const lane of lanes) counts.set(lane.label, (counts.get(lane.label) ?? 0) + 1);
	return lanes.map((lane) => {
		if ((counts.get(lane.label) ?? 0) < 2) return lane;
		return { ...lane, label: humanizeFieldKey(lane.fieldKey) };
	});
}

function humanizeFieldKey(key: string): string {
	const spaced = key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Za-z])(\d+)/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	if (!spaced) return key;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function maxForField(field: ChipField): number {
	const digits = Math.max(1, field.length);
	if (field.type === 'hex') return 16 ** digits - 1;
	if (field.type === 'symbol') return 36 ** digits - 1;
	if (field.type === 'dec') return 10 ** digits - 1;
	return 0;
}
