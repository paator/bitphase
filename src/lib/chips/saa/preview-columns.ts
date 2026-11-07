import { Effect, Note, NoteName, type Pattern } from '../../models/song';
import { parseNoteFromString } from '../../utils/note-utils';
import { sanitizeHexInput } from '../base/preview-row-utils';

const ENVELOPE_CLOCK_CHANNELS = [1, 4];
const ENVELOPE_OUTPUT_CHANNELS = [2, 5];
const MIXER_EFFECT = 'E'.charCodeAt(0);
const MIXER_TONE_OFF = 6;

function filterColumnInput(
	text: string,
	previous: string,
	accept: (parsed: number) => boolean
): string {
	if (!text) return '';
	const hex = sanitizeHexInput(text, 1);
	if (!hex) return previous;
	const parsed = parseInt(hex, 16);
	return accept(parsed) ? hex : previous;
}

export function filterSaaNoiseInput(text: string, previous: string): string {
	return filterColumnInput(text, previous, (parsed) => parsed <= 3);
}

export function filterSaaEnvelopeInput(text: string, previous: string): string {
	return filterColumnInput(text, previous, (parsed) => parsed <= 12);
}

export function saaPatternColumnValue(text: string): number {
	const hex = sanitizeHexInput(text, 1);
	if (!hex) return 0;
	const parsed = parseInt(hex, 16);
	if (!Number.isFinite(parsed)) return 0;
	return parsed === 0 ? -1 : parsed;
}

export function applySaaPreviewColumns(
	pattern: Pattern,
	columns: { noise: string; envelope: string; clockNote?: string }
): void {
	const row = pattern.patternRows[0];
	const noise = saaPatternColumnValue(columns.noise);
	const envelope = saaPatternColumnValue(columns.envelope);
	row.noise0 = noise;
	row.noise1 = noise;
	row.env0 = envelope;
	row.env1 = envelope;
	if (envelope > 0) placeEnvelopePreview(pattern, columns.clockNote ?? '');
}

function pitchedNote(note: { name?: number; octave?: number } | undefined): Note | null {
	const name = note?.name ?? NoteName.None;
	if (name < NoteName.C || name > NoteName.B) return null;
	return new Note(name, note?.octave ?? 0);
}

function placeEnvelopePreview(pattern: Pattern, clockNote: string): void {
	let heard: Note | null = null;
	for (const channel of pattern.channels) {
		heard = pitchedNote(channel.rows[0]?.note);
		if (heard) break;
	}
	if (!heard) return;

	const parsedClock = clockNote ? parseNoteFromString(clockNote) : null;
	const clock = pitchedNote({ name: parsedClock?.noteName, octave: parsedClock?.octave });

	for (let index = 0; index < pattern.channels.length; index++) {
		const channelRow = pattern.channels[index].rows[0];
		if (ENVELOPE_CLOCK_CHANNELS.includes(index)) {
			channelRow.note = clock
				? new Note(clock.name, clock.octave)
				: new Note(NoteName.Off, 0);
			channelRow.effects = clock ? [new Effect(MIXER_EFFECT, MIXER_TONE_OFF, 0)] : [null];
		} else if (ENVELOPE_OUTPUT_CHANNELS.includes(index)) {
			channelRow.note = new Note(heard.name, heard.octave);
			channelRow.effects = [null];
		} else {
			channelRow.note = new Note(NoteName.Off, 0);
			channelRow.effects = [null];
		}
	}
}
