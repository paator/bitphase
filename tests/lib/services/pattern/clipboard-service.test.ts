import { beforeEach, describe, expect, it } from 'vitest';
import { ClipboardService, type ClipboardContext } from '@/lib/services/pattern/clipboard-service';
import { clipboardStore } from '@/lib/stores/clipboard.svelte';
import { Effect, EffectType, Note, NoteName, Pattern } from '@/lib/models/song';
import { AYConverter } from '@/lib/chips/ay/adapter';
import { AYFormatter } from '@/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { SAAConverter } from '@/lib/chips/saa/adapter';
import { SAAFormatter } from '@/lib/chips/saa/formatter';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import { NESConverter } from '@/lib/chips/nes/adapter';
import { NESFormatter } from '@/lib/chips/nes/formatter';
import { NES_CHIP_SCHEMA } from '@/lib/chips/nes/schema';
import type { ChipSchema } from '@/lib/chips/base/schema';
import type { PatternConverter } from '@/lib/chips/base/adapter';
import type { PatternFormatter } from '@/lib/chips/base/formatter-interface';
import type { EditingContext } from '@/lib/services/pattern/editing/editing-context';
import { PatternTemplateParser } from '@/lib/services/pattern/editing/pattern-template-parsing';
import { getPatternEffectColumnCounts } from '@/lib/chips/base/channel-effect-columns';

type FieldCell = { x: number; width: number; charIndex: number; fieldKey: string };

function formatPatternRow(
	pattern: Pattern,
	converter: PatternConverter,
	formatter: PatternFormatter,
	schema: ChipSchema
): string {
	const generic = converter.toGeneric(pattern);
	return formatter.formatRow(
		generic.patternRows[0],
		generic.channels.map((channel) => channel.rows[0]),
		0,
		schema
	);
}

function fieldCellsForRow(rowString: string, schema: ChipSchema, pattern: Pattern): FieldCell[] {
	const cells: FieldCell[] = [];
	PatternTemplateParser.walkRow(rowString, schema, getPatternEffectColumnCounts(pattern), {
		onGlobalField(key, field, pos) {
			cells.push({ x: 0, width: field.length, charIndex: pos, fieldKey: key });
		},
		onChannelField(_channelIndex, key, field, pos) {
			cells.push({ x: 0, width: field.length, charIndex: pos, fieldKey: key });
		}
	});
	return cells;
}

function createClipboardContext(
	pattern: Pattern,
	converter: PatternConverter,
	formatter: PatternFormatter,
	schema: ChipSchema,
	selectedColumn: number,
	selection?: { minCol: number; maxCol: number }
): ClipboardContext {
	const getPatternRowData = (nextPattern: Pattern) =>
		formatPatternRow(nextPattern, converter, formatter, schema);
	const getCellPositions = (rowString: string) => fieldCellsForRow(rowString, schema, pattern);

	return {
		pattern,
		selectedRow: 0,
		selectedColumn,
		hasSelection: selection != null,
		getSelectionBounds: () =>
			selection
				? { minRow: 0, maxRow: 0, minCol: selection.minCol, maxCol: selection.maxCol }
				: null,
		getCellPositions,
		getPatternRowData,
		createEditingContext: (nextPattern, row, col) =>
			({
				pattern: nextPattern,
				selectedRow: row,
				selectedColumn: col,
				cellPositions: getCellPositions(getPatternRowData(nextPattern)),
				converter,
				formatter,
				schema
			}) as EditingContext,
		converter,
		formatter,
		schema
	};
}

