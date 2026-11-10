export interface OverlapNote {
	startRow: number;
	length: number;
	pitchIndex: number;
	preferred: boolean;
}

export function rangesOverlap(
	startRow: number,
	length: number,
	otherStart: number,
	otherLength: number
): boolean {
	return startRow < otherStart + otherLength && otherStart < startRow + length;
}

function beats(notes: readonly OverlapNote[], index: number, otherIndex: number): boolean {
	const note = notes[index];
	const other = notes[otherIndex];
	if (!note || !other || note.length < 1 || other.length < 1) return false;
	if (!rangesOverlap(note.startRow, note.length, other.startRow, other.length)) return false;
	if (other.pitchIndex !== note.pitchIndex) return other.pitchIndex > note.pitchIndex;
	if (other.startRow !== note.startRow) return other.startRow < note.startRow;
	if (other.preferred !== note.preferred) return other.preferred;
	return otherIndex < index;
}

export function silencedIndexes(notes: readonly OverlapNote[]): Set<number> {
	let silent = new Set<number>();
	for (let index = 0; index < notes.length; index++) {
		const note = notes[index];
		if (!note || note.length < 1) silent.add(index);
	}
	for (let pass = 0; pass < notes.length; pass++) {
		const next = new Set<number>(
			[...silent].filter((index) => {
				const note = notes[index];
				return !note || note.length < 1;
			})
		);
		for (let index = 0; index < notes.length; index++) {
			if (next.has(index)) continue;
			for (let otherIndex = 0; otherIndex < notes.length; otherIndex++) {
				if (otherIndex === index || silent.has(otherIndex)) continue;
				if (!beats(notes, index, otherIndex)) continue;
				next.add(index);
				break;
			}
		}
		if (next.size === silent.size && [...next].every((index) => silent.has(index))) return next;
		silent = next;
	}
	return silent;
}
