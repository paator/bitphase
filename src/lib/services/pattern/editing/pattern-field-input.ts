import type { EditingContext, FieldInfo, PatternEditingResult } from './editing-context';
import { PatternValueUpdates } from './pattern-value-updates';
import { StringManipulation } from './string-manipulation';
import { FieldStrategyFactory } from './field-strategies';
import { EffectField } from './effect-field';
import { PatternEnvelopeNoteInput } from './pattern-envelope-note-input';
import { editorStateStore } from '../../../stores/editor-state.svelte';

export class PatternFieldInput {
	static handleHexInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string,
		code: string
	): PatternEditingResult | null {
		if (fieldInfo.fieldKey === 'envelopeValue' && context.tuningTable) {
			const envelopeAsNote = editorStateStore.envelopeAsNote;
			if (envelopeAsNote) {
				const noteInputResult = PatternEnvelopeNoteInput.handleEnvelopeNoteInput(
					context,
					fieldInfo,
					key,
					code
				);
				if (noteInputResult) {
					return noteInputResult;
				}
				return null;
			}
		}

		const upperKey = key.toUpperCase();
		const isEffectField = EffectField.isEffectField(fieldInfo.fieldKey);

		if (isEffectField) {
			if (!/^[0-9A-Z\.]$/i.test(key)) {
				return null;
			}
		} else {
			if (!/^[0-9A-F]$/.test(upperKey)) {
				return null;
			}
		}

		const field = PatternValueUpdates.getFieldDefinition(context, fieldInfo.fieldKey);
		if (!field) return null;

		if (isEffectField) {
			return this.handleEffectFieldInput(context, fieldInfo, upperKey);
		}

		const strategy = FieldStrategyFactory.getStrategy('hex');
		const currentValue = PatternValueUpdates.getFieldValue(context, fieldInfo);
		if (typeof currentValue === 'object' && currentValue !== null) return null;
		const currentStr = strategy.format(currentValue, field.length, field.allowZeroValue);
		const newStr = StringManipulation.replaceCharAtOffset(
			currentStr,
			fieldInfo.charOffset,
			upperKey
		);
		if (newStr === currentStr) {
			if (
				this.shouldCommitDisplayedZero(
					currentValue,
					newStr,
					field.type,
					field.length,
					field.allowZeroValue
				)
			) {
				const newValue = strategy.parse(newStr, field.length, field.allowZeroValue);
				const updatedPattern = PatternValueUpdates.updateFieldValue(
					context,
					fieldInfo,
					newValue
				);
				return { updatedPattern, shouldMoveNext: false };
			}
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };
		}
		const newValue = strategy.parse(newStr, field.length, field.allowZeroValue);

		const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, newValue);
		return { updatedPattern, shouldMoveNext: false };
	}

	static handleDecInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): PatternEditingResult | null {
		if (!/^[0-9]$/.test(key)) {
			return null;
		}

		const field = PatternValueUpdates.getFieldDefinition(context, fieldInfo.fieldKey);
		if (!field) return null;

		const strategy = FieldStrategyFactory.getStrategy('dec');
		const currentValue = PatternValueUpdates.getFieldValue(context, fieldInfo);
		if (typeof currentValue === 'object' && currentValue !== null) return null;
		const currentStr = strategy.format(currentValue, field.length, field.allowZeroValue);
		const newStr = StringManipulation.replaceCharAtOffset(
			currentStr,
			fieldInfo.charOffset,
			key
		);
		if (newStr === currentStr)
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };
		const newValue = strategy.parse(newStr, field.length, field.allowZeroValue);

		const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, newValue);
		return { updatedPattern, shouldMoveNext: false };
	}

	static handleSymbolInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): PatternEditingResult | null {
		const upperKey = key.toUpperCase();
		if (!/^[A-Z0-9]$/i.test(key)) {
			return null;
		}

		const field = PatternValueUpdates.getFieldDefinition(context, fieldInfo.fieldKey);
		if (!field) return null;

		const strategy = FieldStrategyFactory.getStrategy('symbol');
		const currentValue = PatternValueUpdates.getFieldValue(context, fieldInfo);
		if (typeof currentValue === 'object' && currentValue !== null) return null;
		const currentStr = strategy.format(currentValue, field.length, field.allowZeroValue);
		const newStr = StringManipulation.replaceCharAtOffset(
			currentStr,
			fieldInfo.charOffset,
			upperKey
		);
		if (newStr === currentStr) {
			if (
				this.shouldCommitDisplayedZero(
					currentValue,
					newStr,
					field.type,
					field.length,
					field.allowZeroValue
				)
			) {
				const newValue = strategy.parse(newStr, field.length, field.allowZeroValue);
				const updatedPattern = PatternValueUpdates.updateFieldValue(
					context,
					fieldInfo,
					newValue
				);
				return { updatedPattern, shouldMoveNext: false };
			}
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };
		}
		const newValue = strategy.parse(newStr, field.length, field.allowZeroValue);

		const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, newValue);
		return { updatedPattern, shouldMoveNext: false };
	}

	static handleTextInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): PatternEditingResult | null {
		if (key.length !== 1) {
			return null;
		}

		const field = PatternValueUpdates.getFieldDefinition(context, fieldInfo.fieldKey);
		if (!field) return null;

		const currentValue = PatternValueUpdates.getFieldValue(context, fieldInfo);
		const currentStr =
			typeof currentValue === 'number' ? currentValue.toString() : String(currentValue);
		const newStr = StringManipulation.replaceCharAtOffset(
			currentStr,
			fieldInfo.charOffset,
			key
		);
		if (newStr === currentStr)
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };

		const updatedPattern = PatternValueUpdates.updateFieldValue(context, fieldInfo, newStr);
		return { updatedPattern, shouldMoveNext: false };
	}

	private static handleEffectFieldInput(
		context: EditingContext,
		fieldInfo: FieldInfo,
		key: string
	): PatternEditingResult | null {
		const currentValue = PatternValueUpdates.getFieldValue(context, fieldInfo);
		let currentStr = EffectField.formatValue(currentValue);
		if (currentStr === null) {
			currentStr = '...';
		}
		const newStr = StringManipulation.replaceCharAtOffset(
			currentStr,
			fieldInfo.charOffset,
			key
		);
		if (newStr === currentStr)
			return { updatedPattern: context.pattern, shouldMoveNext: false, didChange: false };
		const newEffectObj = EffectField.parseValue(newStr);

		const updatedPattern = PatternValueUpdates.updateFieldValue(
			context,
			fieldInfo,
			newEffectObj
		);
		return { updatedPattern, shouldMoveNext: false };
	}

	private static shouldCommitDisplayedZero(
		currentValue: string | number | null,
		newStr: string,
		fieldType: string,
		fieldLength: number,
		allowZeroValue?: boolean
	): boolean {
		if (!/^0+$/.test(newStr)) return false;
		if (fieldType === 'hex' && !allowZeroValue) return false;
		if (fieldType === 'symbol' && allowZeroValue === false) return false;
		if (fieldType !== 'hex' && fieldType !== 'symbol') return false;
		return PatternValueUpdates.isDisplayedAsEmpty(
			currentValue,
			fieldType,
			fieldLength,
			allowZeroValue
		);
	}
}
