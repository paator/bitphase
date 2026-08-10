import { describe, expect, it } from 'vitest';
import { Pattern } from '../../../../../src/lib/models/song';
import { AYConverter } from '../../../../../src/lib/chips/ay/adapter';
import { AYFormatter } from '../../../../../src/lib/chips/ay/formatter';
import { AY_CHIP_SCHEMA } from '../../../../../src/lib/chips/ay/schema';
import { PatternFieldInput } from '../../../../../src/lib/services/pattern/editing/pattern-field-input';
import { PatternValueUpdates } from '../../../../../src/lib/services/pattern/editing/pattern-value-updates';
import type {
	EditingContext,
	FieldInfo
} from '../../../../../src/lib/services/pattern/editing/editing-context';

function createContext(pattern: Pattern): EditingContext {
	return {
		pattern,
		selectedRow: 0,
		selectedColumn: 0,
		cellPositions: [],
		converter: new AYConverter(),
		formatter: new AYFormatter(),
		schema: AY_CHIP_SCHEMA
	};
}

function createFieldInfo(
	fieldKey: string,
	fieldType: string,
	isGlobal = false,
	charOffset = 0
): FieldInfo {
	return {
		fieldKey,
		fieldType,
		isGlobal,
		channelIndex: 0,
		charOffset
	};
}

describe('PatternFieldInput', () => {
	it('returns a non-mutating result when typed hex character matches the current value', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].volume = 0xf;

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('volume', 'hex'),
			'F',
			'KeyF'
		);

		expect(result).toEqual({
			updatedPattern: pattern,
			shouldMoveNext: false,
			didChange: false
		});
	});

	it('returns a non-mutating result when typed envelope shape matches the current value', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].envelopeShape = 0xa;

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('envelopeShape', 'hex'),
			'A',
			'KeyA'
		);

		expect(result).toEqual({
			updatedPattern: pattern,
			shouldMoveNext: false,
			didChange: false
		});
	});

	it('updates hex fields when typed character changes the current value', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].volume = 0xe;

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('volume', 'hex'),
			'F',
			'KeyF'
		);

		expect(result).not.toBeNull();
		expect(result?.updatedPattern.channels[0].rows[0].volume).toBe(0xf);
	});

	it('commits displayed zero for empty noise values', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('noiseValue', 'hex', true),
			'0',
			'Digit0'
		);

		expect(result).not.toBeNull();
		expect(result?.updatedPattern.patternRows[0].noiseValue).toBe(-1);
	});

	it('commits displayed zero for empty table values', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);

		const result = PatternFieldInput.handleSymbolInput(
			createContext(pattern),
			createFieldInfo('table', 'symbol'),
			'0'
		);

		expect(result).not.toBeNull();
		expect(result?.updatedPattern.channels[0].rows[0].table).toBe(-1);
	});

	it('enters table A when typing A on the table field', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);

		const result = PatternFieldInput.handleSymbolInput(
			createContext(pattern),
			createFieldInfo('table', 'symbol'),
			'A'
		);

		expect(result).not.toBeNull();
		expect(result?.updatedPattern.channels[0].rows[0].table).toBe(10);
	});

	it('does not commit zero for empty volume values', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('volume', 'hex'),
			'0',
			'Digit0'
		);

		expect(result).toEqual({
			updatedPattern: pattern,
			shouldMoveNext: false,
			didChange: false
		});
	});

	it('decrements zero-capable fields to their displayed zero value', () => {
		expect(PatternValueUpdates.incrementNumericValue(1, -1, 'hex', 2, true)).toBe(-1);
		expect(PatternValueUpdates.incrementNumericValue(1, -1, 'symbol', 1)).toBe(-1);
		expect(PatternValueUpdates.incrementNumericValue(1, -1, 'hex', 1)).toBe(0);
	});

	it('increments displayed zero values from zero to one', () => {
		expect(PatternValueUpdates.incrementNumericValue(-1, 1, 'hex', 2, true)).toBe(1);
		expect(PatternValueUpdates.incrementNumericValue(-1, 1, 'symbol', 1)).toBe(1);
	});

	it('increments effect parameters', () => {
		const result = PatternValueUpdates.incrementEffectParameterValue(
			{ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x01 },
			1,
			createFieldInfo('envelopeEffect', 'hex', true, 3)
		);

		expect(result).toEqual({ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x02 });
	});

	it('decrements effect parameters', () => {
		const result = PatternValueUpdates.incrementEffectParameterValue(
			{ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x01 },
			-1,
			createFieldInfo('envelopeEffect', 'hex', true, 3)
		);

		expect(result).toEqual({ effect: 'E'.charCodeAt(0), delay: 0xa, parameter: 0x00 });
	});

	it('increments effect table parameters', () => {
		const result = PatternValueUpdates.incrementEffectParameterValue(
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 0, tableIndex: 0 },
			1,
			createFieldInfo('effect', 'hex', false, 3)
		);

		expect(result).toEqual({
			effect: 'S'.charCodeAt(0),
			delay: 0,
			parameter: 0,
			tableIndex: 1
		});
	});

	it('accepts W-Z when typing effect table ids', () => {
		const pattern = new Pattern(0, 1, AY_CHIP_SCHEMA);
		pattern.channels[0].rows[0].effects = [
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 0, tableIndex: 0 }
		];

		const result = PatternFieldInput.handleHexInput(
			createContext(pattern),
			createFieldInfo('effect', 'hex', false, 3),
			'Z',
			'KeyZ'
		);

		expect(result).not.toBeNull();
		expect(result?.updatedPattern.channels[0].rows[0].effects[0]).toEqual(
			expect.objectContaining({
				effect: 'S'.charCodeAt(0),
				tableIndex: 34
			})
		);
	});

	it('clamps effect table id increments at Z', () => {
		const result = PatternValueUpdates.incrementEffectParameterValue(
			{ effect: 'S'.charCodeAt(0), delay: 0, parameter: 0, tableIndex: 34 },
			1,
			createFieldInfo('effect', 'hex', false, 3)
		);

		expect(result).toEqual({
			effect: 'S'.charCodeAt(0),
			delay: 0,
			parameter: 0,
			tableIndex: 34
		});
	});
});
