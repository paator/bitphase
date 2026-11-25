import { describe, expect, it } from 'vitest';
import { AY_CHIP_SCHEMA } from '../../../src/lib/chips/ay/schema';
import { PATTERN_EDITOR_COLOR_KEYS } from '../../../src/lib/config/theme-colors';
import {
	CHANNEL_LEVEL_STRIP_HEIGHT,
	channelLevelBarBox,
	getChannelLevelStripDeviceRect,
	headerRouteDockX,
	PatternEditorRenderer,
	roleDriveLinks
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
	return channelLevelBarBox(buttonX, buttonWidth).x;
}

describe('headerRouteDockX', () => {
	it('keeps space on both sides of the arrow', () => {
		const buttonX = 10;
		const buttonWidth = 100;
		const bar = channelLevelBarBox(buttonX, buttonWidth);
		const wing = 3.5;
		const left = headerRouteDockX(buttonX, buttonWidth, 'left');
		const right = headerRouteDockX(buttonX, buttonWidth, 'right');

		expect(left).toBeGreaterThanOrEqual(buttonX + buttonWidth * 0.2);
		expect(right).toBeLessThanOrEqual(buttonX + buttonWidth * 0.8);
		expect(left - wing).toBeGreaterThanOrEqual(buttonX + 4);
		expect(left + wing).toBeLessThanOrEqual(bar.x - 4);
		expect(right + wing).toBeLessThanOrEqual(buttonX + buttonWidth - 4);
		expect(right - wing).toBeGreaterThanOrEqual(bar.x + bar.width + 4);
	});
});

describe('roleDriveLinks', () => {
	it('points a timer column at the voice beside it', () => {
		expect(roleDriveLinks([{ virtualChannelIndices: [0, 1] }], [null, 'Timer'])).toEqual([
			{ sourceIndex: 1, voiceIndex: 0 }
		]);
	});

	it('points a timer column at every voice in the group', () => {
		expect(
			roleDriveLinks([{ virtualChannelIndices: [0, 1, 2] }], [null, null, 'Timer'])
		).toEqual([
			{ sourceIndex: 2, voiceIndex: 0 },
			{ sourceIndex: 2, voiceIndex: 1 }
		]);
	});

	it('sends a middle timer column both ways', () => {
		expect(
			roleDriveLinks([{ virtualChannelIndices: [0, 1, 2] }], [null, 'Timer', null])
		).toEqual([
			{ sourceIndex: 1, voiceIndex: 0 },
			{ sourceIndex: 1, voiceIndex: 2 }
		]);
	});

	it('ignores a group with no timer column', () => {
		expect(roleDriveLinks([{ virtualChannelIndices: [0, 1] }], [null, null])).toEqual([]);
	});
});

describe('drawChannelLabels header routes', () => {
	it('paints the route labels under the channel names', () => {
		const texts: string[] = [];
		const ctx = new Proxy(
			{
				font: '12px mono',
				globalAlpha: 1,
				fillStyle: '',
				strokeStyle: '',
				lineWidth: 1,
				lineCap: 'butt',
				lineJoin: 'miter',
				textBaseline: 'middle'
			},
			{
				get(target, prop, receiver) {
					if (prop === 'measureText') {
						return (text: string) => ({
							width: text.length * 8,
							actualBoundingBoxAscent: 6,
							actualBoundingBoxDescent: 2
						});
					}
					if (prop === 'fillText') {
						return (text: string) => {
							texts.push(text);
						};
					}
					const value = Reflect.get(target, prop, receiver);
					if (value !== undefined) return value;
					return () => {};
				}
			}
		);
		const renderer = new PatternEditorRenderer({
			ctx: ctx as unknown as CanvasRenderingContext2D,
			colors: stubPatternColors(),
			canvasWidth: 800,
			lineHeight: 20,
			schema: AY_CHIP_SCHEMA,
			channelSeparatorWidth: 1,
			selectionStyle: 'filled',
			emptyNoteAlignment: 'center'
		});
		renderer.setChannelEffectColumnCounts([1, 1, 1]);
		renderer.drawChannelLabels({
			rowString: '00 .... .... .. --- 00.F 0000 --- 00.F 0000 --- 00.F 0000',
			channelLabels: ['A', 'B', 'C'],
			channelMuted: [false, false, false],
			headerRoutes: [
				{
					fromIndex: 1,
					toIndices: [2],
					label: 'env',
					tone: 'envelope',
					lane: 0,
					arrow: true
				},
				{
					fromIndex: 0,
					toIndices: [],
					label: 'high',
					tone: 'noise',
					lane: 1,
					arrow: false
				},
				{
					fromIndex: 2,
					toIndices: [],
					label: 'high',
					tone: 'noise',
					lane: 1,
					arrow: false
				}
			]
		});
		expect(texts).toContain('env');
		expect(texts).toContain('high');
	});
});
