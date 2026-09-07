import type { Pattern } from '../../models/song';

export interface VisibleRow {
	rowIndex: number;
	isSelected: boolean;
	isGhost: boolean;
	patternIndex: number;
	orderIndex: number;
	displayIndex: number;
	isEmpty?: boolean;
}

export interface VisibleRowsCache {
	patternId: number;
	patternLength: number;
	selectedRow: number;
	canvasHeight: number;
	result: VisibleRow[];
}

export interface VisibleRowsContext {
	patterns: Pattern[];
	patternOrder: number[];
	currentPatternOrderIndex: number;
	selectedRow: number;
	canvasHeight: number;
	lineHeight: number;
	createPatternIfMissing: (patternId: number) => Pattern;
}

export class PatternVisibleRowsService {
	static getVisibleRows(
		pattern: Pattern,
		context: VisibleRowsContext,
		cache: VisibleRowsCache | null
	): { rows: VisibleRow[]; cache: VisibleRowsCache } {
		if (
			cache &&
			cache.patternId === pattern.id &&
			cache.patternLength === pattern.length &&
			cache.selectedRow === context.selectedRow &&
			cache.canvasHeight === context.canvasHeight
		) {
			return { rows: cache.result, cache };
		}

		const visibleCount = Math.floor(context.canvasHeight / context.lineHeight);
		const halfVisible = Math.floor(visibleCount / 2);
		const startRow = context.selectedRow - halfVisible;
		const endRow = context.selectedRow + halfVisible;

		const rows: VisibleRow[] = [];
		let displayIndex = 0;

		for (let i = startRow; i <= endRow; i++) {
			let rowAdded = false;

			if (i >= 0 && i < pattern.length) {
				rows.push({
					rowIndex: i,
					isSelected: i === context.selectedRow,
					isGhost: false,
					patternIndex: context.patternOrder[context.currentPatternOrderIndex],
					orderIndex: context.currentPatternOrderIndex,
					displayIndex
				});
				rowAdded = true;
			} else if (i < 0) {
				const prevPatternOrderIndex = context.currentPatternOrderIndex - 1;
				if (
					prevPatternOrderIndex >= 0 &&
					prevPatternOrderIndex < context.patternOrder.length
				) {
					const prevPatternIndex = context.patternOrder[prevPatternOrderIndex];
					let prevPattern = context.patterns.find((p) => p.id === prevPatternIndex);
					if (!prevPattern) {
						prevPattern = context.createPatternIfMissing(prevPatternIndex);
					}
					const ghostRowIndex = prevPattern.length + i;
					if (ghostRowIndex >= 0 && ghostRowIndex < prevPattern.length) {
						rows.push({
							rowIndex: ghostRowIndex,
							isSelected: false,
							isGhost: true,
							patternIndex: prevPatternIndex,
							orderIndex: prevPatternOrderIndex,
							displayIndex
						});
						rowAdded = true;
					}
				}
			} else {
				const nextPatternOrderIndex = context.currentPatternOrderIndex + 1;
				if (nextPatternOrderIndex < context.patternOrder.length) {
					const nextPatternIndex = context.patternOrder[nextPatternOrderIndex];
					let nextPattern = context.patterns.find((p) => p.id === nextPatternIndex);
					if (!nextPattern) {
						nextPattern = context.createPatternIfMissing(nextPatternIndex);
					}
					const ghostRowIndex = i - pattern.length;
					if (ghostRowIndex >= 0 && ghostRowIndex < nextPattern.length) {
						rows.push({
							rowIndex: ghostRowIndex,
							isSelected: false,
							isGhost: true,
							patternIndex: nextPatternIndex,
							orderIndex: nextPatternOrderIndex,
							displayIndex
						});
						rowAdded = true;
					}
				}
			}

			if (!rowAdded) {
				rows.push({
					rowIndex: -1,
					isSelected: false,
					isGhost: false,
					patternIndex: -1,
					orderIndex: -1,
					displayIndex,
					isEmpty: true
				});
			}

			displayIndex++;
		}

		const newCache: VisibleRowsCache = {
			patternId: pattern.id,
			patternLength: pattern.length,
			selectedRow: context.selectedRow,
			canvasHeight: context.canvasHeight,
			result: rows
		};

		return { rows, cache: newCache };
	}
}
