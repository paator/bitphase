import type { PatternConverter } from '../../chips/base/adapter';
import type { Pattern } from '../../models/song';
import type { GenericPattern, GenericRow } from '../../models/song/generic';

export interface PatternEdit {
	before: Pattern;
	after: Pattern;
}

export type PatternEdits = Map<number, PatternEdit>;

interface SessionEntry {
	before: Pattern;
	generic: GenericPattern;
}

export class PianoPatternSession {
	private readonly entries = new Map<number, SessionEntry>();
	private readonly dirty = new Set<number>();
	private readonly finishers = new Map<number, (after: Pattern) => Pattern>();

	constructor(
		private readonly converter: PatternConverter,
		private readonly lookup: (patternId: number) => Pattern | undefined,
		readonly channelIndex: number
	) {}

	readonly rowsForSpan = (span: { patternId: number }): GenericRow[] | undefined =>
		this.rows(span.patternId);

	generic(patternId: number): GenericPattern | null {
		const existing = this.entries.get(patternId);
		if (existing) return existing.generic;
		const before = this.lookup(patternId);
		if (!before) return null;
		return this.adopt(before, this.converter.toGeneric(before));
	}

	adopt(before: Pattern, generic: GenericPattern): GenericPattern {
		this.entries.set(before.id, { before, generic });
		return generic;
	}

	rows(patternId: number): GenericRow[] | undefined {
		return this.generic(patternId)?.channels[this.channelIndex]?.rows;
	}

	mark(patternId: number, changed = true): boolean {
		if (changed) this.dirty.add(patternId);
		return changed;
	}

	markAll(patternIds: Iterable<number>): void {
		for (const id of patternIds) this.dirty.add(id);
	}

	isDirty(patternId: number): boolean {
		return this.dirty.has(patternId);
	}

	finish(patternId: number, finisher: (after: Pattern) => Pattern): void {
		this.finishers.set(patternId, finisher);
	}

	edits(): PatternEdits {
		const edits: PatternEdits = new Map();
		for (const id of this.dirty) {
			const entry = this.entries.get(id);
			if (!entry) continue;
			const after = this.converter.fromGeneric(entry.generic);
			edits.set(id, {
				before: entry.before,
				after: this.finishers.get(id)?.(after) ?? after
			});
		}
		return edits;
	}
}
