import { describe, it, expect } from 'vitest';
import { PatternNavigationService } from '../../../../src/lib/services/pattern/pattern-navigation';
import type {
	NavigationState,
	NavigationContext
} from '../../../../src/lib/services/pattern/pattern-navigation';
import { Pattern } from '../../../../src/lib/models/song';
import type { Chip } from '../../../../src/lib/chips/types';
import type { PatternFormatter } from '../../../../src/lib/chips/base/formatter-interface';
import type { PatternConverter } from '../../../../src/lib/chips/base/adapter';
import type {
	GenericChannel,
	GenericPattern,
	GenericRow
} from '../../../../src/lib/models/song/generic';

const DEFAULT_PATTERN_LENGTH = 64;
const SHORT_PATTERN_LENGTH = 32;
const DEFAULT_PATTERN_ID = 0;
const SECOND_PATTERN_ID = 1;

describe('PatternNavigationService', () => {
	const createMockChip = (): Chip => ({
		type: 'ay',
		name: 'AY-8910',
		wasmUrl: '',
		audioSlotKind: 'ayumi',
		processorMap: () => ({}) as any,
		schema: {
			chipType: 'ay',
			template: '',
			fields: {},
			globalFields: {}
		}
	});

	const createMockConverter = (): PatternConverter => ({
		toGeneric: (pattern: Pattern): GenericPattern => ({
			id: pattern.id,
			length: pattern.length,
			channels: pattern.channels.map(
				(ch) =>
					({
						rows: ch.rows.map((row) => ({
							note: row.note.name,
							instrument: row.instrument,
							volume: row.volume
						}))
					}) as GenericChannel
			),
			patternRows: pattern.patternRows.map((pr) => ({
				envelopeValue: pr.envelopeValue,
				noiseValue: pr.noiseValue,
				envelopeEffect: pr.envelopeEffect
					? (pr.envelopeEffect.effect as unknown as string | number)
					: null
			}))
		}),
		fromGeneric: (generic: GenericPattern): Pattern => {
			const pattern = new Pattern(generic.id, generic.length);
			return pattern;
		}
	});

	const createMockFormatter = (): PatternFormatter => ({
		formatRow: () => 'C-4 01 0A ---',
		parseRow: () => ({
			patternRow: {},
			channels: []
		}),
		getColorForField: () => '#000000'
	});

	const createMockContext = (patterns: Pattern[], patternOrder: number[]): NavigationContext => {
		const mockChip = createMockChip();
		return {
			patterns,
			patternOrder,
			currentPattern: patterns[0],
			converter: createMockConverter(),
			formatter: createMockFormatter(),
			schema: mockChip.schema,
			getCellPositions: () => [
				{ x: 0, width: 4, charIndex: 0, fieldKey: 'note' },
				{ x: 5, width: 2, charIndex: 5, fieldKey: 'instrument' },
				{ x: 8, width: 2, charIndex: 8, fieldKey: 'volume' }
			]
		};
	};

	describe('moveRow', () => {
		it('should increment row within same pattern', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 5,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, 1);

			expect(result.selectedRow).toBe(6);
			expect(result.currentPatternOrderIndex).toBe(0);
		});

		it('should decrement row within same pattern', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 5,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, -1);

			expect(result.selectedRow).toBe(4);
			expect(result.currentPatternOrderIndex).toBe(0);
		});

		it('should move to previous pattern when at first row', () => {
			const patterns = [
				new Pattern(DEFAULT_PATTERN_ID, SHORT_PATTERN_LENGTH),
				new Pattern(SECOND_PATTERN_ID, DEFAULT_PATTERN_LENGTH)
			];
			const patternOrder = [DEFAULT_PATTERN_ID, SECOND_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 1,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, -1);

			expect(result.currentPatternOrderIndex).toBe(0);
			expect(result.selectedRow).toBe(SHORT_PATTERN_LENGTH - 1);
		});

		it('should move to next pattern when at last row', () => {
			const patterns = [
				new Pattern(DEFAULT_PATTERN_ID, SHORT_PATTERN_LENGTH),
				new Pattern(SECOND_PATTERN_ID, DEFAULT_PATTERN_LENGTH)
			];
			const patternOrder = [DEFAULT_PATTERN_ID, SECOND_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: SHORT_PATTERN_LENGTH - 1,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, 1);

			expect(result.currentPatternOrderIndex).toBe(1);
			expect(result.selectedRow).toBe(0);
		});

		it('should not move beyond first pattern boundary', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, -1);

			expect(result.selectedRow).toBe(0);
			expect(result.currentPatternOrderIndex).toBe(0);
		});

		it('should not move beyond last pattern boundary', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: DEFAULT_PATTERN_LENGTH - 1,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveRow(state, context, 1);

			expect(result.selectedRow).toBe(DEFAULT_PATTERN_LENGTH - 1);
			expect(result.currentPatternOrderIndex).toBe(0);
		});
	});

	describe('moveColumn', () => {
		it('should clamp column to maximum when beyond bounds', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 10
			};

			const result = PatternNavigationService.moveColumn(state, context);

			expect(result.selectedColumn).toBe(2);
		});

		it('should preserve column when within bounds', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 1
			};

			const result = PatternNavigationService.moveColumn(state, context);

			expect(result.selectedColumn).toBe(1);
		});
	});

	describe('columnOverflow', () => {
		it('reports the next editor when moving past the last column', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 2
			};

			expect(PatternNavigationService.columnOverflow(state, context, 1)).toBe('next');
		});

		it('reports the previous editor when moving before the first column', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			expect(PatternNavigationService.columnOverflow(state, context, -1)).toBe('previous');
		});

		it('reports no overflow while the column stays in the row', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 1
			};

			expect(PatternNavigationService.columnOverflow(state, context, 1)).toBeNull();
		});
	});

	describe('moveColumnByDelta', () => {
		it('should increment column by positive delta', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveColumnByDelta(state, context, 1);

			expect(result.selectedColumn).toBe(1);
		});

		it('should decrement column by negative delta', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 2
			};

			const result = PatternNavigationService.moveColumnByDelta(state, context, -1);

			expect(result.selectedColumn).toBe(1);
		});

		it('should clamp to minimum column', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveColumnByDelta(state, context, -1);

			expect(result.selectedColumn).toBe(0);
		});

		it('should clamp to maximum column', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 2
			};

			const result = PatternNavigationService.moveColumnByDelta(state, context, 5);

			expect(result.selectedColumn).toBe(2);
		});
	});

	describe('moveToNextChannel', () => {
		it('wraps when the editor has a single channel slot', () => {
			const schema = {
				...createMockChip().schema,
				channelLabels: ['A']
			};
			const pattern = new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH, schema);
			const context = createMockContext([pattern], [DEFAULT_PATTERN_ID]);
			context.schema = schema;
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveToNextChannel(state, context);

			expect(result.wrapped).toBe(true);
			expect(result.selectedColumn).toBe(0);
		});
	});

	describe('moveToRowEnd', () => {
		it('should move to last column in current row', () => {
			const patterns = [new Pattern(DEFAULT_PATTERN_ID, DEFAULT_PATTERN_LENGTH)];
			const patternOrder = [DEFAULT_PATTERN_ID];
			const context = createMockContext(patterns, patternOrder);
			const state: NavigationState = {
				selectedRow: 0,
				currentPatternOrderIndex: 0,
				selectedColumn: 0
			};

			const result = PatternNavigationService.moveToRowEnd(state, context);

			expect(result.selectedColumn).toBe(2);
		});
	});
});
