import type { Chip } from '../chips/types';
import type { PatternFormatter } from '../chips/base/formatter-interface';
import type { getColors } from '../utils/colors';
import { Cache } from '../utils/memoize';
import { PatternTemplateParser } from '../services/pattern/editing/pattern-template-parsing';
import {
	getChannelLayout,
	MIN_CHANNEL_EFFECT_COLUMNS,
	resolveSchemaField
} from '../chips/base/channel-effect-columns';

export interface FieldSegment {
	start: number;
	end: number;
	fieldKey: string;
	color: string;
}

export interface CellPosition {
	x: number;
	width: number;
	charIndex: number;
	fieldKey?: string;
}

export class PatternEditorTextParser {
	private schema: Chip['schema'];
	private formatter: PatternFormatter;
	private colors: ReturnType<typeof getColors>;
	private ctx: CanvasRenderingContext2D;
	private rowSegmentsCache: Cache<string, FieldSegment[]>;
	private cellPositionsCache: Cache<string, CellPosition[]>;
	private effectColumnCounts: number[] = [];

	constructor(
		schema: Chip['schema'],
		formatter: PatternFormatter,
		colors: ReturnType<typeof getColors>,
		ctx: CanvasRenderingContext2D,
		rowSegmentsCache: Cache<string, FieldSegment[]>,
		cellPositionsCache: Cache<string, CellPosition[]>
	) {
		this.schema = schema;
		this.formatter = formatter;
		this.colors = colors;
		this.ctx = ctx;
		this.rowSegmentsCache = rowSegmentsCache;
		this.cellPositionsCache = cellPositionsCache;
	}

	setChannelEffectColumnCounts(counts: number[]): void {
		this.effectColumnCounts = counts;
	}

	parseRowString(rowString: string, rowIndex: number): FieldSegment[] {
		const cacheKey = `${rowString}:${rowIndex}:${this.effectColumnCounts.join(',')}`;
		const cached = this.rowSegmentsCache.get(cacheKey);
		if (cached) return cached;

		const segments: FieldSegment[] = [];
		let pos = 0;

		const skipSpaces = () => {
			while (pos < rowString.length && rowString[pos] === ' ') {
				pos++;
			}
		};

		skipSpaces();
		const rowNumStart = pos;
		while (pos < rowString.length && rowString[pos] !== ' ') {
			pos++;
		}
		if (rowNumStart < pos) {
			const isAlternate = rowIndex % 4 === 0;
			const colorKey = isAlternate ? 'patternRowNumAlternate' : 'patternRowNum';
			segments.push({
				start: rowNumStart,
				end: pos,
				fieldKey: 'rowNum',
				color: this.colors[colorKey as keyof typeof this.colors] || this.colors.patternText
			});
		}
		skipSpaces();

		if (this.schema.globalTemplate && this.schema.globalFields) {
			PatternTemplateParser.parseTemplate(
				this.schema.globalTemplate,
				this.schema.globalFields,
				(key, field, isSpace) => {
					if (isSpace) {
						pos++;
					} else {
						const colorKey = this.formatter.getColorForField(key, this.schema);
						const color =
							this.colors[colorKey as keyof typeof this.colors] ||
							this.colors.patternText;
						segments.push({
							start: pos,
							end: pos + field.length,
							fieldKey: key,
							color
						});
						pos += field.length;
					}
				}
			);
			skipSpaces();
		}

		const counts = this.effectColumnCounts;
		let channelIndex = 0;
		while (pos < rowString.length) {
			skipSpaces();
			if (pos >= rowString.length) break;
			if (counts.length > 0 && channelIndex >= counts.length) break;

			const layout = getChannelLayout(
				this.schema,
				counts[channelIndex] ?? MIN_CHANNEL_EFFECT_COLUMNS
			);
			const channelStart = pos;
			let foundField = false;

			PatternTemplateParser.parseTemplate(
				layout.template,
				layout.fields,
				(key, field, isSpace) => {
					if (isSpace) {
						if (pos < rowString.length && rowString[pos] === ' ') {
							pos++;
						}
					} else {
						const colorKey = this.formatter.getColorForField(key, this.schema);
						const color =
							this.colors[colorKey as keyof typeof this.colors] ||
							this.colors.patternText;
						segments.push({
							start: pos,
							end: pos + field.length,
							fieldKey: key,
							color
						});
						pos += field.length;
						foundField = true;
					}
				}
			);

			if (!foundField || pos === channelStart) break;
			channelIndex++;
		}
		this.rowSegmentsCache.set(cacheKey, segments);
		return segments;
	}

	getCellPositions(rowString: string, rowIndex: number): CellPosition[] {
		const fontInfo = this.ctx.font;
		const cacheKey = `${rowString}:${rowIndex}:${fontInfo}:${this.effectColumnCounts.join(',')}`;
		const cached = this.cellPositionsCache.get(cacheKey);
		if (cached) return cached;

		const positions: CellPosition[] = [];
		const segments = this.parseRowString(rowString, rowIndex);
		let x = 10;
		let i = 0;

		while (i < rowString.length) {
			const char = rowString[i];
			if (char === ' ') {
				x += this.ctx.measureText(' ').width;
				i++;
				continue;
			}

			const segment = segments.find((s) => i >= s.start && i < s.end);

			if (!segment) {
				const width = this.ctx.measureText(char).width;
				x += width;
				i++;
				continue;
			}

			const field = resolveSchemaField(this.schema, segment.fieldKey);

			if (segment.fieldKey === 'rowNum' || field?.skip) {
				const skipText = rowString.substring(segment.start, segment.end);
				x += this.ctx.measureText(skipText).width;
				i = segment.end;
				continue;
			}

			const isEnvelopeAsNote =
				segment.fieldKey === 'envelopeValue' &&
				(this.formatter as { envelopeAsNote?: boolean }).envelopeAsNote;
			const isAtomic = field?.selectable === 'atomic' || isEnvelopeAsNote;

			if (isAtomic && i === segment.start) {
				const fieldText = rowString.substring(segment.start, segment.end);
				const width = this.ctx.measureText(fieldText).width;
				positions.push({
					x,
					width,
					charIndex: segment.start,
					fieldKey: segment.fieldKey
				});
				x += width;
				i = segment.end;
			} else if (isAtomic && i > segment.start) {
				const width = this.ctx.measureText(char).width;
				x += width;
				i++;
			} else if (!isAtomic) {
				const width = this.ctx.measureText(char).width;
				positions.push({ x, width, charIndex: i, fieldKey: segment.fieldKey });
				x += width;
				i++;
			} else {
				const width = this.ctx.measureText(char).width;
				x += width;
				i++;
			}
		}

		this.cellPositionsCache.set(cacheKey, positions);
		return positions;
	}
}
