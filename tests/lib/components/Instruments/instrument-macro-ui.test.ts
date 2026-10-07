import { describe, expect, it } from 'vitest';
import type { InstrumentMacroField } from '@/lib/chips/base/instrument-macros';
import { AY_MIXER_MACRO_FIELDS } from '@/lib/chips/ay/mixer-macros';
import {
	applyInstrumentMacroSequenceText,
	clampMacroBarViewMin,
	cycleInstrumentMacroEnum,
	defaultMacroBarViewMin,
	formatMacroSequenceText,
	instrumentMacroEnumIsActive,
	instrumentMacroEnumLabel,
	instrumentMacroUsesBarChart,
	instrumentMacroUsesSquareSteps,
	integerFromMacroBarNormalized,
	integerMacroBarStyle,
	macroBarOverflowDirection,
	macroBarNeedsScroll,
	macroBarViewMinForValues,
	macroBarViewMinFromTrackY,
	macroBarVisibleSpan,
	macroBarZeroNormalized,
	macroBarScaleThumbLayout,
	macroBarScaleThumbRatio,
	macroBarScaleThumbT,
	macroBarScaleCenterT,
	macroBarScaleCenterViewMin,
	snapMacroBarViewMinToCenterTick,
	snapMacroBarViewMinCrossingCenter,
	macroBarScaleShouldCatchCenter,
	macroBarScaleShouldHoldCenter,
	macroBarScaleThumbNearCenter,
	macroBarScaleUnsnapFromCenter,
	macroBarViewMinFromDragDelta,
	MACRO_BAR_SCALE_MIN_THUMB_PX,
	macroFieldRowHeight,
	panMacroBarViewMin,
	parseMacroSequenceText
} from '@/lib/components/Instruments/instrument-macro-ui';

const booleanField: InstrumentMacroField = {
	id: 'retrigger',
	label: 'Retrigger',
	title: 'Retrigger',
	kind: 'boolean',
	defaultValue: false
};

const integerField: InstrumentMacroField = {
	id: 'volume',
	label: 'Volume',
	title: 'Volume',
	kind: 'integer',
	min: 0,
	max: 15,
	defaultValue: 15
};

const enumField: InstrumentMacroField = {
	id: 'slide',
	label: 'Slide',
	title: 'Slide',
	kind: 'enum',
	min: -1,
	max: 1,
	defaultValue: 0,
	enumValues: [
		{ value: 0, label: '' },
		{ value: 1, label: '↑' },
		{ value: -1, label: '↓' }
	]
};

describe('macroFieldRowHeight', () => {
	it('makes boolean rows square with the step width', () => {
		expect(macroFieldRowHeight(booleanField, false)).toBe(30);
		expect(macroFieldRowHeight(booleanField, true)).toBe(36);
	});

	it('makes pulse-width bar rows the same height as integer rows', () => {
		const pulseField: InstrumentMacroField = {
			...enumField,
			id: 'pulseWidth',
			min: 0,
			max: 3,
			enumValues: [
				{ value: 0, label: '12.5%', bar: true },
				{ value: 2, label: '50%', bar: true }
			]
		};
		expect(instrumentMacroUsesBarChart(pulseField)).toBe(true);
		expect(macroFieldRowHeight(pulseField, false)).toBe(
			macroFieldRowHeight(integerField, false)
		);
		expect(macroFieldRowHeight(pulseField, true)).toBe(macroFieldRowHeight(integerField, true));
	});

	it('makes icon enum rows the same height as boolean rows', () => {
		const iconEnumField: InstrumentMacroField = {
			...enumField,
			id: 'fmOffsetMode',
			enumValues: [
				{ value: 0, label: 'Semitone', icon: 'semitone' },
				{ value: 1, label: 'Period', icon: 'period' }
			]
		};
		expect(macroFieldRowHeight(iconEnumField, false)).toBe(30);
		expect(macroFieldRowHeight(iconEnumField, true)).toBe(36);
	});

	it('makes amplitude slide rows square like booleans', () => {
		const slideField = AY_MIXER_MACRO_FIELDS.find((field) => field.id === 'amplitudeSlide')!;
		expect(instrumentMacroUsesSquareSteps(slideField)).toBe(true);
		expect(macroFieldRowHeight(slideField, false)).toBe(
			macroFieldRowHeight(booleanField, false)
		);
		expect(macroFieldRowHeight(slideField, true)).toBe(macroFieldRowHeight(booleanField, true));
	});

	it('keeps integer rows taller than gate rows', () => {
		expect(macroFieldRowHeight(integerField, false)).toBe(140);
		expect(macroFieldRowHeight(integerField, true)).toBe(168);
		expect(macroFieldRowHeight(integerField, false)).toBeGreaterThan(
			macroFieldRowHeight(booleanField, false)
		);
	});
});

