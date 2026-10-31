import { describe, expect, it } from 'vitest';
import { BaseFormatter } from '@/lib/chips/base/formatter';
import { AYFormatter } from '@/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import {
	SAA_CHIP_SCHEMA,
	SAA_SAM_CLOCK,
	resolveSaaTuningTable,
	saaToneFrequency
} from '@/lib/chips/saa/schema';
import { PatternTemplateParser } from '@/lib/services/pattern/editing/pattern-template-parsing';
import { PatternNavigationService } from '@/lib/services/pattern/pattern-navigation';
import { Pattern } from '@/lib/models/song';
import type { GenericPattern } from '@/lib/models/song/generic';
import type { CellPosition } from '@/lib/ui-rendering/pattern-editor-text-parser';

class RowFormatter extends BaseFormatter {}

const CHANNEL = {
	note: 'C-4',
	instrument: 1,
	table: 0,
	left: 15,
	right: 8,
	effect: null
};

function saaRow(): string {
	const formatter = new RowFormatter();
	return formatter.formatRow(
		{ noise0: 1, env0: 4, noise1: 3, env1: 2 },
		Array.from({ length: 6 }, () => ({ ...CHANNEL })),
		0,
		SAA_CHIP_SCHEMA
	);
}

describe('SAA pattern layout', () => {
	it('places noise before A and D, and envelope shape before C and F', () => {
		const tokens = saaRow().split(/\s+/);
		expect(tokens[1]).toBe('1');
		expect(tokens[2]).toBe('C-4');
		expect(tokens).toContain('4');
		expect(tokens).toContain('2');
	});

	it('walks columns as noise, A B, envelope, C, noise, D E, envelope, F', () => {
		const order: string[] = [];
		PatternTemplateParser.walkRow(saaRow(), SAA_CHIP_SCHEMA, [1, 1, 1, 1, 1, 1], {
			onGlobalField(key) {
				order.push(key);
			},
			onChannelStart(index) {
				order.push(`ch${index}`);
			}
		});
		expect(order).toEqual([
			'noise0',
			'ch0',
			'ch1',
			'env0',
			'ch2',
			'noise1',
			'ch3',
			'ch4',
			'env1',
			'ch5'
		]);
	});

	it('parses anchored noise and envelope shapes back onto the pattern row', () => {
		const parsed = new RowFormatter().parseRow(saaRow(), SAA_CHIP_SCHEMA);
		expect(parsed.patternRow.noise0).toBe(1);
		expect(parsed.patternRow.env0).toBe(4);
		expect(parsed.patternRow.noise1).toBe(3);
		expect(parsed.patternRow.env1).toBe(2);
		expect(parsed.channels).toHaveLength(6);
		expect(parsed.channels[0]?.left).toBe(15);
		expect(parsed.channels[0]?.right).toBe(8);
		expect(parsed.channels[0]?.envelopeShape).toBeUndefined();
		expect(parsed.channels[3]?.note).toBe('C-4');
	});

	it('keeps the AY global block in front of the channels', () => {
		const row = new AYFormatter().formatRow(
			{},
			[{ note: null, instrument: 0, envelopeShape: 0, table: 0, volume: 0, effect: null }],
			0,
			AY_CHIP_SCHEMA
		);
		expect(row.startsWith('00 .... .... .. ')).toBe(true);
	});

	it('moves from noise0 to channel A, and from C to noise1', () => {
		const row = saaRow();
		const cells: CellPosition[] = [];
		PatternTemplateParser.walkRow(row, SAA_CHIP_SCHEMA, [1, 1, 1, 1, 1, 1], {
			onGlobalField(key, field, pos) {
				for (let i = 0; i < field.length; i++) {
					cells.push({ x: 0, width: 1, charIndex: pos + i, fieldKey: key });
				}
			},
			onChannelField(_index, key, field, pos) {
				const atomic = SAA_CHIP_SCHEMA.fields[key]?.selectable === 'atomic';
				if (atomic) {
					cells.push({ x: 0, width: field.length, charIndex: pos, fieldKey: key });
					return;
				}
				for (let i = 0; i < field.length; i++) {
					cells.push({ x: 0, width: 1, charIndex: pos + i, fieldKey: key });
				}
			}
		});

		const pattern = new Pattern(0, 1, SAA_CHIP_SCHEMA);
		const generic: GenericPattern = {
			id: 0,
			length: 1,
			channels: Array.from({ length: 6 }, () => ({ rows: [{ ...CHANNEL }] })),
			patternRows: [{ noise0: 1, env0: 4, noise1: 3, env1: 2 }]
		};
		const context = {
			patterns: [pattern],
			patternOrder: [0],
			currentPattern: pattern,
			converter: {
				toGeneric: () => generic,
				fromGeneric: () => pattern
			},
			formatter: new RowFormatter(),
			schema: SAA_CHIP_SCHEMA,
			getCellPositions: () => cells
		};
		const state = { selectedRow: 0, currentPatternOrderIndex: 0, selectedColumn: 0 };

		const onA = PatternNavigationService.moveToNextChannel(state, context);
		expect(cells[onA.selectedColumn]?.fieldKey).toBe('note');
		expect(
			PatternTemplateParser.calculateChannelIndexForField(
				'note',
				cells[onA.selectedColumn]!.charIndex,
				row,
				SAA_CHIP_SCHEMA,
				[1, 1, 1, 1, 1, 1]
			)
		).toBe(0);

		let column = onA.selectedColumn;
		let channel = 0;
		while (channel < 2) {
			const next = PatternNavigationService.moveToNextChannel(
				{ ...state, selectedColumn: column },
				context
			);
			column = next.selectedColumn;
			channel = PatternTemplateParser.calculateChannelIndexForField(
				cells[column]!.fieldKey ?? '',
				cells[column]!.charIndex,
				row,
				SAA_CHIP_SCHEMA,
				[1, 1, 1, 1, 1, 1]
			);
		}
		const onNoise1 = PatternNavigationService.moveToNextChannel(
			{ ...state, selectedColumn: column },
			context
		);
		expect(cells[onNoise1.selectedColumn]?.fieldKey).toBe('noise1');
	});

	it('packs A4 near 440 Hz at the SAM clock', () => {
		const table = resolveSaaTuningTable(SAA_SAM_CLOCK, 440);
		const packed = table[45] ?? 0;
		const hz = saaToneFrequency(SAA_SAM_CLOCK, packed >> 8, packed & 0xff);
		expect(hz).toBeGreaterThan(435);
		expect(hz).toBeLessThan(445);
	});
});
