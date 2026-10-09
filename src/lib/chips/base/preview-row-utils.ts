import type { ChipSchema } from './schema';
import type { Pattern } from '../../models/song';
import { Pattern as PatternModel, Note } from '../../models/song';
import { parseNoteFromString } from '../../utils/note-utils';
import { instrumentIdToNumber } from '../../utils/instrument-id';
import { isValidTableDisplayChar, tableDisplayCharToId } from '../../utils/table-id';

export function parseClampedHex(s: string, digits: number, max: number): number {
	const n = parseInt(s.replace(/[^0-9a-fA-F]/g, '').slice(0, digits) || '0', 16);
	return Number.isNaN(n) ? 0 : Math.max(0, Math.min(max, n));
}

export function sanitizeHexInput(s: string, digits: number): string {
	return (s || '')
		.replace(/[^0-9a-fA-F]/gi, '')
		.slice(0, digits)
		.toUpperCase();
}

export function parseTableChar(s: string): number {
	if (!s || s.length === 0) return 0;
	const c = s.toUpperCase().slice(0, 1);
	if (c === '0') return -1;
	const tableId = tableDisplayCharToId(c);
	return tableId >= 0 ? tableId + 1 : 0;
}

export function sanitizeTableInput(s: string): string {
	const c = (s || '').slice(-1).toUpperCase();
	if (c === '0' || isValidTableDisplayChar(c)) return c;
	return '';
}

export function filterVolumeInput(s: string, previous: string): string {
	const v = sanitizeHexInput(s, 1);
	if (!v) return '';
	const n = parseInt(v, 16);
	return n >= 1 && n <= 15 ? v : previous;
}

export function clampVolumeInput(s: string): string {
	const v = sanitizeHexInput(s, 1);
	if (!v) return 'F';
	const n = parseInt(v, 16);
	return n >= 1 && n <= 15 ? v : 'F';
}

export function previewVolumeValue(volume: string): number {
	return volume ? Math.max(1, Math.min(15, parseClampedHex(volume, 1, 15))) : 15;
}

type PreviewMacro = { values: unknown[]; loop: number; release?: number };

export function previewMacrosReleaseOnKeyUp(macros: PreviewMacro[] | undefined): boolean {
	if (!macros) return false;
	return macros.some((macro) => {
		const release = macro.release ?? -1;
		return release >= 0 && release < macro.values.length;
	});
}

export function previewReleaseTailMs(
	macros: PreviewMacro[] | undefined,
	interruptFrequency: number
): number | null {
	if (!macros?.length) return null;
	const hz = interruptFrequency > 0 ? interruptFrequency : 50;
	let ticks = 0;
	let found = false;
	for (const macro of macros) {
		const len = macro.values.length;
		const release = macro.release ?? -1;
		if (release < 0 || release >= len) continue;
		found = true;
		const loopStart = macro.loop > 0 && macro.loop < len ? macro.loop : 0;
		if (loopStart >= release && len - loopStart > 1) return null;
		ticks = Math.max(ticks, len - release);
	}
	if (!found) return null;
	return Math.ceil(((ticks + 1) / hz) * 1000) + 40;
}

export function notesForProcessor(
	noteStrings: string[],
	processorIndex: number,
	channelCount: number
): string[] {
	const start = processorIndex * channelCount;
	return Array.from({ length: channelCount }, (_, i) => noteStrings[start + i] ?? 'OFF');
}

export function previewChannelForNote(
	noteIndex: number,
	channelCount: number,
	startChannel: number
): number {
	const count = Math.max(1, channelCount);
	const start = normalizePreviewChannel(startChannel, count);
	const index = Number.isFinite(noteIndex) ? Math.max(0, Math.trunc(noteIndex)) : 0;
	return (start + index) % count;
}

export function placePreviewNotes(
	noteStrings: string[],
	channelCount: number,
	startChannel: number
): string[] {
	const count = Math.max(1, channelCount);
	const placed = Array.from({ length: count }, () => 'OFF');
	const limit = Math.min(noteStrings.length, count);
	for (let i = 0; i < limit; i++) {
		placed[previewChannelForNote(i, count, startChannel)] = noteStrings[i] || 'OFF';
	}
	return placed;
}

function normalizePreviewChannel(channel: number, count: number): number {
	if (!Number.isFinite(channel)) return 0;
	return ((Math.trunc(channel) % count) + count) % count;
}

export function buildPreviewPattern(options: {
	schema: ChipSchema;
	instrumentId: string;
	table: string;
	volume: string;
	noteStrings: string[];
	channelLabels?: string[];
}): Pattern {
	const pattern = new PatternModel(0, 1, options.schema, options.channelLabels) as Pattern;
	const instNum = instrumentIdToNumber(options.instrumentId || '01') || 1;
	const vol = previewVolumeValue(options.volume);
	const tbl = parseTableChar(options.table);
	const hasTable = Boolean(options.schema.fields?.table);
	const hasVolume = Boolean(options.schema.fields?.volume);

	for (let ch = 0; ch < pattern.channels.length; ch++) {
		const row = pattern.channels[ch].rows[0];
		row.instrument = instNum;
		if (hasTable) row.table = tbl;
		if (hasVolume) row.volume = vol;
		row.effects = [null];
		const noteStr = options.noteStrings[ch] ?? 'OFF';
		const { noteName, octave } = parseNoteFromString(noteStr);
		row.note = new Note(noteName, octave);
	}
	return pattern;
}
