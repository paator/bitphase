import type { Pattern } from '../../models/song';
import { pianoRollConflictStore } from '../../stores/piano-roll-conflicts.svelte';
import { projectStore } from '../../stores/project.svelte';
import { undoRedoStore } from '../../stores/undo-redo.svelte';
import { PatternService } from '../pattern/pattern-service';
import type { PianoConflictNote } from './piano-roll-conflicts';
import type { PatternEdits } from './piano-pattern-session';

export interface PianoEditCursor {
	orderIndex: number;
	row: number;
}

export interface PianoConflictChange {
	before: PianoConflictNote[];
	after: PianoConflictNote[];
}

function applyPatterns(songIndex: number, patterns: readonly Pattern[]): void {
	if (patterns.length === 0) return;
	let next = projectStore.patterns[songIndex] ?? [];
	for (const pattern of patterns) next = PatternService.updatePatternInArray(next, pattern);
	projectStore.updatePatterns(songIndex, next);
}

export function commitPianoPatternEdits(
	songIndex: number,
	edits: PatternEdits,
	cursor: PianoEditCursor
): void {
	if (edits.size === 0) return;
	let patterns = projectStore.patterns[songIndex] ?? [];
	const diffs = [];
	for (const { before, after } of edits.values()) {
		if (before === after) continue;
		const patternIndex = patterns.findIndex((item) => item.id === before.id);
		if (patternIndex < 0) continue;
		diffs.push(
			projectStore.createSetDiff(['patterns', songIndex, patternIndex], before, after)
		);
		patterns = PatternService.updatePatternInArray(patterns, after);
	}
	if (diffs.length === 0) return;
	const only = edits.size === 1 ? edits.values().next().value : undefined;
	const selection = {
		songIndex,
		row: cursor.row,
		column: 0,
		patternOrderIndex: cursor.orderIndex
	};
	projectStore.recordHistory(
		{
			type: 'pattern.edit',
			label: only ? `Edit pattern ${only.before.id}` : 'Edit patterns',
			affectedDomains: ['patterns'],
			beforeSelection: selection,
			afterSelection: { ...selection }
		},
		diffs
	);
	projectStore.updatePatterns(songIndex, patterns);
}

export function commitPianoConflictEdits(
	songIndex: number,
	edits: PatternEdits,
	conflicts: PianoConflictChange,
	cursor: PianoEditCursor
): void {
	const patternEdits = [...edits.values()];
	const apply = (side: 'before' | 'after') => {
		applyPatterns(
			songIndex,
			patternEdits.map((edit) => edit[side])
		);
		pianoRollConflictStore.replaceAll(conflicts[side]);
	};
	apply('after');
	const position = { row: cursor.row, column: 0, patternOrderIndex: cursor.orderIndex };
	undoRedoStore.pushAction({
		execute: () => apply('after'),
		undo: () => apply('before'),
		getCursorPosition: () => position
	});
}
