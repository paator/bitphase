import type { Pattern } from '../../models/song';
import type { Chip } from '../../chips/types';
import { PatternTemplateParser } from './editing/pattern-template-parsing';
import { getPatternEffectColumnCounts } from '../../chips/base/channel-effect-columns';

export interface ProgressiveSelectionResult {
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
}

export class ProgressiveSelectionService {
	static selectAll(
		pattern: Pattern,
		currentColumn: number,
		selectionStartRow: number | null,
		selectionStartColumn: number | null,
		selectionEndRow: number | null,
		selectionEndColumn: number | null,
		getCellPositions: (rowString: string, rowIndex: number) => any[],
		getPatternRowData: (pattern: Pattern, rowIndex: number) => string,
		schema: Chip['schema']
	): ProgressiveSelectionResult {
		const hasSelection =
			selectionStartRow !== null &&
			selectionStartColumn !== null &&
			selectionEndRow !== null &&
			selectionEndColumn !== null;

		if (!hasSelection) {
			return this.selectColumn(pattern, currentColumn);
		}

		const minRow = Math.min(selectionStartRow!, selectionEndRow!);
		const maxRow = Math.max(selectionStartRow!, selectionEndRow!);
		const minCol = Math.min(selectionStartColumn!, selectionEndColumn!);
		const maxCol = Math.max(selectionStartColumn!, selectionEndColumn!);

		if (minCol < maxCol) {
			const boundsUnion = this.getChannelsBoundsUnion(
				pattern,
				minCol,
				maxCol,
				getCellPositions,
				getPatternRowData,
				schema
			);
			if (boundsUnion) {
				const isFullWidth =
					minCol === boundsUnion.startColumn && maxCol === boundsUnion.endColumn;
				if (isFullWidth) {
					const isFullHeight =
						minRow === 0 && maxRow === pattern.length - 1;
					if (isFullHeight) {
						return this.selectEntirePattern(
							pattern,
							getCellPositions,
							getPatternRowData
						);
					}
					return this.selectColumnRange(pattern, boundsUnion);
				}
				return {
					startRow: minRow,
					endRow: maxRow,
					startColumn: boundsUnion.startColumn,
					endColumn: boundsUnion.endColumn
				};
			}
		}

		const isEntireColumn = this.isEntireColumnSelected(pattern, minRow, maxRow, minCol, maxCol);

		if (isEntireColumn) {
			const channelBounds = this.getChannelBounds(
				pattern,
				minCol,
				getCellPositions,
				getPatternRowData,
				schema
			);
			if (channelBounds) {
				const isEntireChannel = this.isEntireChannelSelected(
					pattern,
					minRow,
					maxRow,
					minCol,
					maxCol,
					channelBounds
				);

				if (isEntireChannel) {
					return this.selectEntirePattern(pattern, getCellPositions, getPatternRowData);
				} else {
					return this.selectChannel(pattern, channelBounds);
				}
			} else {
				const globalBounds = this.getGlobalFieldsBounds(
					pattern,
					minCol,
					getCellPositions,
					getPatternRowData,
					schema
				);
				if (globalBounds) {
					const isAllGlobalFields = this.isAllGlobalFieldsSelected(
						pattern,
						minRow,
						maxRow,
						minCol,
						maxCol,
						globalBounds
					);

					if (isAllGlobalFields) {
						return this.selectEntirePattern(pattern, getCellPositions, getPatternRowData);
					} else {
						return this.selectAllGlobalFields(pattern, globalBounds);
					}
				}
			}
		} else {
			const channelBounds = this.getChannelBounds(
				pattern,
				minCol,
				getCellPositions,
				getPatternRowData,
				schema
			);
			if (channelBounds) {
				const isEntireChannel = this.isEntireChannelSelected(
					pattern,
					minRow,
					maxRow,
					minCol,
					maxCol,
					channelBounds
				);

				if (isEntireChannel) {
					return this.selectEntirePattern(pattern, getCellPositions, getPatternRowData);
				}
			} else {
				const globalBounds = this.getGlobalFieldsBounds(
					pattern,
					minCol,
					getCellPositions,
					getPatternRowData,
					schema
				);
				if (globalBounds) {
					const isAllGlobalFields = this.isAllGlobalFieldsSelected(
						pattern,
						minRow,
						maxRow,
						minCol,
						maxCol,
						globalBounds
					);

					if (isAllGlobalFields) {
						return this.selectEntirePattern(pattern, getCellPositions, getPatternRowData);
					}
				}
			}
		}

		return this.selectColumn(pattern, currentColumn);
	}

	private static isEntireColumnSelected(
		pattern: Pattern,
		minRow: number,
		maxRow: number,
		minCol: number,
		maxCol: number
	): boolean {
		return minCol === maxCol && minRow === 0 && maxRow === pattern.length - 1;
	}

	private static isEntireChannelSelected(
		pattern: Pattern,
		minRow: number,
		maxRow: number,
		minCol: number,
		maxCol: number,
		channelBounds: { startColumn: number; endColumn: number }
	): boolean {
		return (
			minRow === 0 &&
			maxRow === pattern.length - 1 &&
			minCol === channelBounds.startColumn &&
			maxCol === channelBounds.endColumn
		);
	}

	private static selectColumn(pattern: Pattern, column: number): ProgressiveSelectionResult {
		return {
			startRow: 0,
			endRow: pattern.length - 1,
			startColumn: column,
			endColumn: column
		};
	}

	private static selectChannel(
		pattern: Pattern,
		channelBounds: { startColumn: number; endColumn: number }
	): ProgressiveSelectionResult {
		return this.selectColumnRange(pattern, channelBounds);
	}

