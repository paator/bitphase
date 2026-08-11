import { describe, expect, it } from 'vitest';
import {
	commitRowEditorNumericInput,
	formatRowEditorNumber,
	parseRowEditorNumericText
} from '../../../src/lib/utils/row-editor-numeric';

describe('row-editor-numeric', () => {
	it('parses decimal and hex values with limits', () => {
		expect(parseRowEditorNumericText('12', false)).toBe(12);
		expect(parseRowEditorNumericText('A', true)).toBe(10);
		expect(parseRowEditorNumericText('20', false, { max: 15 })).toBe(15);
		expect(parseRowEditorNumericText('', false)).toBeNull();
		expect(parseRowEditorNumericText('-', false)).toBeNull();
	});

	it('parses fractional values when allowDecimal is set', () => {
		expect(parseRowEditorNumericText('48.828', false, { allowDecimal: true })).toBe(48.828);
		expect(parseRowEditorNumericText('48.', false, { allowDecimal: true })).toBe(48);
		expect(parseRowEditorNumericText('.', false, { allowDecimal: true })).toBeNull();
	});

	it('restores the committed value when blur text is empty or invalid', () => {
		const input = { value: '' } as HTMLInputElement;
		expect(commitRowEditorNumericInput(input, 15, false)).toBe(15);
		expect(input.value).toBe('15');

		input.value = '-';
		expect(commitRowEditorNumericInput(input, 7, true)).toBe(7);
		expect(input.value).toBe('7');
	});

	it('commits and formats a valid blur value', () => {
		const input = { value: '0a' } as HTMLInputElement;
		expect(commitRowEditorNumericInput(input, 0, true, { min: 0, max: 15 })).toBe(10);
		expect(input.value).toBe(formatRowEditorNumber(10, true));
	});
});
