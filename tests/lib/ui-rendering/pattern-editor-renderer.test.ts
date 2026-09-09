import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '../../../src/lib/chips/ay/schema';
import { PATTERN_EDITOR_COLOR_KEYS } from '../../../src/lib/config/theme-colors';
import {
	CHANNEL_LEVEL_STRIP_HEIGHT,
	getChannelLevelStripDeviceRect,
	PatternEditorRenderer
} from '../../../src/lib/ui-rendering/pattern-editor-renderer';
import type { getColors } from '../../../src/lib/utils/colors';

describe('getChannelLevelStripDeviceRect', () => {
	it('maps CSS header height into device pixels', () => {
		expect(getChannelLevelStripDeviceRect(20, 400, 2)).toEqual({
			x: 0,
			y: 40,
			width: 800,
			height: CHANNEL_LEVEL_STRIP_HEIGHT * 2
		});
	});

	it('does not place the strip inside the header on a 1x canvas', () => {
		expect(getChannelLevelStripDeviceRect(20, 400, 1)).toEqual({
			x: 0,
			y: 20,
			width: 400,
			height: CHANNEL_LEVEL_STRIP_HEIGHT
		});
	});
});

describe('drawChannelLevelStripOnOverlay', () => {
	it('measures channel positions with the pattern canvas font, not the overlay font', () => {
		const pattern = createMeasuringContext('12px pattern-mono', 8);
		const overlay = createMeasuringContext('12px overlay-mono', 20);
		const renderer = new PatternEditorRenderer({
			ctx: pattern.ctx,
			colors: stubPatternColors(),
			canvasWidth: 800,
			lineHeight: 20,
			schema: AY_CHIP_SCHEMA,
			channelSeparatorWidth: 1,
			selectionStyle: 'filled',
			emptyNoteAlignment: 'center'
		});

		renderer.setChannelEffectColumnCounts([1, 1, 1]);
		renderer.drawChannelLevelStripOnOverlay(overlay.ctx, {
			rowString: '00 .... .... .. --- 00.F 0000 --- 00.F 0000 --- 00.F 0000',
			channelLabels: ['A', 'B', 'C'],
			channelMuted: [false, false, false],
			channelLevels: [1, 1, 1]
		});

		expect(overlay.measureCalls).toBe(0);
		expect(pattern.measureCalls).toBeGreaterThan(0);
		expect(overlay.fillXs.length).toBe(3);
		expect(overlay.fillXs[0]).toBe(patternExpectedBarX(8));
		expect(overlay.fillXs[0]).not.toBe(patternExpectedBarX(20));
	});
});

function stubPatternColors(): ReturnType<typeof getColors> {
	return Object.fromEntries(
		PATTERN_EDITOR_COLOR_KEYS.map((key) => [key, '#ffffff'])
	) as ReturnType<typeof getColors>;
}

function createMeasuringContext(font: string, charWidth: number) {
	let measureCalls = 0;
	const fillXs: number[] = [];
	const ctx = {
		font,
		globalAlpha: 1,
		fillStyle: '',
		save() {},
		restore() {},
		clearRect() {},
		fillRect(x: number) {
			fillXs.push(x);
		},
		measureText(text: string) {
			measureCalls += 1;
			return { width: text.length * charWidth };
		}
	};

	return {
		ctx: ctx as unknown as CanvasRenderingContext2D,
		get measureCalls() {
			return measureCalls;
		},
		fillXs
	};
}

function patternExpectedBarX(charWidth: number): number {
	const rowString = '00 .... .... .. --- 00.F 0000 --- 00.F 0000 --- 00.F 0000';
	const firstChannel = rowString.indexOf('---');
	const secondChannel = rowString.indexOf('---', firstChannel + 1);
	const channelStart = 10 + firstChannel * charWidth;
	const channelEnd = 10 + secondChannel * charWidth;
	const buttonX = Math.max(0, channelStart - 4);
	const buttonWidth = channelEnd - 4 - buttonX;
	const barWidth = Math.max(10, Math.round(buttonWidth * 0.85));
	const barX = buttonX + (buttonWidth - barWidth) / 2;
	return barX;
}
