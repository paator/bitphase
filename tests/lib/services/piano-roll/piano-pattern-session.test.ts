import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { AYConverter } from '@/lib/chips/ay/adapter';
import { Pattern } from '@/lib/models/song';
import { PianoPatternSession } from '@/lib/services/piano-roll/piano-pattern-session';

function session() {
	const patterns = new Map([
		[0, new Pattern(0, 4, AY_CHIP_SCHEMA)],
		[1, new Pattern(1, 4, AY_CHIP_SCHEMA)]
	]);
	let lookups = 0;
	const pianoSession = new PianoPatternSession(
		new AYConverter(),
		(id) => {
			lookups++;
			return patterns.get(id);
		},
		1
	);
	return { pianoSession, patterns, lookups: () => lookups };
}

describe('piano pattern session', () => {
	it('loads each pattern once and reads the session channel', () => {
		const { pianoSession, lookups } = session();
		const rows = pianoSession.rows(0);
		expect(rows).toHaveLength(4);
		expect(pianoSession.rows(0)).toBe(rows);
		expect(pianoSession.rowsForSpan({ patternId: 0 })).toBe(rows);
		expect(lookups()).toBe(1);
		expect(pianoSession.generic(7)).toBeNull();
	});

	it('only returns edits for marked patterns', () => {
		const { pianoSession, patterns } = session();
		pianoSession.rows(0)![2]!.note = 'C-4';
		pianoSession.rows(1);
		expect(pianoSession.mark(1, false)).toBe(false);
		expect(pianoSession.edits().size).toBe(0);
		expect(pianoSession.mark(0)).toBe(true);
		expect(pianoSession.isDirty(0)).toBe(true);
		const edits = pianoSession.edits();
		expect([...edits.keys()]).toEqual([0]);
		expect(edits.get(0)!.before).toBe(patterns.get(0));
		expect(new AYConverter().toGeneric(edits.get(0)!.after).channels[1].rows[2].note).toBe(
			'C-4'
		);
	});

	it('runs a finisher on the converted pattern and adopts prepared generics', () => {
		const { pianoSession, patterns } = session();
		const before = patterns.get(1)!;
		const generic = new AYConverter().toGeneric(before);
		pianoSession.adopt(before, generic);
		expect(pianoSession.generic(1)).toBe(generic);
		const finished = new Pattern(1, 8, AY_CHIP_SCHEMA);
		pianoSession.finish(1, () => finished);
		pianoSession.markAll([1]);
		expect(pianoSession.edits().get(1)).toEqual({ before, after: finished });
	});
});
