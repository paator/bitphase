import type { PatternFormatter, FormatRowOptions } from './formatter-interface';
import type { ChipSchema, ChipField } from './schema';
import type { GenericRow, GenericPatternRow } from '../../models/song/generic';
import { formatHex, formatSymbol, parseHex, parseSymbol } from './field-formatters';
import { NoteName } from '../../models/song';
import { formatNoteFromEnum } from '../../utils/note-utils';
import { EffectField } from '../../services/pattern/editing/effect-field';
import { isPrimitive } from '../../utils/type-guards';
import {
	getChannelLayout,
	getEffectColumnCountFromGenericRow,
	resolveSchemaField
} from './channel-effect-columns';

export abstract class BaseFormatter implements PatternFormatter {
	decimalRowNumbers?: boolean;
	protected _debugFormat = false;

	formatRow(
		patternRow: GenericPatternRow,
		channels: GenericRow[],
		rowIndex: number,
		schema: ChipSchema,
		options?: FormatRowOptions
	): string {
		this._debugFormat = options?.debug ?? false;
		try {
			let result = this.getRowNumber(rowIndex) + ' ';

			if (schema.globalTemplate && schema.globalFields) {
				result +=
					this.formatTemplate(schema.globalTemplate, patternRow, schema.globalFields) + ' ';
			}

			for (const channel of channels) {
				const layout = getChannelLayout(
					schema,
					getEffectColumnCountFromGenericRow(channel)
				);
				result += this.formatTemplate(layout.template, channel, layout.fields) + ' ';
			}

			return result.trim();
		} finally {
			this._debugFormat = false;
		}
	}

	parseRow(
		rowString: string,
		schema: ChipSchema
	): {
		patternRow: GenericPatternRow;
		channels: GenericRow[];
	} {
		const patternRow: GenericPatternRow = {};
		const channels: GenericRow[] = [];

		const parts = rowString.split(/\s+/);
		let partIndex = 1;

		if (schema.globalTemplate && schema.globalFields) {
			const spaceCount = (schema.globalTemplate.match(/\s/g) || []).length;
			const globalParts: string[] = [];
			for (let i = 0; i <= spaceCount && partIndex < parts.length; i++) {
				globalParts.push(parts[partIndex] || '');
				partIndex++;
			}
			const globalString = globalParts.join(' ');
			const globalMatch = this.parseTemplate(
				globalString,
				schema.globalTemplate,
				schema.globalFields
			);
			Object.assign(patternRow, globalMatch);
		}

		const spaceCount = (schema.template.match(/\s/g) || []).length;
		while (partIndex < parts.length) {
			const channelParts: string[] = [];
			for (let i = 0; i <= spaceCount && partIndex < parts.length; i++) {
				channelParts.push(parts[partIndex] || '');
				partIndex++;
			}
			const channelString = channelParts.join(' ');
			if (channelString) {
				const channelMatch = this.parseTemplate(
					channelString,
					schema.template,
					schema.fields
				);
				channels.push(channelMatch);
			}
		}

		return { patternRow, channels };
	}

	protected formatTemplate(
		template: string,
		data: GenericRow | GenericPatternRow,
		fields: Record<string, ChipField>
	): string {
		if (!data) return '';
		let result = '';
		let i = 0;

		while (i < template.length) {
			if (template[i] === '{') {
				const end = template.indexOf('}', i);
				if (end !== -1) {
					const key = template.substring(i + 1, end);
					const field = fields[key];
					if (field) {
						const value = data[key];
						if (EffectField.isEffectField(key)) {
							const effectFormatted = EffectField.formatValue(value);
							result +=
								effectFormatted !== null
									? effectFormatted
									: this.formatField(isPrimitive(value) ? value : null, field);
						} else {
							result += this.formatField(isPrimitive(value) ? value : null, field);
						}
					}
					i = end + 1;
				} else {
					result += template[i];
					i++;
				}
			} else {
				result += template[i];
				i++;
			}
		}

		return result;
	}

