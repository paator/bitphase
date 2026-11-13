import type { Chip } from '../../../chips/types';
import {
	getChannelLayout,
	MIN_CHANNEL_EFFECT_COLUMNS
} from '../../../chips/base/channel-effect-columns';
import { anchorsBeforeChannel, usesAnchoredGlobals } from '../../../chips/base/global-anchors';

export interface RowWalkHandlers {
	onGlobalField?: (key: string, field: { length: number }, pos: number) => void;
	onChannelStart?: (channelIndex: number, pos: number) => void;
	onChannelField?: (
		channelIndex: number,
		key: string,
		field: { length: number },
		pos: number
	) => void;
}

export class PatternTemplateParser {
	static skipSpaces(rowString: string, pos: number): number {
		let currentPos = pos;
		while (currentPos < rowString.length && rowString[currentPos] === ' ') {
			currentPos++;
		}
		return currentPos;
	}

	static skipRowNumber(rowString: string, pos: number): number {
		let currentPos = this.skipSpaces(rowString, pos);
		while (currentPos < rowString.length && rowString[currentPos] !== ' ') {
			currentPos++;
		}
		return this.skipSpaces(rowString, currentPos);
	}

	static parseTemplate(
		template: string,
		fields: Record<string, { length: number }>,
		callback: (key: string, field: { length: number }, isSpace: boolean) => void
	): void {
		let templatePos = 0;
		while (templatePos < template.length) {
			if (template[templatePos] === '{') {
				const end = template.indexOf('}', templatePos);
				if (end !== -1) {
					const key = template.substring(templatePos + 1, end);
					const field = fields[key];
					if (field) {
						callback(key, field, false);
					}
					templatePos = end + 1;
				} else {
					templatePos++;
				}
			} else if (template[templatePos] === ' ') {
				callback('', { length: 0 }, true);
				templatePos++;
			} else {
				templatePos++;
			}
		}
	}

	static parseGlobalTemplate(
		rowString: string,
		startPos: number,
		schema: Chip['schema'],
		callback?: (key: string, field: { length: number }, pos: number) => number
	): number {
		let pos = startPos;
		if (!schema.globalTemplate || !schema.globalFields) {
			return pos;
		}

		this.parseTemplate(schema.globalTemplate, schema.globalFields, (key, field, isSpace) => {
			if (isSpace) {
				pos++;
			} else if (callback) {
				pos = callback(key, field, pos);
			} else {
				pos += field.length;
			}
		});

		return this.skipSpaces(rowString, pos);
	}

	static walkRow(
		rowString: string,
		schema: Chip['schema'],
		effectColumnCounts: number[] | undefined,
		handlers: RowWalkHandlers,
		virtualChannelMap?: Record<number, number>
	): void {
		let pos = this.skipRowNumber(rowString, 0);
		const anchored = usesAnchoredGlobals(schema);
		if (!anchored) {
			pos = this.parseGlobalTemplate(rowString, pos, schema, (key, field, currentPos) => {
				handlers.onGlobalField?.(key, field, currentPos);
				return currentPos + field.length;
			});
		}

		const counts = effectColumnCounts ?? [];
		let channelIndex = 0;
		while (pos < rowString.length) {
			if (counts.length > 0 && channelIndex >= counts.length) break;

			if (anchored) {
				for (const anchor of anchorsBeforeChannel(schema, channelIndex, virtualChannelMap)) {
					pos = this.skipSpaces(rowString, pos);
					if (pos >= rowString.length) return;
					handlers.onGlobalField?.(anchor.field, anchor.definition, pos);
					pos += anchor.definition.length;
				}
			}

			pos = this.skipSpaces(rowString, pos);
			if (pos >= rowString.length) break;

			const layout = getChannelLayout(
				schema,
				counts[channelIndex] ?? MIN_CHANNEL_EFFECT_COLUMNS
			);
			const channelStart = pos;
			let consumedField = false;
			this.parseTemplate(layout.template, layout.fields, (key, field, isSpace) => {
				if (isSpace) {
					if (pos < rowString.length && rowString[pos] === ' ') {
						pos++;
					}
				} else {
					if (!consumedField) {
						handlers.onChannelStart?.(channelIndex, channelStart);
						consumedField = true;
					}
					handlers.onChannelField?.(channelIndex, key, field, pos);
					pos += field.length;
				}
			});

			if (!consumedField || pos === channelStart) break;
			channelIndex++;
		}
	}

	static calculateChannelIndexForField(
		fieldKey: string,
		charIndex: number,
		rowString: string,
		schema: Chip['schema'],
		effectColumnCounts?: number[],
		virtualChannelMap?: Record<number, number>
	): number {
		let channelIndex = 0;
		this.walkRow(
			rowString,
			schema,
			effectColumnCounts,
			{
				onChannelField(index, _key, _field, pos) {
					if (pos <= charIndex) channelIndex = index;
				}
			},
			virtualChannelMap
		);
		return channelIndex;
	}

	static findFieldStartPositionInRowString(
		rowString: string,
		fieldKey: string,
		charIndex: number,
		schema: Chip['schema'],
		effectColumnCounts?: number[],
		virtualChannelMap?: Record<number, number>
	): number {
		const segments: Array<{ start: number; end: number; fieldKey: string }> = [];
		this.walkRow(rowString, schema, effectColumnCounts, {
			onGlobalField(key, field, pos) {
				segments.push({ start: pos, end: pos + field.length, fieldKey: key });
			},
			onChannelField(_channelIndex, key, field, pos) {
				segments.push({ start: pos, end: pos + field.length, fieldKey: key });
			}
		}, virtualChannelMap);

		const segment = segments.find(
			(s) => charIndex >= s.start && charIndex < s.end && s.fieldKey === fieldKey
		);
		return segment ? segment.start : charIndex;
	}
}
