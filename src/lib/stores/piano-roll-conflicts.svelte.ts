import type { PianoConflictNote } from '../services/piano-roll/piano-roll-conflicts';

const STORAGE_KEY = 'bitphase.piano-roll-conflicts';

function readStored(): PianoConflictNote[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isConflictNote);
	} catch {
		return [];
	}
}

function isConflictNote(value: unknown): value is PianoConflictNote {
	if (!value || typeof value !== 'object') return false;
	const note = value as PianoConflictNote;
	return (
		Number.isInteger(note.songIndex) &&
		note.songIndex >= 0 &&
		Number.isInteger(note.channelIndex) &&
		note.channelIndex >= 0 &&
		Number.isInteger(note.startRow) &&
		note.startRow >= 0 &&
		Number.isInteger(note.length) &&
		note.length > 0 &&
		Number.isInteger(note.pitchIndex) &&
		note.pitchIndex >= 0 &&
		typeof note.note === 'string' &&
		(note.instrument === null || typeof note.instrument === 'number') &&
		typeof note.release === 'boolean' &&
		(note.fields === undefined || (typeof note.fields === 'object' && note.fields !== null))
	);
}

class PianoRollConflictStore {
	notes = $state.raw<PianoConflictNote[]>([]);
	revision = $state(0);

	constructor() {
		this.notes = readStored();
	}

	get hasNotes(): boolean {
		return this.notes.length > 0;
	}

	snapshot(): PianoConflictNote[] {
		return this.notes.map((note) => ({ ...note }));
	}

	forChannel(songIndex: number, channelIndex: number): PianoConflictNote[] {
		return this.notes.filter(
			(note) => note.songIndex === songIndex && note.channelIndex === channelIndex
		);
	}

	replaceAll(notes: readonly PianoConflictNote[]): void {
		this.notes = notes.map((note) => ({ ...note }));
		this.revision += 1;
		this.persist();
	}

	clear(): void {
		if (this.notes.length === 0) return;
		this.notes = [];
		this.revision += 1;
		this.persist();
	}

	private persist(): void {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notes));
	}
}

export const pianoRollConflictStore = new PianoRollConflictStore();