	protected parseTemplate(
		input: string,
		template: string,
		fields: Record<string, ChipField>
	): GenericRow {
		const result: GenericRow = {};

		const fieldKeys: string[] = [];
		const regexParts: string[] = [];
		let lastWasField = false;

		for (let i = 0; i < template.length; i++) {
			if (template[i] === '{') {
				const end = template.indexOf('}', i);
				if (end !== -1) {
					const key = template.substring(i + 1, end);
					const field = fields[key];
					if (field) {
						fieldKeys.push(key);
						regexParts.push(`(.{${field.length}})`);
						lastWasField = true;
					}
					i = end;
				}
			} else if (template[i] === ' ') {
				if (lastWasField) {
					regexParts.push('\\s*');
					lastWasField = false;
				}
			} else {
				lastWasField = false;
			}
		}

		const regex = new RegExp('^' + regexParts.join('') + '$');
		const match = input.replace(/\s+/g, ' ').trim().match(regex);

		if (match) {
			fieldKeys.forEach((key, i) => {
				const field = fields[key];
				if (field) {
					if (EffectField.isEffectField(key)) {
						result[key] = EffectField.parseValue(match[i + 1]) as unknown as
							| string
							| number
							| null
							| undefined;
					} else {
						result[key] = this.parseField(match[i + 1], field);
					}
				}
			});
		}

		return result;
	}

	protected formatField(
		value: number | string | null | undefined,
		field: { type: string; length: number; allowZeroValue?: boolean }
	): string {
		if (this._debugFormat) {
			if (value === undefined) return 'undefined';
			if (value === null) return 'null';
			switch (field.type) {
				case 'hex':
					return (typeof value === 'number' ? value : parseInt(String(value), 16) || 0)
						.toString(16)
						.toUpperCase()
						.padStart(field.length, '0');
				case 'symbol': {
					const num =
						typeof value === 'number'
							? value
							: typeof value === 'string'
								? parseInt(value, 36)
								: 0;
					return num.toString(36).toUpperCase().padStart(field.length, '0');
				}
				case 'note':
					return this.formatNote(value, field);
				default:
					return String(value);
			}
		}

		if (
			typeof value === 'string' &&
			value !== '' &&
			isNaN(Number(value)) &&
			field.type !== 'note'
		) {
			return '.'.repeat(field.length);
		}

		switch (field.type) {
			case 'hex':
				return formatHex(value, field.length, field.allowZeroValue);
			case 'symbol':
				return formatSymbol(value, field.length, field.allowZeroValue);
			case 'note':
				return this.formatNote(value, field);
			default:
				return String(value || '').padStart(field.length, '.');
		}
	}

	protected parseField(
		value: string,
		field: { type: string; length: number; allowZeroValue?: boolean }
	): number | string | null {
		if (value === '.'.repeat(field.length)) return null;
		switch (field.type) {
			case 'hex':
				return parseHex(value, field.length, field.allowZeroValue);
			case 'symbol':
				return parseSymbol(value, field.length, field.allowZeroValue);
			case 'note':
				return value;
			default:
				return parseInt(value, 10) || 0;
		}
	}

	protected formatNote(
		value: number | string | null | undefined | { name: number; octave: number },
		field: { type: string; length: number }
	): string {
		if (typeof value === 'string') {
			return value.length === field.length ? value : value.padEnd(field.length, ' ');
		}
		const formatted = this.formatNoteValue(value);
		return formatted.length === field.length ? formatted : formatted.padEnd(field.length, ' ');
	}

	protected formatNoteValue(
		value: number | null | undefined | { name: number; octave: number }
	): string {
		if (typeof value === 'object' && value !== null && 'name' in value && 'octave' in value) {
			return this.formatNoteFromEnum(value.name, value.octave);
		}
		return String(value || '---');
	}

	protected formatNoteFromEnum(noteName: NoteName, octave: number): string {
		return formatNoteFromEnum(noteName, octave);
	}

	protected getRowNumber(rowIndex: number): string {
		if (this.decimalRowNumbers) {
			return rowIndex.toString(10).padStart(3, '0');
		}
		return rowIndex.toString(16).toUpperCase().padStart(2, '0');
	}

	getColorForField(fieldKey: string, schema: ChipSchema): string {
		const field = resolveSchemaField(schema, fieldKey);
		if (field?.color) {
			return field.color;
		}
		return 'patternText';
	}
}
