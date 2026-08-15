import type { Pattern } from '../../../models/song';
import { NoteName } from '../../../models/song';
import {
	formatNoteFromEnum,
	noteToTuningTableIndex,
	parseNoteFromString,
	TUNING_TABLE_NOTE_COUNT,
	tuningTableIndexToNote
} from '../../../utils/note-utils';
import { formatHex, formatSymbol } from '../../../chips/base/field-formatters';
import {
	envelopePeriodToNote,
	noteToEnvelopePeriod
} from '../../../utils/envelope-note-conversion';
import type { GenericPattern } from '../../../models/song/generic';
import { MAX_TABLE_ID } from '../../../utils/table-id';
import type { EditingContext, FieldInfo } from './editing-context';
import { EffectField } from './effect-field';
import { PatternEffectHandling } from './pattern-effect-handling';
import { resolveSchemaField } from '../../../chips/base/channel-effect-columns';

export interface GenericFieldUpdate {
	row: number;
	fieldInfo: FieldInfo;
	newValue: string | number | null | Record<string, unknown>;
}

type EffectValue = {
	effect: number;
	delay: number;
	parameter: number;
	tableIndex?: number;
};

const MAX_EFFECT_TABLE_INDEX = MAX_TABLE_ID;

export class PatternValueUpdates {
	static updateFieldValue(
		context: EditingContext,
		fieldInfo: FieldInfo,
		newValue: string | number | null | Record<string, unknown>
	): Pattern {
		const genericPattern = context.converter.toGeneric(context.pattern);
		if (fieldInfo.isGlobal) {
			genericPattern.patternRows[context.selectedRow][fieldInfo.fieldKey] = newValue;
		} else {
			genericPattern.channels[fieldInfo.channelIndex].rows[context.selectedRow][
				fieldInfo.fieldKey
			] = newValue;
		}
		return context.converter.fromGeneric(genericPattern);
	}

	static getFieldValue(
		context: EditingContext,
		fieldInfo: FieldInfo
	): string | number | null | Record<string, unknown> {
		const genericPattern = context.converter.toGeneric(context.pattern);
		return PatternValueUpdates.getValueFromGeneric(
			genericPattern,
			context.selectedRow,
			fieldInfo
		);
	}

	static getValueFromGeneric(
		genericPattern: GenericPattern,
		row: number,
		fieldInfo: FieldInfo
	): string | number | null | Record<string, unknown> {
		if (fieldInfo.isGlobal) {
			const patternRow = genericPattern.patternRows[row];
			return (
				(patternRow[fieldInfo.fieldKey] as
					| string
					| number
					| null
					| Record<string, unknown>) ?? null
			);
		}
		const channel = genericPattern.channels[fieldInfo.channelIndex];
		const rowData = channel.rows[row];
		return (
			(rowData[fieldInfo.fieldKey] as string | number | null | Record<string, unknown>) ??
			null
		);
	}

	static applyUpdatesToGeneric(
		genericPattern: GenericPattern,
		updates: GenericFieldUpdate[]
	): void {
		for (const { row, fieldInfo, newValue } of updates) {
			if (fieldInfo.isGlobal) {
				genericPattern.patternRows[row][fieldInfo.fieldKey] = newValue;
			} else {
				genericPattern.channels[fieldInfo.channelIndex].rows[row][fieldInfo.fieldKey] =
					newValue;
			}
		}
	}

	static getFieldDefinition(
		context: EditingContext,
		fieldKey: string
	): { key: string; type: string; length: number; allowZeroValue?: boolean } | null {
		const field = resolveSchemaField(context.schema, fieldKey);
		return field
			? { key: fieldKey, type: field.type, length: field.length, allowZeroValue: field.allowZeroValue }
			: null;
	}

	static isDisplayedAsEmpty(
		value: string | number | null | undefined,
		fieldType: string,
		length: number,
		allowZeroValue?: boolean
	): boolean {
		if (fieldType === 'hex') {
			return formatHex(value, length, allowZeroValue) === '.'.repeat(length);
		}
		if (fieldType === 'symbol') {
			return formatSymbol(value, length, allowZeroValue) === '.'.repeat(length);
		}
		if (fieldType === 'dec') {
			return value === null || value === undefined;
		}
		return value === null || value === undefined || value === '';
	}

	static incrementNoteValue(currentValue: string, delta: number): string {
		if (currentValue === '---' || currentValue === 'OFF') {
			return currentValue;
		}

		const { noteName, octave } = parseNoteFromString(currentValue);
		if (noteName === NoteName.None) {
			return currentValue;
		}

		const currentIndex = noteToTuningTableIndex(noteName, octave);
		if (currentIndex === null) {
			return currentValue;
		}

		const newIndex = Math.max(
			0,
			Math.min(TUNING_TABLE_NOTE_COUNT - 1, currentIndex + delta)
		);
		const nextNote = tuningTableIndexToNote(newIndex);
		if (!nextNote) {
			return currentValue;
		}

		return formatNoteFromEnum(nextNote.noteName, nextNote.octave);
	}