describe('cycleInstrumentMacroEnum', () => {
	it('walks through enum options and wraps', () => {
		expect(cycleInstrumentMacroEnum(enumField, 0)).toBe(1);
		expect(cycleInstrumentMacroEnum(enumField, 1)).toBe(-1);
		expect(cycleInstrumentMacroEnum(enumField, -1)).toBe(0);
	});
});

describe('instrumentMacroEnum helpers', () => {
	it('treats the default as inactive and labels the rest', () => {
		expect(instrumentMacroEnumIsActive(enumField, 0)).toBe(false);
		expect(instrumentMacroEnumIsActive(enumField, 1)).toBe(true);
		expect(instrumentMacroEnumLabel(enumField, 1)).toBe('↑');
	});
});

describe('integerMacroBarStyle', () => {
	it('fills from the bottom for unsigned values', () => {
		expect(integerMacroBarStyle(integerField, 15, 'red')).toContain('background: red');
		expect(integerMacroBarStyle(integerField, 15, 'red')).toContain('bottom: 3px');
	});
});

describe('macro bar visible range', () => {
	const signedField: InstrumentMacroField = {
		id: 'toneAdd',
		label: 'Offset',
		title: 'Tone Offset',
		kind: 'integer',
		min: -4096,
		max: 4095,
		defaultValue: 0
	};
	const noiseField: InstrumentMacroField = {
		id: 'noiseAdd',
		label: 'Offset',
		title: 'Noise Offset',
		kind: 'integer',
		min: -31,
		max: 31,
		defaultValue: 0
	};

	it('zooms signed wide fields to -64..64 by default', () => {
		expect(defaultMacroBarViewMin(signedField)).toBe(-64);
		expect(macroBarVisibleSpan(signedField)).toBe(128);
		expect(macroBarNeedsScroll(signedField)).toBe(true);
	});

	it('keeps small ranges fully visible', () => {
		expect(defaultMacroBarViewMin(integerField)).toBe(0);
		expect(macroBarVisibleSpan(integerField)).toBe(15);
		expect(macroBarNeedsScroll(integerField)).toBe(false);
		expect(defaultMacroBarViewMin(noiseField)).toBe(-31);
		expect(macroBarNeedsScroll(noiseField)).toBe(false);
	});

	it('maps paint Y onto the visible window, not the full field range', () => {
		expect(integerFromMacroBarNormalized(signedField, 0, -64)).toBe(-64);
		expect(integerFromMacroBarNormalized(signedField, 0.5, -64)).toBe(0);
		expect(integerFromMacroBarNormalized(signedField, 1, -64)).toBe(64);
		expect(integerFromMacroBarNormalized(signedField, 1, 64)).toBe(192);
	});

	it('clamps the window to the field range', () => {
		expect(clampMacroBarViewMin(signedField, -9000)).toBe(-4096);
		expect(clampMacroBarViewMin(signedField, 9000)).toBe(3967);
		expect(clampMacroBarViewMin(signedField, 0)).toBe(0);
	});

	it('pans to include values outside the default window', () => {
		expect(macroBarViewMinForValues(signedField, [0, 8, -4])).toBe(-64);
		expect(macroBarViewMinForValues(signedField, [200, 220])).toBe(146);
	});

	it('draws signed bars from zero inside the visible window', () => {
		const style = integerMacroBarStyle(signedField, 32, 'red', -64);
		expect(style).toContain('background: red');
		expect(style).toContain('* 0.5');
		expect(style).toContain('* 0.25');
	});

	it('points at off-screen values so you know which way to scroll', () => {
		expect(macroBarOverflowDirection(signedField, 32, -64)).toBeNull();
		expect(macroBarOverflowDirection(signedField, 200, -64)).toBeNull();
		expect(macroBarOverflowDirection(signedField, 0, 128)).toBe('down');
		expect(macroBarOverflowDirection(signedField, 50, 128)).toBe('down');
		expect(macroBarOverflowDirection(signedField, 200, 128)).toBeNull();
		expect(macroBarOverflowDirection(signedField, 400, 128)).toBeNull();
		expect(macroBarOverflowDirection(signedField, 0, -4096)).toBe('up');
		expect(macroBarOverflowDirection(integerField, 0, 0)).toBeNull();
		expect(macroBarOverflowDirection(integerField, 15, 0)).toBeNull();
	});

	it('places the zero line in the middle of the default window', () => {
		expect(macroBarZeroNormalized(signedField, -64)).toBe(0.5);
		expect(macroBarZeroNormalized(signedField, 64)).toBeNull();
		expect(macroBarZeroNormalized(integerField, 0)).toBeNull();
	});

	it('inverts the scrollbar so higher values are at the top', () => {
		expect(macroBarViewMinFromTrackY(signedField, 0)).toBe(3967);
		expect(macroBarViewMinFromTrackY(signedField, 1)).toBe(-4096);
	});

	it('snaps a click on the center tick and leaves nearby values reachable', () => {
		expect(macroBarScaleCenterViewMin(signedField)).toBe(-64);
		expect(macroBarScaleCenterT(signedField)).toBeCloseTo(0.5, 1);
		expect(snapMacroBarViewMinToCenterTick(signedField, 0, 50, 0, 100)).toBe(-64);
		expect(snapMacroBarViewMinToCenterTick(signedField, 2000, 20, 0, 100)).toBe(2000);
		expect(macroBarScaleUnsnapFromCenter(signedField, 60, 50)).toBe(-65);
		expect(macroBarScaleUnsnapFromCenter(signedField, 40, 50)).toBe(-63);
		expect(macroBarViewMinFromDragDelta(signedField, -65, 60, 59, 100)).toBeGreaterThan(-65);
		expect(snapMacroBarViewMinCrossingCenter(signedField, 0, -80)).toBe(-64);
		expect(snapMacroBarViewMinCrossingCenter(signedField, -64, -72)).toBe(-72);
		expect(macroBarScaleShouldCatchCenter(signedField, 3967, -4096)).toBe(true);
		expect(macroBarScaleShouldCatchCenter(signedField, 2000, 1800)).toBe(false);
		expect(macroBarScaleShouldCatchCenter(signedField, -64, -80)).toBe(false);
		expect(macroBarScaleShouldCatchCenter(signedField, -65, -80)).toBe(false);
		expect(macroBarScaleShouldCatchCenter(signedField, 2000, -50)).toBe(false);
		expect(macroBarScaleShouldCatchCenter(signedField, 2000, -64)).toBe(true);
		expect(macroBarScaleShouldCatchCenter(signedField, 2000, -80)).toBe(true);
		expect(macroBarScaleShouldCatchCenter(signedField, -2000, 0)).toBe(true);
		expect(macroBarScaleThumbNearCenter(signedField, -65, 400)).toBe(true);
		expect(macroBarScaleThumbNearCenter(signedField, 2000, 400)).toBe(false);
		expect(macroBarScaleShouldHoldCenter(0, 1)).toBe(true);
		expect(macroBarScaleShouldHoldCenter(40, 1)).toBe(true);
		expect(macroBarScaleShouldHoldCenter(40, 2)).toBe(false);
		expect(macroBarScaleShouldHoldCenter(8, 4)).toBe(true);
	});

	it('sizes the thumb to the visible span, not a padded percentage', () => {
		expect(macroBarScaleThumbRatio(signedField)).toBeCloseTo(128 / 8191);
		const top = macroBarScaleThumbLayout(signedField, 3967, 100);
		const bottom = macroBarScaleThumbLayout(signedField, -4096, 100);
		expect(top.height).toBe(MACRO_BAR_SCALE_MIN_THUMB_PX);
		expect(top.top).toBe(0);
		expect(bottom.top + bottom.height).toBe(100);
		expect(macroBarScaleThumbT(signedField, 3967)).toBe(1);
		expect(macroBarScaleThumbT(signedField, -4096)).toBe(0);
	});

	it('pans the window when painting past the row edge', () => {
		expect(panMacroBarViewMin(signedField, -64, -1, 0, 100)).toBe(-63);
		expect(panMacroBarViewMin(signedField, -64, 101, 0, 100)).toBe(-65);
		expect(panMacroBarViewMin(signedField, -64, 50, 0, 100)).toBe(-64);
	});
});