describe('ClipboardService effect columns', () => {
	beforeEach(() => {
		clipboardStore.clear();
	});

	it('pastes an effect from the first column into another effect column', async () => {
		const converter = new AYConverter();
		const formatter = new AYFormatter();
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 2;
		pattern.channels[0].rows[0].effects = [new Effect(EffectType.Arpeggio, 1, 0x37), null];

		const targetCell = { x: 0, width: 4, charIndex: 0, fieldKey: 'effect1' };
		clipboardStore.copy(
			[
				{
					row: 0,
					column: 0,
					fieldKey: 'effect',
					fieldType: 'hex',
					value: { effect: EffectType.Arpeggio, delay: 1, parameter: 0x37 }
				}
			],
			0,
			0,
			0,
			0
		);

		let updated = pattern;
		const context: ClipboardContext = {
			pattern,
			selectedRow: 0,
			selectedColumn: 0,
			hasSelection: false,
			getSelectionBounds: () => null,
			getCellPositions: () => [targetCell],
			getPatternRowData: () => '',
			createEditingContext: (nextPattern) =>
				({
					pattern: nextPattern,
					selectedRow: 0,
					selectedColumn: 0,
					cellPositions: [targetCell],
					converter,
					formatter,
					schema: AY_CHIP_SCHEMA
				}) as EditingContext,
			converter,
			formatter,
			schema: AY_CHIP_SCHEMA
		};

		await ClipboardService.pasteSelection(context, (next) => {
			updated = next;
		});

		expect(updated.channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
		expect(updated.channels[0].rows[0].effects[1]).toEqual(
			expect.objectContaining({
				effect: EffectType.Arpeggio,
				delay: 1,
				parameter: 0x37
			})
		);
	});
});

describe('ClipboardService cross-chip paste', () => {
	beforeEach(() => {
		clipboardStore.clear();
	});

	it('applies volume table note instrument and effect when pasting AY channel data into NES', async () => {
		const ayConverter = new AYConverter();
		const ayFormatter = new AYFormatter();
		const ayPattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		ayPattern.channels[0].rows[0].note = new Note(NoteName.C, 4);
		ayPattern.channels[0].rows[0].instrument = 2;
		ayPattern.channels[0].rows[0].envelopeShape = 0xa;
		ayPattern.channels[0].rows[0].table = 3;
		ayPattern.channels[0].rows[0].volume = 0xc;
		ayPattern.channels[0].rows[0].effects = [new Effect(EffectType.Arpeggio, 1, 0x37)];

		const ayRow = formatPatternRow(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA);
		const ayCells = fieldCellsForRow(ayRow, AY_CHIP_SCHEMA, ayPattern);
		const noteCol = ayCells.findIndex((cell) => cell.fieldKey === 'note');
		const effectCol = ayCells.findIndex((cell) => cell.fieldKey === 'effect');
		expect(noteCol).toBeGreaterThanOrEqual(0);
		expect(effectCol).toBeGreaterThan(noteCol);

		ClipboardService.copySelection(
			createClipboardContext(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA, noteCol, {
				minCol: noteCol,
				maxCol: effectCol
			})
		);

		const nesConverter = new NESConverter();
		const nesFormatter = new NESFormatter();
		const nesPattern = new Pattern(1, 1, NES_CHIP_SCHEMA);
		const nesRow = formatPatternRow(nesPattern, nesConverter, nesFormatter, NES_CHIP_SCHEMA);
		const nesNoteCol = fieldCellsForRow(nesRow, NES_CHIP_SCHEMA, nesPattern).findIndex(
			(cell) => cell.fieldKey === 'note'
		);

		let updated = nesPattern;
		await ClipboardService.pasteSelection(
			createClipboardContext(
				nesPattern,
				nesConverter,
				nesFormatter,
				NES_CHIP_SCHEMA,
				nesNoteCol
			),
			(next) => {
				updated = next;
			}
		);

		const row = updated.channels[0].rows[0];
		expect(row.note).toEqual(expect.objectContaining({ name: NoteName.C, octave: 4 }));
		expect(row.instrument).toBe(2);
		expect(row.table).toBe(3);
		expect(row.volume).toBe(0xc);
		expect(row.effects[0]).toEqual(
			expect.objectContaining({
				effect: EffectType.Arpeggio,
				delay: 1,
				parameter: 0x37
			})
		);
	});

	it('does not convert AY envelope period into a NES note when pasting a channel block', async () => {
		const ayConverter = new AYConverter();
		const ayFormatter = new AYFormatter();
		const ayPattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		ayPattern.patternRows[0].envelopeValue = 0x1234;
		ayPattern.channels[0].rows[0].note = new Note(NoteName.C, 4);
		ayPattern.channels[0].rows[0].volume = 0xb;

		const ayRow = formatPatternRow(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA);
		const ayCells = fieldCellsForRow(ayRow, AY_CHIP_SCHEMA, ayPattern);
		ClipboardService.copySelection(
			createClipboardContext(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA, 0, {
				minCol: 0,
				maxCol: ayCells.length - 1
			})
		);

		const nesConverter = new NESConverter();
		const nesFormatter = new NESFormatter();
		const nesPattern = new Pattern(1, 1, NES_CHIP_SCHEMA);

		let updated = nesPattern;
		await ClipboardService.pasteSelection(
			createClipboardContext(nesPattern, nesConverter, nesFormatter, NES_CHIP_SCHEMA, 0),
			(next) => {
				updated = next;
			}
		);

		expect(updated.channels[0].rows[0].note).toEqual(
			expect.objectContaining({ name: NoteName.C, octave: 4 })
		);
		expect(updated.channels[0].rows[0].volume).toBe(0xb);
	});

	it('applies NES volume onto the AY volume field despite the extra envelope column', async () => {
		const nesConverter = new NESConverter();
		const nesFormatter = new NESFormatter();
		const nesPattern = new Pattern(1, 1, NES_CHIP_SCHEMA);
		nesPattern.channels[0].rows[0].note = new Note(NoteName.D, 3);
		nesPattern.channels[0].rows[0].volume = 0xe;
		nesPattern.channels[0].rows[0].table = 4;

		const nesRow = formatPatternRow(nesPattern, nesConverter, nesFormatter, NES_CHIP_SCHEMA);
		const nesCells = fieldCellsForRow(nesRow, NES_CHIP_SCHEMA, nesPattern);
		const noteCol = nesCells.findIndex((cell) => cell.fieldKey === 'note');
		const volumeCol = nesCells.findIndex((cell) => cell.fieldKey === 'volume');
		ClipboardService.copySelection(
			createClipboardContext(
				nesPattern,
				nesConverter,
				nesFormatter,
				NES_CHIP_SCHEMA,
				noteCol,
				{ minCol: noteCol, maxCol: volumeCol }
			)
		);

		const ayConverter = new AYConverter();
		const ayFormatter = new AYFormatter();
		const ayPattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		const ayRow = formatPatternRow(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA);
		const ayNoteCol = fieldCellsForRow(ayRow, AY_CHIP_SCHEMA, ayPattern).findIndex(
			(cell) => cell.fieldKey === 'note'
		);

		let updated = ayPattern;
		await ClipboardService.pasteSelection(
			createClipboardContext(ayPattern, ayConverter, ayFormatter, AY_CHIP_SCHEMA, ayNoteCol),
			(next) => {
				updated = next;
			}
		);

		expect(updated.channels[0].rows[0].note).toEqual(
			expect.objectContaining({ name: NoteName.D, octave: 3 })
		);
		expect(updated.channels[0].rows[0].table).toBe(4);
		expect(updated.channels[0].rows[0].volume).toBe(0xe);
		expect(updated.channels[0].rows[0].envelopeShape).toBe(0);
	});

	it('pastes an SAA envelope onto the destination group instead of the source column', async () => {
		const converter = new SAAConverter();
		const formatter = new SAAFormatter();
		const source = new Pattern(0, 1, SAA_CHIP_SCHEMA);
		source.channels[4].rows[0].note = new Note(NoteName.G, 8);
		source.channels[5].rows[0].note = new Note(NoteName.G, 5);
		source.patternRows[0].env0 = 9;
		source.patternRows[0].env1 = 3;

		const sourceRow = formatPatternRow(source, converter, formatter, SAA_CHIP_SCHEMA);
		const sourceCells = fieldCellsForRow(sourceRow, SAA_CHIP_SCHEMA, source);
		const noteColumns = sourceCells.flatMap((cell, index) =>
			cell.fieldKey === 'note' ? [index] : []
		);
		ClipboardService.copySelection(
			createClipboardContext(source, converter, formatter, SAA_CHIP_SCHEMA, noteColumns[4], {
				minCol: noteColumns[4],
				maxCol: sourceCells.length - 1
			})
		);

		const target = new Pattern(1, 1, SAA_CHIP_SCHEMA);
		const targetRow = formatPatternRow(target, converter, formatter, SAA_CHIP_SCHEMA);
		const targetNotes = fieldCellsForRow(targetRow, SAA_CHIP_SCHEMA, target).flatMap(
			(cell, index) => (cell.fieldKey === 'note' ? [index] : [])
		);

		let updated = target;
		await ClipboardService.pasteSelection(
			createClipboardContext(target, converter, formatter, SAA_CHIP_SCHEMA, targetNotes[0]),
			(next) => {
				updated = next;
			}
		);

		expect(updated.channels[0].rows[0].note).toEqual(
			expect.objectContaining({ name: NoteName.G, octave: 8 })
		);
		expect(updated.channels[1].rows[0].note).toEqual(
			expect.objectContaining({ name: NoteName.G, octave: 5 })
		);
		expect(updated.channels[4].rows[0].note.name).toBe(NoteName.None);
		expect(updated.patternRows[0].env0).toBe(3);
		expect(updated.patternRows[0].env1).toBe(0);
	});
});

describe('ClipboardService effect columns', () => {
	it('pastes an effect from the first column into another effect column', async () => {
		const converter = new AYConverter();
		const formatter = new AYFormatter();
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 2;
		pattern.channels[0].rows[0].effects = [new Effect(EffectType.Arpeggio, 1, 0x37), null];

		const targetCell = { x: 0, width: 4, charIndex: 0, fieldKey: 'effect1' };
		clipboardStore.copy(
			[
				{
					row: 0,
					column: 0,
					fieldKey: 'effect',
					fieldType: 'hex',
					value: { effect: EffectType.Arpeggio, delay: 1, parameter: 0x37 }
				}
			],
			0,
			0,
			0,
			0
		);

		let updated = pattern;
		const context: ClipboardContext = {
			pattern,
			selectedRow: 0,
			selectedColumn: 0,
			hasSelection: false,
			getSelectionBounds: () => null,
			getCellPositions: () => [targetCell],
			getPatternRowData: () => '',
			createEditingContext: (nextPattern) =>
				({
					pattern: nextPattern,
					selectedRow: 0,
					selectedColumn: 0,
					cellPositions: [targetCell],
					converter,
					formatter,
					schema: AY_CHIP_SCHEMA
				}) as EditingContext,
			converter,
			formatter,
			schema: AY_CHIP_SCHEMA
		};

		await ClipboardService.pasteSelection(context, (next) => {
			updated = next;
		});

		expect(updated.channels[0].rows[0].effects[0]?.effect).toBe(EffectType.Arpeggio);
		expect(updated.channels[0].rows[0].effects[1]).toEqual(
			expect.objectContaining({
				effect: EffectType.Arpeggio,
				delay: 1,
				parameter: 0x37
			})
		);
	});
});
