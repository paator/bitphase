import type { Pattern } from '../../models/song';
import type { PatternFormatter } from '../../chips/base/formatter-interface';
import type { PatternConverter } from '../../chips/base/adapter';
import { getPatternEffectColumnCounts } from '../../chips/base/channel-effect-columns';
import type { ChipSchema } from '../../chips/base/schema';
import type { Cache } from '../../utils/memoize';
import type { GenericPattern } from '../../models/song/generic';

export function virtualChannelMapCacheKey(
	virtualChannelMap: Record<number, number> | undefined
): string {
	if (!virtualChannelMap) return '';
	return Object.keys(virtualChannelMap)
		.map((key) => Number(key))
		.sort((a, b) => a - b)
		.map((key) => `${key}:${virtualChannelMap[key]}`)
		.join(',');
}

export function patternGenericCacheKey(pattern: Pattern): string {
	const counts = getPatternEffectColumnCounts(pattern).join(',');
	return `${pattern.id}:${pattern.channels.length}:${counts}`;
}

export function patternRowStringCacheKey(
	pattern: Pattern,
	rowIndex: number,
	virtualChannelMap: Record<number, number> | undefined
): string {
	return `${patternGenericCacheKey(pattern)}:${virtualChannelMapCacheKey(virtualChannelMap)}:${rowIndex}`;
}

export interface RowDataContext {
	pattern: Pattern;
	rowIndex: number;
	converter: PatternConverter;
	formatter: PatternFormatter;
	schema: ChipSchema;
	patternGenericCache: Cache<string, GenericPattern>;
	rowStringCache: Cache<string, string>;
}

export interface GetRowDataOptions {
	debug?: boolean;
}

export class PatternRowDataService {
	static getRowData(context: RowDataContext, options?: GetRowDataOptions): string {
		const genericKey = patternGenericCacheKey(context.pattern);
		let genericPattern = context.patternGenericCache.get(genericKey);
		if (!genericPattern) {
			genericPattern = context.converter.toGeneric(context.pattern);
			context.patternGenericCache.set(genericKey, genericPattern);
		}

		const genericPatternRow = genericPattern.patternRows[context.rowIndex];
		const genericChannels = genericPattern.channels.map((ch) => ch.rows[context.rowIndex]);
		const virtualChannelMap = context.formatter.virtualChannelMap;

		if (options?.debug) {
			return context.formatter.formatRow(
				genericPatternRow,
				genericChannels,
				context.rowIndex,
				context.schema,
				{ debug: true, virtualChannelMap }
			);
		}

		const rowCacheKey = patternRowStringCacheKey(
			context.pattern,
			context.rowIndex,
			virtualChannelMap
		);
		let rowString = context.rowStringCache.get(rowCacheKey);
		if (!rowString) {
			rowString = context.formatter.formatRow(
				genericPatternRow,
				genericChannels,
				context.rowIndex,
				context.schema,
				{ virtualChannelMap }
			);
			context.rowStringCache.set(rowCacheKey, rowString);
		}

		return rowString;
	}

	static clearAllCaches(
		rowStringCache: Cache<string, string>,
		patternGenericCache: Cache<string, GenericPattern>,
		cellPositionsCache: Cache<string, unknown>,
		rowSegmentsCache: Cache<string, unknown>
	): void {
		rowStringCache.clear();
		patternGenericCache.clear();
		cellPositionsCache.clear();
		rowSegmentsCache.clear();
	}
}
