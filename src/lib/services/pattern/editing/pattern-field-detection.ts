import type { FieldSegment } from '../../../ui-rendering/pattern-editor-text-parser';
import type { EditingContext, FieldInfo } from './editing-context';
import { PatternTemplateParser } from './pattern-template-parsing';
import {
	getPatternEffectColumnCounts,
	resolveSchemaField
} from '../../../chips/base/channel-effect-columns';

export class PatternFieldDetection {
	static detectFieldAtCursor(context: EditingContext): FieldInfo | null {
		const { selectedColumn, cellPositions, schema } = context;

		if (selectedColumn < 0 || selectedColumn >= cellPositions.length) {
			return null;
		}

		const cell = cellPositions[selectedColumn];
		if (!cell.fieldKey) {
			return null;
		}

		const field = resolveSchemaField(schema, cell.fieldKey);
		if (!field) {
			return null;
		}

		const isGlobal = !!schema.globalFields?.[cell.fieldKey];
		const genericPattern = context.converter.toGeneric(context.pattern);
		const genericPatternRow = genericPattern.patternRows[context.selectedRow];
		const genericChannels = genericPattern.channels.map((ch) => ch.rows[context.selectedRow]);
		const rowString = context.formatter.formatRow(
			genericPatternRow,
			genericChannels,
			context.selectedRow,
			schema
		);
		const effectColumnCounts = getPatternEffectColumnCounts(context.pattern);

		const channelIndex = isGlobal
			? -1
			: PatternTemplateParser.calculateChannelIndexForField(
					cell.fieldKey,
					cell.charIndex,
					rowString,
					schema,
					effectColumnCounts
				);

		const fieldStart = context.segments
			? this.findFieldStartFromSegments(context.segments, cell.fieldKey, cell.charIndex)
			: PatternTemplateParser.findFieldStartPositionInRowString(
					rowString,
					cell.fieldKey,
					cell.charIndex,
					schema,
					effectColumnCounts
				);
		const charOffset = cell.charIndex - fieldStart;

		return {
			fieldKey: cell.fieldKey,
			fieldType: field.type,
			isGlobal,
			channelIndex,
			charOffset
		};
	}

	private static findFieldStartFromSegments(
		segments: FieldSegment[],
		fieldKey: string,
		charIndex: number
	): number {
		const segment = segments.find(
			(s) => charIndex >= s.start && charIndex < s.end && s.fieldKey === fieldKey
		);
		return segment ? segment.start : charIndex;
	}
}