	static incrementNumericValue(
		currentValue: number,
		delta: number,
		fieldType: string,
		fieldLength?: number,
		allowZeroValue?: boolean
	): number {
		const canDisplayZero =
			(fieldType === 'hex' && allowZeroValue === true) ||
			(fieldType === 'symbol' && allowZeroValue !== false);
		const baseValue = currentValue === -1 && canDisplayZero ? 0 : currentValue;
		let newValue = baseValue + delta;

		switch (fieldType) {
			case 'hex':
				if (fieldLength) {
					const maxValue = Math.pow(16, fieldLength) - 1;
					newValue = Math.max(0, Math.min(maxValue, newValue));
				} else {
					newValue = Math.max(0, Math.min(255, newValue));
				}
				if (newValue === 0 && allowZeroValue) {
					newValue = -1;
				}
				break;
			case 'symbol':
				if (fieldLength) {
					const maxValue = Math.pow(36, fieldLength) - 1;
					newValue = Math.max(0, Math.min(maxValue, newValue));
				} else {
					newValue = Math.max(0, newValue);
				}

				if (newValue === 0) {
					newValue = allowZeroValue === false ? 0 : -1;
				}
				break;
			case 'dec':
				newValue = Math.max(0, newValue);
				break;
		}

		return newValue;
	}

	static incrementEffectParameterValue(
		currentValue: unknown,
		delta: number,
		fieldInfo: FieldInfo
	): EffectValue | null {
		if (!EffectField.isEffectField(fieldInfo.fieldKey)) return null;
		if (fieldInfo.charOffset < 2) return null;
		if (typeof currentValue !== 'object' || currentValue === null) return null;

		const effectValue = currentValue as Partial<EffectValue>;
		if (typeof effectValue.effect !== 'number') return null;
		const effect = effectValue.effect;
		const currentTableIndex = effectValue.tableIndex;
		const hasTableParameter =
			currentTableIndex !== undefined &&
			currentTableIndex >= 0 &&
			effect !== 4 &&
			effect !== 5;
		if (hasTableParameter) {
			const tableIndex = Math.max(
				0,
				Math.min(MAX_EFFECT_TABLE_INDEX, currentTableIndex + delta)
			);
			const delay = PatternEffectHandling.effectIgnoresDelay(effect)
				? 0
				: (effectValue.delay ?? 0);
			return {
				effect,
				delay,
				parameter: effectValue.parameter ?? 0,
				tableIndex
			};
		}

		const parameter = Math.max(0, Math.min(255, (effectValue.parameter ?? 0) + delta));
		const delay = PatternEffectHandling.effectIgnoresDelay(effect)
			? 0
			: (effectValue.delay ?? 0);
		return {
			effect,
			delay,
			parameter,
			...(effectValue.tableIndex === undefined ? {} : { tableIndex: effectValue.tableIndex })
		};
	}

	static computeIncrementValue(
		fieldInfo: FieldInfo,
		currentValue: string | number | null | Record<string, unknown>,
		delta: number,
		isOctaveIncrement: boolean,
		fieldDefinition: { length?: number; allowZeroValue?: boolean } | null,
		tuningTable?: number[],
		envelopeAsNote?: boolean
	): string | number | null | Record<string, unknown> {
		const adjustedDelta =
			fieldInfo.fieldType === 'note' && isOctaveIncrement ? delta * 12 : delta;

		if (fieldInfo.fieldType === 'note') {
			if (currentValue === null || currentValue === undefined || currentValue === '') {
				return null;
			}
			return PatternValueUpdates.incrementNoteValue(
				currentValue as string,
				adjustedDelta
			);
		}

		if (
			fieldInfo.fieldKey === 'envelopeValue' &&
			envelopeAsNote &&
			tuningTable &&
			(currentValue === null || currentValue === undefined || currentValue === '')
		) {
			return null;
		}
		if (
			fieldInfo.fieldKey === 'envelopeValue' &&
			envelopeAsNote &&
			tuningTable
		) {
			const currentPeriod = currentValue as number;
			const noteIndex = envelopePeriodToNote(currentPeriod, tuningTable);
			if (noteIndex === null) return null;
			const semitonesDelta = isOctaveIncrement ? delta * 12 : delta;
			const newNoteIndex = Math.max(
				0,
				Math.min(tuningTable.length - 1, noteIndex + semitonesDelta)
			);
			return noteToEnvelopePeriod(newNoteIndex, tuningTable);
		}

		if (EffectField.isEffectField(fieldInfo.fieldKey)) {
			return PatternValueUpdates.incrementEffectParameterValue(
				currentValue,
				delta,
				fieldInfo
			);
		}

		if (
			(fieldInfo.fieldType === 'hex' ||
				fieldInfo.fieldType === 'dec' ||
				fieldInfo.fieldType === 'symbol') &&
			!EffectField.isEffectField(fieldInfo.fieldKey)
		) {
			if (typeof currentValue === 'object' && currentValue !== null) {
				return null;
			}
			if (
				PatternValueUpdates.isDisplayedAsEmpty(
					currentValue,
					fieldInfo.fieldType,
					fieldDefinition?.length ?? 1,
					fieldDefinition?.allowZeroValue
				)
			) {
				return null;
			}
			return PatternValueUpdates.incrementNumericValue(
				currentValue as number,
				delta,
				fieldInfo.fieldType,
				fieldDefinition?.length,
				fieldDefinition?.allowZeroValue
			);
		}

		return null;
	}
}
