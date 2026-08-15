import type { Pattern } from '../../models/song';
import type { Chip } from '../../chips/types';
import type { PatternFormatter } from '../../chips/base/formatter-interface';
import type { PatternConverter } from '../../chips/base/adapter';
import type { GenericChannel } from '../../models/song/generic';
import { PatternTemplateParser } from './editing/pattern-template-parsing';
import { getPatternEffectColumnCounts } from '../../chips/base/channel-effect-columns';

export interface NavigationState {
	selectedRow: number;
	currentPatternOrderIndex: number;
	selectedColumn: number;
}

export interface NavigationContext {
	patterns: Pattern[];
	patternOrder: number[];
	currentPattern: Pattern;
	converter: PatternConverter;
	formatter: PatternFormatter;
	schema: Chip['schema'];
	getCellPositions: (
		rowString: string,
		rowIndex: number
	) => { x: number; width: number; charIndex: number; fieldKey?: string }[];
}

export class PatternNavigationService {
	static moveRow(
		state: NavigationState,
		context: NavigationContext,
		delta: number
	): NavigationState {
		const { currentPattern, patternOrder, patterns } = context;
		const newRow = state.selectedRow + delta;

		if (newRow >= 0 && newRow < currentPattern.length) {
			return {
				...state,
				selectedRow: newRow
			};
		}

		if (delta < 0 && state.currentPatternOrderIndex > 0) {
			const newOrderIndex = state.currentPatternOrderIndex - 1;
			const prevPatternId = patternOrder[newOrderIndex];
			const prevPattern = patterns.find((p) => p.id === prevPatternId);
			if (prevPattern) {
				return {
					...state,
					currentPatternOrderIndex: newOrderIndex,
					selectedRow: prevPattern.length - 1
				};
			}
		}

		if (delta > 0 && state.currentPatternOrderIndex < patternOrder.length - 1) {
			return {
				...state,
				currentPatternOrderIndex: state.currentPatternOrderIndex + 1,
				selectedRow: 0
			};
		}

		return state;
	}

	static moveColumn(state: NavigationState, context: NavigationContext): NavigationState {
		const { currentPattern, converter, formatter, schema, getCellPositions } = context;
		const genericPattern = converter.toGeneric(currentPattern);
		const genericPatternRow = genericPattern.patternRows[state.selectedRow];
		const genericChannels = genericPattern.channels.map(
			(ch: GenericChannel) => ch.rows[state.selectedRow]
		);
		const rowString = formatter.formatRow(
			genericPatternRow,
			genericChannels,
			state.selectedRow,
			schema
		);
		const cellPositions = getCellPositions(rowString, state.selectedRow);
		const maxCells = cellPositions.length;

		if (state.selectedColumn >= maxCells) {
			return {
				...state,
				selectedColumn: Math.max(0, maxCells - 1)
			};
		}

		return state;
	}

	static moveColumnByDelta(
		state: NavigationState,
		context: NavigationContext,
		delta: number
	): NavigationState {
		const { currentPattern, converter, formatter, schema, getCellPositions } = context;
		const genericPattern = converter.toGeneric(currentPattern);
		const genericPatternRow = genericPattern.patternRows[state.selectedRow];
		const genericChannels = genericPattern.channels.map(
			(ch: GenericChannel) => ch.rows[state.selectedRow]
		);
		const rowString = formatter.formatRow(
			genericPatternRow,
			genericChannels,
			state.selectedRow,
			schema
		);
		const cellPositions = getCellPositions(rowString, state.selectedRow);
		const maxCells = cellPositions.length;
		let newColumn = state.selectedColumn + delta;

		if (newColumn < 0) newColumn = 0;
		if (newColumn >= maxCells) newColumn = maxCells - 1;

		return {
			...state,
			selectedColumn: newColumn
		};
	}

	static moveToRowEnd(state: NavigationState, context: NavigationContext): NavigationState {
		const { currentPattern, converter, formatter, schema, getCellPositions } = context;
		const genericPattern = converter.toGeneric(currentPattern);
		const genericPatternRow = genericPattern.patternRows[state.selectedRow];
		const genericChannels = genericPattern.channels.map(
			(ch: GenericChannel) => ch.rows[state.selectedRow]
		);
		const rowString = formatter.formatRow(
			genericPatternRow,
			genericChannels,
			state.selectedRow,
			schema
		);
		const cellPositions = getCellPositions(rowString, state.selectedRow);
		const maxCells = cellPositions.length;

		return {
			...state,
			selectedColumn: Math.max(0, maxCells - 1)
		};
	}

	static moveToNextChannel(state: NavigationState, context: NavigationContext): NavigationState {
		return PatternNavigationService.moveToAdjacentChannel(state, context, 1);
	}

	static moveToPreviousChannel(
		state: NavigationState,
		context: NavigationContext
	): NavigationState {
		return PatternNavigationService.moveToAdjacentChannel(state, context, -1);
	}

	private static moveToAdjacentChannel(
		state: NavigationState,
		context: NavigationContext,
		direction: 1 | -1
	): NavigationState {
		const { currentPattern, converter, formatter, schema, getCellPositions } = context;
		const genericPattern = converter.toGeneric(currentPattern);
		const genericPatternRow = genericPattern.patternRows[state.selectedRow];
		const genericChannels = genericPattern.channels.map(
			(ch: GenericChannel) => ch.rows[state.selectedRow]
		);
		const rowString = formatter.formatRow(
			genericPatternRow,
			genericChannels,
			state.selectedRow,
			schema
		);
		const cellPositions = getCellPositions(rowString, state.selectedRow);
		const hasGlobal = !!(schema.globalTemplate && schema.globalFields);
		const channelCount = genericPattern.channels.length;
		const totalSlots = (hasGlobal ? 1 : 0) + channelCount;
		if (totalSlots <= 1) return state;

		const effectColumnCounts = getPatternEffectColumnCounts(currentPattern);
		const slotForColumn: number[] = [];
		for (let col = 0; col < cellPositions.length; col++) {
			const cell = cellPositions[col];
			if (!cell.fieldKey) {
				slotForColumn[col] = -1;
				continue;
			}
			const isGlobal = !!schema.globalFields?.[cell.fieldKey];
			if (isGlobal) {
				slotForColumn[col] = 0;
			} else {
				const channelIndex = PatternTemplateParser.calculateChannelIndexForField(
					cell.fieldKey,
					cell.charIndex,
					rowString,
					schema,
					effectColumnCounts
				);
				slotForColumn[col] = (hasGlobal ? 1 : 0) + channelIndex;
			}
		}

		const firstColumnForSlot: number[] = [];
		for (let col = 0; col < cellPositions.length; col++) {
			const slot = slotForColumn[col];
			if (slot >= 0 && firstColumnForSlot[slot] === undefined) {
				firstColumnForSlot[slot] = col;
			}
		}

		const currentSlot =
			state.selectedColumn >= 0 && state.selectedColumn < slotForColumn.length
				? slotForColumn[state.selectedColumn]
				: 0;
		const nextSlot =
			currentSlot >= 0
				? (currentSlot + direction + totalSlots) % totalSlots
				: direction > 0
					? 0
					: totalSlots - 1;
		const targetColumn = firstColumnForSlot[nextSlot];
		if (targetColumn === undefined) return state;

		return {
			...state,
			selectedColumn: targetColumn
		};
	}
}
