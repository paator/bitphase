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

export function notesForProcessor(
	noteStrings: string[],
	processorIndex: number,
	channelCount: number
): string[] {
	const start = processorIndex * channelCount;
	return Array.from({ length: channelCount }, (_, i) => noteStrings[start + i] ?? 'OFF');
}

export function buildPreviewPattern(options: {
	schema: ChipSchema;
	instrumentId: string;
	table: string;
	volume: string;
	noteStrings: string[];
}): Pattern {
	const pattern = new PatternModel(0, 1, options.schema) as Pattern;
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
