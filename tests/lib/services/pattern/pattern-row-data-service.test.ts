import { describe, it, expect, beforeEach } from 'vitest';
import {
	PatternRowDataService,
	patternGenericCacheKey,
	patternRowStringCacheKey
} from '../../../../src/lib/services/pattern/pattern-row-data-service';
import { Pattern } from '../../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../../src/lib/chips/ay/schema';
import { AYConverter } from '../../../../src/lib/chips/ay/adapter';
import { AYFormatter } from '../../../../src/lib/chips/ay/formatter';
import { SAA_CHIP_SCHEMA } from '../../../../src/lib/chips/saa/schema';
import { SAAConverter } from '../../../../src/lib/chips/saa/adapter';
import { SAAFormatter } from '../../../../src/lib/chips/saa/formatter';
import { PatternTemplateParser } from '../../../../src/lib/services/pattern/editing/pattern-template-parsing';
import { Cache } from '../../../../src/lib/utils/memoize';
import type { GenericPattern } from '../../../../src/lib/models/song/generic';

describe('PatternRowDataService', () => {
	let pattern: Pattern;
	let converter: AYConverter;
	let formatter: AYFormatter;
	let patternGenericCache: Cache<string, GenericPattern>;
	let rowStringCache: Cache<string, string>;

	beforeEach(() => {
		pattern = new Pattern(0, 64, AY_CHIP_SCHEMA);
		converter = new AYConverter();
		formatter = new AYFormatter();
		patternGenericCache = new Cache<string, GenericPattern>(100);
		rowStringCache = new Cache<string, string>(500);
	});

	describe('getRowData', () => {
		it('should convert pattern to generic and cache it', () => {
			const rowData = PatternRowDataService.getRowData({
				pattern,
				rowIndex: 0,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			});

			expect(rowData).toBeDefined();
			expect(typeof rowData).toBe('string');
			expect(patternGenericCache.get(patternGenericCacheKey(pattern))).toBeDefined();
		});

		it('should use cached generic pattern on second call', () => {
			const context = {
				pattern,
				rowIndex: 0,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const firstCall = PatternRowDataService.getRowData(context);
			const cachedGeneric = patternGenericCache.get(patternGenericCacheKey(pattern));

			const secondCall = PatternRowDataService.getRowData(context);

			expect(secondCall).toBe(firstCall);
			expect(patternGenericCache.get(patternGenericCacheKey(pattern))).toBe(cachedGeneric);
		});

		it('should cache formatted row strings', () => {
			const context = {
				pattern,
				rowIndex: 5,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const firstCall = PatternRowDataService.getRowData(context);
			const cacheKey = patternRowStringCacheKey(pattern, 5, formatter.virtualChannelMap);

			expect(rowStringCache.get(cacheKey)).toBe(firstCall);
		});

		it('should use cached row string on second call', () => {
			const context = {
				pattern,
				rowIndex: 10,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const firstCall = PatternRowDataService.getRowData(context);
			const secondCall = PatternRowDataService.getRowData(context);

			expect(secondCall).toBe(firstCall);
		});

		it('should handle different row indices', () => {
			const contextRow0 = {
				pattern,
				rowIndex: 0,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const contextRow10 = {
				...contextRow0,
				rowIndex: 10
			};

			const row0Data = PatternRowDataService.getRowData(contextRow0);
			const row10Data = PatternRowDataService.getRowData(contextRow10);

			expect(row0Data).toBeDefined();
			expect(row10Data).toBeDefined();
			expect(
				rowStringCache.get(
					patternRowStringCacheKey(pattern, 0, formatter.virtualChannelMap)
				)
			).toBe(row0Data);
			expect(
				rowStringCache.get(
					patternRowStringCacheKey(pattern, 10, formatter.virtualChannelMap)
				)
			).toBe(row10Data);
		});

		it('should handle different patterns', () => {
			const pattern1 = new Pattern(0, 64, AY_CHIP_SCHEMA);
			const pattern2 = new Pattern(1, 64, AY_CHIP_SCHEMA);

			const context1 = {
				pattern: pattern1,
				rowIndex: 0,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const context2 = {
				...context1,
				pattern: pattern2
			};

			const data1 = PatternRowDataService.getRowData(context1);
			const data2 = PatternRowDataService.getRowData(context2);

			expect(patternGenericCache.get(patternGenericCacheKey(pattern1))).toBeDefined();
			expect(patternGenericCache.get(patternGenericCacheKey(pattern2))).toBeDefined();
			expect(
				rowStringCache.get(
					patternRowStringCacheKey(pattern1, 0, formatter.virtualChannelMap)
				)
			).toBe(data1);
			expect(
				rowStringCache.get(
					patternRowStringCacheKey(pattern2, 0, formatter.virtualChannelMap)
				)
			).toBe(data2);
		});

		it('should format row data correctly', () => {
			const context = {
				pattern,
				rowIndex: 0,
				converter,
				formatter,
				schema: AY_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			const rowData = PatternRowDataService.getRowData(context);

			expect(rowData).toMatch(/^00\s+/);
			expect(rowData.length).toBeGreaterThan(0);
		});

		it('keeps a split channel row aligned when the same pattern id grows', () => {
			const six = new Pattern(9, 1, SAA_CHIP_SCHEMA);
			const seven = new Pattern(9, 1, SAA_CHIP_SCHEMA, [
				'A',
				'B',
				'C',
				'D:1',
				'D:2',
				'E',
				'F'
			]);
			seven.patternRows[0].env1 = 2;
			const saaFormatter = new SAAFormatter();
			const saaConverter = new SAAConverter();
			const context = {
				pattern: six,
				rowIndex: 0,
				converter: saaConverter,
				formatter: saaFormatter,
				schema: SAA_CHIP_SCHEMA,
				patternGenericCache,
				rowStringCache
			};

			PatternRowDataService.getRowData(context);
			saaFormatter.virtualChannelMap = { 3: 2 };
			const split = PatternRowDataService.getRowData({ ...context, pattern: seven });
			const starts: number[] = [];
			let end = 0;
			PatternTemplateParser.walkRow(
				split,
				SAA_CHIP_SCHEMA,
				[1, 1, 1, 1, 1, 1, 1],
				{
					onChannelStart(_index, pos) {
						starts.push(pos);
					},
					onChannelField(_index, _key, field, pos) {
						end = Math.max(end, pos + field.length);
					},
					onGlobalField(_key, field, pos) {
						end = Math.max(end, pos + field.length);
					}
				},
				{ 3: 2 }
			);

			expect(starts).toHaveLength(7);
			for (const pos of starts) {
				expect(split.slice(pos, pos + 3)).toBe('---');
			}
			expect(end).toBe(split.length);
			expect(split.slice(starts[6] - 2, starts[6])).toBe('2 ');
		});
	});

	describe('clearAllCaches', () => {
		it('should clear all provided caches', () => {
			const cellPositionsCache = new Cache<string, unknown>(100);
			const rowSegmentsCache = new Cache<string, unknown>(100);

			rowStringCache.set('test1', 'value1');
			patternGenericCache.set('1', {} as GenericPattern);
			cellPositionsCache.set('test2', { x: 10 });
			rowSegmentsCache.set('test3', []);

			PatternRowDataService.clearAllCaches(
				rowStringCache,
				patternGenericCache,
				cellPositionsCache,
				rowSegmentsCache
			);

			expect(rowStringCache.get('test1')).toBeUndefined();
			expect(patternGenericCache.get('1')).toBeUndefined();
			expect(cellPositionsCache.get('test2')).toBeUndefined();
			expect(rowSegmentsCache.get('test3')).toBeUndefined();
		});

		it('should not throw when caches are already empty', () => {
			const cellPositionsCache = new Cache<string, unknown>(100);
			const rowSegmentsCache = new Cache<string, unknown>(100);

			expect(() => {
				PatternRowDataService.clearAllCaches(
					rowStringCache,
					patternGenericCache,
					cellPositionsCache,
					rowSegmentsCache
				);
			}).not.toThrow();
		});

		it('should clear caches completely', () => {
			const cellPositionsCache = new Cache<string, unknown>(100);
			const rowSegmentsCache = new Cache<string, unknown>(100);

			for (let i = 0; i < 50; i++) {
				rowStringCache.set(`key${i}`, `value${i}`);
				patternGenericCache.set(String(i), {} as GenericPattern);
			}

			PatternRowDataService.clearAllCaches(
				rowStringCache,
				patternGenericCache,
				cellPositionsCache,
				rowSegmentsCache
			);

			for (let i = 0; i < 50; i++) {
				expect(rowStringCache.get(`key${i}`)).toBeUndefined();
				expect(patternGenericCache.get(String(i))).toBeUndefined();
			}
		});
	});
});