describe('macro sequence text', () => {
	it('formats values with a loop marker', () => {
		expect(formatMacroSequenceText([15, 12, 8, 4], 2, integerField, false)).toBe('15 12 | 8 4');
		expect(formatMacroSequenceText([15, 12, 8], 0, integerField, false)).toBe('| 15 12 8');
		expect(formatMacroSequenceText([15, 12], 1, integerField, true)).toBe('F | C');
	});

	it('formats a release marker', () => {
		expect(
			formatMacroSequenceText(
				[13, 11, 10, 9, 7, 3, 4, 5, 5, 5, 4, 4, 3, 2, 1, 1],
				1,
				integerField,
				false,
				4
			)
		).toBe('13 | 11 10 9 / 7 3 4 5 5 5 4 4 3 2 1 1');
	});

	it('parses space-separated values and a loop marker', () => {
		expect(parseMacroSequenceText('15 12 | 8 4', integerField, false)).toEqual({
			values: [15, 12, 8, 4],
			loop: 2,
			release: -1
		});
		expect(parseMacroSequenceText('15 12 8', integerField, false)).toEqual({
			values: [15, 12, 8],
			loop: 0,
			release: -1
		});
		expect(parseMacroSequenceText('15 12|8', integerField, false)).toEqual({
			values: [15, 12, 8],
			loop: 2,
			release: -1
		});
		expect(parseMacroSequenceText('F C | 8', integerField, true)).toEqual({
			values: [15, 12, 8],
			loop: 2,
			release: -1
		});
	});

	it('parses a release marker', () => {
		expect(parseMacroSequenceText('13 | 11 10 9 / 7 3', integerField, false)).toEqual({
			values: [13, 11, 10, 9, 7, 3],
			loop: 1,
			release: 4
		});
		expect(parseMacroSequenceText('15 12/8', integerField, false)).toEqual({
			values: [15, 12, 8],
			loop: 0,
			release: 2
		});
		expect(parseMacroSequenceText('| / 8 4', integerField, false)).toEqual({
			values: [8, 4],
			loop: 0,
			release: 0
		});
	});

	it('rejects invalid tokens and extra loop markers', () => {
		expect(parseMacroSequenceText('15 x 8', integerField, false)).toBeNull();
		expect(parseMacroSequenceText('15 | 8 | 4', integerField, false)).toBeNull();
		expect(parseMacroSequenceText('15 / 8 / 4', integerField, false)).toBeNull();
		expect(parseMacroSequenceText('15 12 /', integerField, false)).toBeNull();
		expect(parseMacroSequenceText('|', integerField, false)).toBeNull();
		expect(parseMacroSequenceText('   ', integerField, false)).toBeNull();
	});

	it('clamps values to the field range', () => {
		expect(parseMacroSequenceText('15 20 | -3', integerField, false)).toEqual({
			values: [15, 15, 0],
			loop: 2,
			release: -1
		});
	});

	it('parses enum labels and numeric values', () => {
		const pulseField: InstrumentMacroField = {
			...enumField,
			id: 'pulseWidth',
			min: 0,
			max: 3,
			enumValues: [
				{ value: 0, label: '12.5%', bar: true },
				{ value: 1, label: '25%', bar: true },
				{ value: 2, label: '50%', bar: true }
			]
		};
		expect(parseMacroSequenceText('12.5% | 50%', pulseField, false)).toEqual({
			values: [0, 2],
			loop: 1,
			release: -1
		});
		expect(parseMacroSequenceText('0 1 | 2', pulseField, false)).toEqual({
			values: [0, 1, 2],
			loop: 2,
			release: -1
		});
	});

	it('applies text to shared sequence length and loop', () => {
		const next = applyInstrumentMacroSequenceText(
			{
				volume: { values: [15, 8], loop: 0 },
				retrigger: { values: [false, true], loop: 0 }
			},
			[integerField, booleanField],
			integerField,
			'15 12 | 8 4',
			false
		);
		expect(next?.volume).toEqual({ values: [15, 12, 8, 4], loop: 2 });
		expect(next?.retrigger?.values).toHaveLength(4);
		expect(next?.retrigger?.loop).toBe(2);
	});

	it('leaves macros unchanged when the text matches the current sequence', () => {
		const macros = {
			volume: { values: [15, 8], loop: 1 }
		};
		expect(
			applyInstrumentMacroSequenceText(macros, [integerField], integerField, '15 | 8', false)
		).toBe(macros);
	});
});
