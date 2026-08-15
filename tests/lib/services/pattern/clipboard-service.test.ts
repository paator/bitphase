import { describe, expect, it } from 'vitest';
import { ClipboardService, type ClipboardContext } from '@/lib/services/pattern/clipboard-service';
import { clipboardStore } from '@/lib/stores/clipboard.svelte';
import { Effect, EffectType, Pattern } from '@/lib/models/song';
import { AYConverter } from '@/lib/chips/ay/adapter';
import { AYFormatter } from '@/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import type { EditingContext } from '@/lib/services/pattern/editing/editing-context';

describe('ClipboardService effect columns', () => {
	it('pastes an effect from the first column into another effect column', async () => {
		const converter = new AYConverter();
		const formatter = new AYFormatter();
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].effectColumnCount = 2;
		pattern.channels[0].rows[0].effects = [
			new Effect(EffectType.Arpeggio, 1, 0x37),
			null
		];

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
