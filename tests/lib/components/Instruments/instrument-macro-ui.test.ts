import { describe, expect, it } from 'vitest';
import type { InstrumentMacroField } from '@/lib/chips/base/instrument-macros';
import {
	applyMacroLengthKey,
	applyMacroLoopKey,
	cycleInstrumentMacroEnum,
	instrumentMacroEnumIsActive,
	instrumentMacroEnumLabel,
	instrumentMacroUsesBarChart,
	integerMacroBarStyle,
	macroFieldRowHeight
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
		expect(macroFieldRowHeight(pulseField, false)).toBe(macroFieldRowHeight(integerField, false));
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

	it('keeps integer rows taller than gate rows', () => {
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

describe('macro handle keys', () => {
	it('moves the loop with arrows and jumps with home/end', () => {
		const event = { key: 'ArrowRight', preventDefault() {} } as KeyboardEvent;
		expect(applyMacroLoopKey(event, 2, 5)).toBe(3);
		expect(applyMacroLoopKey({ key: 'Home', preventDefault() {} } as KeyboardEvent, 2, 5)).toBe(
			0
		);
		expect(applyMacroLoopKey({ key: 'End', preventDefault() {} } as KeyboardEvent, 2, 5)).toBe(5);
	});

	it('grows and shrinks length with arrows', () => {
		expect(
			applyMacroLengthKey({ key: 'ArrowRight', preventDefault() {} } as KeyboardEvent, 4)
		).toBe(5);
		expect(
			applyMacroLengthKey({ key: 'ArrowLeft', preventDefault() {} } as KeyboardEvent, 4)
		).toBe(3);
	});
});
