import { describe, expect, it } from 'vitest';
import { Instrument, Pattern, Song } from '../../../../src/lib/models/song';
import { ProjectDiffService } from '../../../../src/lib/services/history/project-diff-service';
import { HistoryClone } from '../../../../src/lib/services/history/history-clone';
import { ProjectHistoryEntryFactory } from '../../../../src/lib/services/history/project-history-entry-factory';
import type { ProjectDiff } from '../../../../src/lib/models/history';

describe('ProjectDiffService', () => {
	it('applies and inverts set diffs without sharing saved values', () => {
		const target = { instruments: [new Instrument('01', 'One')] };
		const before = target.instruments[0];
		const after = new Instrument('02', 'Two');
		const diff: ProjectDiff = {
			kind: 'set',
			path: ['instruments', 0],
			before,
			after
		};

		ProjectDiffService.apply(target, diff);
		expect(target.instruments[0].id).toBe('02');
		expect(target.instruments[0]).not.toBe(after);

		ProjectDiffService.applyAll(target, ProjectDiffService.invertAll([diff]));
		expect(target.instruments[0].id).toBe('01');
		expect(target.instruments[0]).not.toBe(before);
	});

	it('applies insert, remove, and move diffs', () => {
		const target = { patternOrder: [0, 1, 2] };

		ProjectDiffService.apply(target, {
			kind: 'insert',
			path: ['patternOrder'],
			index: 1,
			values: [9]
		});
		expect(target.patternOrder).toEqual([0, 9, 1, 2]);

		ProjectDiffService.apply(target, {
			kind: 'move',
			path: ['patternOrder'],
			fromIndex: 1,
			toIndex: 3
		});
		expect(target.patternOrder).toEqual([0, 1, 2, 9]);

		ProjectDiffService.apply(target, {
			kind: 'remove',
			path: ['patternOrder'],
			index: 3,
			values: [9]
		});
		expect(target.patternOrder).toEqual([0, 1, 2]);
	});

	it('detects set diffs with equivalent pattern snapshots as no-ops', () => {
		const before = new Pattern(0, 1);
		const after = HistoryClone.pattern(before);

		expect(
			ProjectDiffService.isNoOp({
				kind: 'set',
				path: ['patterns', 0, 0],
				before,
				after
			})
		).toBe(true);
	});
});

describe('ProjectHistoryEntryFactory', () => {
	it('does not create entries from only no-op diffs', () => {
		const pattern = new Pattern(0, 1);

		const entry = ProjectHistoryEntryFactory.create(
			{
				type: 'pattern.edit',
				label: 'Edit pattern 0',
				affectedDomains: ['patterns']
			},
			[
				{
					kind: 'set',
					path: ['patterns', 0, 0],
					before: pattern,
					after: HistoryClone.pattern(pattern)
				}
			]
		);

		expect(entry).toBeNull();
	});

	it('keeps meaningful diffs after filtering no-ops', () => {
		const before = new Pattern(0, 1);
		const after = HistoryClone.pattern(before);
		after.channels[0].rows[0].note.octave = 4;

		const entry = ProjectHistoryEntryFactory.create(
			{
				type: 'pattern.edit',
				label: 'Edit pattern 0',
				affectedDomains: ['patterns']
			},
			[
				{
					kind: 'move',
					path: ['patternOrder'],
					fromIndex: 0,
					toIndex: 0
				},
				{
					kind: 'set',
					path: ['patterns', 0, 0],
					before,
					after
				}
			]
		);

		expect(entry?.diffs).toHaveLength(1);
		expect(entry?.diffs[0].kind).toBe('set');
	});
});

describe('HistoryClone', () => {
	it('preserves song and pattern class prototypes', () => {
		const song = new Song();
		song.patterns = [new Pattern(3)];

		const cloned = HistoryClone.song(song);

		expect(cloned).toBeInstanceOf(Song);
		expect(cloned.patterns[0]).toBeInstanceOf(Pattern);
		expect(cloned.patterns[0]).not.toBe(song.patterns[0]);
	});
});