	private static selectColumnRange(
		pattern: Pattern,
		bounds: { startColumn: number; endColumn: number }
	): ProgressiveSelectionResult {
		return {
			startRow: 0,
			endRow: pattern.length - 1,
			startColumn: bounds.startColumn,
			endColumn: bounds.endColumn
		};
	}

	private static getChannelsBoundsUnion(
		pattern: Pattern,
		minCol: number,
		maxCol: number,
		getCellPositions: (rowString: string, rowIndex: number) => any[],
		getPatternRowData: (pattern: Pattern, rowIndex: number) => string,
		schema: Chip['schema']
	): { startColumn: number; endColumn: number } | null {
		let startColumn: number | null = null;
		let endColumn: number | null = null;

		for (let col = minCol; col <= maxCol; col++) {
			const channelBounds = this.getChannelBounds(
				pattern,
				col,
				getCellPositions,
				getPatternRowData,
				schema
			);
			const bounds = channelBounds ?? this.getGlobalFieldsBounds(
				pattern,
				col,
				getCellPositions,
				getPatternRowData,
				schema
			);
			if (bounds) {
				startColumn =
					startColumn === null ? bounds.startColumn : Math.min(startColumn, bounds.startColumn);
				endColumn =
					endColumn === null ? bounds.endColumn : Math.max(endColumn, bounds.endColumn);
			}
		}

		if (startColumn === null || endColumn === null) return null;
		return { startColumn, endColumn };
	}

	private static selectAllGlobalFields(
		pattern: Pattern,
		globalBounds: { startColumn: number; endColumn: number }
	): ProgressiveSelectionResult {
		return {
			startRow: 0,
			endRow: pattern.length - 1,
			startColumn: globalBounds.startColumn,
			endColumn: globalBounds.endColumn
		};
	}

	private static selectEntirePattern(
		pattern: Pattern,
		getCellPositions: (rowString: string, rowIndex: number) => any[],
		getPatternRowData: (pattern: Pattern, rowIndex: number) => string
	): ProgressiveSelectionResult {
		const firstRowString = getPatternRowData(pattern, 0);
		const cellPositions = getCellPositions(firstRowString, 0);
		const lastColumn = cellPositions.length - 1;

		return {
			startRow: 0,
			endRow: pattern.length - 1,
			startColumn: 0,
			endColumn: lastColumn
		};
	}

	private static getChannelBounds(
		pattern: Pattern,
		columnIndex: number,
		getCellPositions: (rowString: string, rowIndex: number) => any[],
		getPatternRowData: (pattern: Pattern, rowIndex: number) => string,
		schema: Chip['schema']
	): { startColumn: number; endColumn: number } | null {
		if (pattern.length === 0) return null;

		const rowString = getPatternRowData(pattern, 0);
		const cellPositions = getCellPositions(rowString, 0);

		if (columnIndex >= cellPositions.length) return null;

		const cell = cellPositions[columnIndex];
		if (!cell.fieldKey) return null;

		const isGlobalField = !!schema.globalFields?.[cell.fieldKey];
		if (isGlobalField) {
			return null;
		}

		const effectColumnCounts = getPatternEffectColumnCounts(pattern);
		const channelIndex = PatternTemplateParser.calculateChannelIndexForField(
			cell.fieldKey,
			cell.charIndex,
			rowString,
			schema,
			effectColumnCounts
		);

		let startColumn = -1;
		let endColumn = -1;

		for (let i = 0; i < cellPositions.length; i++) {
			const currentCell = cellPositions[i];
			if (!currentCell.fieldKey) continue;

			const isCurrentGlobal = !!schema.globalFields?.[currentCell.fieldKey];
			if (isCurrentGlobal) continue;

			const currentChannelIndex = PatternTemplateParser.calculateChannelIndexForField(
				currentCell.fieldKey,
				currentCell.charIndex,
				rowString,
				schema,
				effectColumnCounts
			);

			if (currentChannelIndex === channelIndex) {
				if (startColumn === -1) {
					startColumn = i;
				}
				endColumn = i;
			}
		}

		if (startColumn === -1 || endColumn === -1) return null;

		return { startColumn, endColumn };
	}

	private static getGlobalFieldsBounds(
		pattern: Pattern,
		columnIndex: number,
		getCellPositions: (rowString: string, rowIndex: number) => any[],
		getPatternRowData: (pattern: Pattern, rowIndex: number) => string,
		schema: Chip['schema']
	): { startColumn: number; endColumn: number } | null {
		if (pattern.length === 0 || !schema.globalFields) return null;

		const rowString = getPatternRowData(pattern, 0);
		const cellPositions = getCellPositions(rowString, 0);

		if (columnIndex >= cellPositions.length) return null;

		const cell = cellPositions[columnIndex];
		if (!cell.fieldKey) return null;

		const isGlobalField = !!schema.globalFields?.[cell.fieldKey];
		if (!isGlobalField) {
			return null;
		}

		let startColumn = -1;
		let endColumn = -1;

		for (let i = 0; i < cellPositions.length; i++) {
			const currentCell = cellPositions[i];
			if (!currentCell.fieldKey) continue;

			const isCurrentGlobal = !!schema.globalFields?.[currentCell.fieldKey];
			if (isCurrentGlobal) {
				if (startColumn === -1) {
					startColumn = i;
				}
				endColumn = i;
			}
		}

		if (startColumn === -1 || endColumn === -1) return null;

		return { startColumn, endColumn };
	}

	private static isAllGlobalFieldsSelected(
		pattern: Pattern,
		minRow: number,
		maxRow: number,
		minCol: number,
		maxCol: number,
		globalBounds: { startColumn: number; endColumn: number }
	): boolean {
		return (
			minRow === 0 &&
			maxRow === pattern.length - 1 &&
			minCol === globalBounds.startColumn &&
			maxCol === globalBounds.endColumn
		);
	}
}
