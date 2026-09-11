import { Pattern, Note, Effect, NoteName, DEFAULT_PATTERN_LENGTH, Row } from '../../models/song';
import { isEffectLike, toNumber } from '../../utils/type-guards';
import type { ChipSchema } from '../../chips/base/schema';
import { PatternEffectHandling } from './editing/pattern-effect-handling';
import {
	applySharedEffectColumnCounts,
	clampChannelEffectColumnCount,
	getSharedEffectColumnCounts,
	padEffectsArray,
	resolveChannelEffectColumnCount
} from '../../chips/base/channel-effect-columns';
import { HistoryClone } from '../history/history-clone';

export const MIN_PATTERN_ID = 0;
export const MAX_PATTERN_ID = 99;

export class PatternService {
	/**
	 * Find the next available pattern ID
	 */
	static findNextAvailablePatternId(
		patterns: Record<number, Pattern>,
		patternOrder: number[]
	): number | null {
		return this.findFirstFreePatternId(
			this.collectAllocatedPatternIds(Object.values(patterns), patternOrder)
		);
	}

	static isPatternEmpty(pattern: Pattern): boolean {
		for (const channel of pattern.channels) {
			for (const row of channel.rows) {
				if (!this.isChannelRowEmpty(row)) return false;
			}
		}
		for (const patternRow of pattern.patternRows) {
			if (!this.isDataRecordEmpty(patternRow)) return false;
		}
		return true;
	}

	/**
	 * Create a new empty pattern
	 */
	static createEmptyPattern(
		id: number,
		schema?: ChipSchema,
		effectiveChannelLabels?: string[],
		length: number = DEFAULT_PATTERN_LENGTH,
		sourcePatterns?: Pattern[]
	): Pattern {
		const pattern = new Pattern(id, length, schema, effectiveChannelLabels);
		this.applySongEffectLayout(pattern, sourcePatterns);
		return pattern;
	}

	/**
	 * Create a deep copy of a pattern with a new ID
	 */
	static clonePattern(
		sourcePattern: Pattern,
		newId: number,
		schema?: ChipSchema,
		sourcePatterns?: Pattern[]
	): Pattern {
		const channelLabels = sourcePattern.channels.map((c) => c.label);
		const clonedPattern = new Pattern(newId, sourcePattern.length, schema, channelLabels);

		sourcePattern.channels.forEach((channel, channelIndex) => {
			clonedPattern.channels[channelIndex].effectColumnCount =
				resolveChannelEffectColumnCount(channel);
			channel.rows.forEach((row, rowIndex) => {
				const newRow = clonedPattern.channels[channelIndex].rows[rowIndex];
				newRow.note = new Note(row.note.name, row.note.octave);
				newRow.effects = padEffectsArray(
					row.effects.map((effect) =>
						effect && !PatternEffectHandling.isEmptyEffect(effect)
							? new Effect(effect.effect, effect.delay, effect.parameter, effect.tableIndex)
							: null
					),
					clonedPattern.channels[channelIndex].effectColumnCount
				);
				this.copyRowFields(row, newRow);
			});
		});

		sourcePattern.patternRows.forEach((patternRow, index) => {
			const newPatternRow = clonedPattern.patternRows[index];
			this.copyPatternRowFields(patternRow, newPatternRow);
		});

		this.applySongEffectLayout(
			clonedPattern,
			sourcePatterns?.length ? sourcePatterns : [sourcePattern]
		);
		return clonedPattern;
	}

	private static applySongEffectLayout(pattern: Pattern, sourcePatterns?: Pattern[]): void {
		if (!sourcePatterns?.length) return;
		applySharedEffectColumnCounts(pattern, getSharedEffectColumnCounts(sourcePatterns));
	}

	static copyChannelEffectColumnLayout(source: Pattern, target: Pattern): void {
		const channelCount = Math.min(source.channels.length, target.channels.length);
		for (let index = 0; index < channelCount; index++) {
			const count = resolveChannelEffectColumnCount(source.channels[index]);
			target.channels[index].effectColumnCount = count;
			for (const row of target.channels[index].rows) {
				row.effects = padEffectsArray(row.effects, count);
			}
		}
	}

	static setChannelEffectColumnCount(
		patterns: Pattern[],
		channelIndex: number,
		nextCount: number
	): Pattern[] {
		const count = clampChannelEffectColumnCount(nextCount);
		return patterns.map((pattern) => {
			const cloned = HistoryClone.pattern(pattern);
			const channel = cloned.channels[channelIndex];
			if (!channel) {
				return cloned;
			}
			channel.effectColumnCount = count;
			for (const row of channel.rows) {
				row.effects = padEffectsArray(row.effects, count);
			}
			return cloned;
		});
	}

	private static copyRowFields(source: Record<string, unknown>, target: Record<string, unknown>): void {
		for (const key of Object.keys(source)) {
			if (key === 'note' || key === 'effects') continue;
			const value = source[key];
			if (isEffectLike(value)) {
				target[key] =
					PatternEffectHandling.isEmptyEffect(value)
						? null
						: new Effect(value.effect, value.delay, value.parameter, value.tableIndex);
			} else if (typeof value === 'object' && value !== null) {
				target[key] = JSON.parse(JSON.stringify(value));
			} else {
				target[key] = value;
			}
		}
	}

	private static copyPatternRowFields(source: Record<string, unknown>, target: Record<string, unknown>): void {
		for (const key of Object.keys(source)) {
			const value = source[key];
			if (isEffectLike(value)) {
				target[key] =
					PatternEffectHandling.isEmptyEffect(value)
						? null
						: new Effect(value.effect, value.delay, value.parameter, value.tableIndex);
			} else if (typeof value === 'object' && value !== null) {
				target[key] = JSON.parse(JSON.stringify(value));
			} else {
				target[key] = value;
			}
		}
	}

	/**
	 * Add a new empty pattern after the specified index
	 */
	static addPatternAfter(
		patterns: Record<number, Pattern>,
		patternOrder: number[],
		index: number,
		schema?: ChipSchema,
		length: number = DEFAULT_PATTERN_LENGTH
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} | null {
		const newPatternId = this.findNextAvailablePatternId(patterns, patternOrder);
		if (newPatternId === null) return null;

		const newPattern = this.createEmptyPattern(
			newPatternId,
			schema,
			undefined,
			length,
			Object.values(patterns)
		);

		const newPatterns = { ...patterns, [newPatternId]: newPattern };
		const newPatternOrder = [...patternOrder];
		const insertIndex = index + 1;

		newPatternOrder.splice(insertIndex, 0, newPatternId);

		return {
			newPatterns,
			newPatternOrder,
			newPatternId,
			insertIndex
		};
	}

	/**
	 * Add a new empty pattern after the specified index, creating one pattern per song with each song's schema
	 */
	static addPatternAfterMultiChip(
		allPatterns: Pattern[][],
		patternOrder: number[],
		index: number,
		getSchema: (songIndex: number) => ChipSchema | undefined,
		getEffectiveLabels?: (songIndex: number) => string[] | undefined,
		length: number = DEFAULT_PATTERN_LENGTH
	): {
		newPatternsPerSong: Pattern[][];
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} | null {
		const newPatternId = this.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder);
		if (newPatternId === null) return null;

		const insertIndex = index + 1;
		const newPatternOrder = [...patternOrder];
		newPatternOrder.splice(insertIndex, 0, newPatternId);

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const newPattern = this.createEmptyPattern(
				newPatternId,
				getSchema(songIndex),
				getEffectiveLabels?.(songIndex),
				length,
				songPatterns
			);
			return this.replaceOrAppendPattern(songPatterns, newPattern);
		});

		return {
			newPatternsPerSong,
			newPatternOrder,
			newPatternId,
			insertIndex
		};
	}

	/**
	 * Remove a pattern at the specified index
	 */
	static removePatternAt(
		patternOrder: number[],
		index: number
	): {
		newPatternOrder: number[];
		adjustedCurrentIndex: number;
	} {
		if (patternOrder.length <= 1) {
			return {
				newPatternOrder: patternOrder,
				adjustedCurrentIndex: index
			};
		}

		const newPatternOrder = [...patternOrder];
		newPatternOrder.splice(index, 1);

		// Calculate adjusted current index
		let adjustedCurrentIndex = index;
		if (adjustedCurrentIndex >= newPatternOrder.length) {
			adjustedCurrentIndex = newPatternOrder.length - 1;
		}

		return {
			newPatternOrder,
			adjustedCurrentIndex
		};
	}

	/**
	 * Clone a pattern and insert it after the specified index
	 */
	static clonePatternAfter(
		patterns: Record<number, Pattern>,
		patternOrder: number[],
		index: number,
		targetPattern: Pattern,
		schema?: ChipSchema
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} | null {
		if (!targetPattern) return null;

		const newPatternId = this.findNextAvailablePatternId(patterns, patternOrder);
		if (newPatternId === null) return null;

		const clonedPattern = this.clonePattern(
			targetPattern,
			newPatternId,
			schema,
			Object.values(patterns)
		);

		const newPatterns = { ...patterns, [newPatternId]: clonedPattern };
		const newPatternOrder = [...patternOrder];
		const insertIndex = index + 1;

		newPatternOrder.splice(insertIndex, 0, newPatternId);

		return {
			newPatterns,
			newPatternOrder,
			newPatternId,
			insertIndex
		};
	}

	/**
	 * Clone a pattern and insert it after the specified index, creating one clone per song with each song's schema
	 */
	static clonePatternAfterMultiChip(
		allPatterns: Pattern[][],
		patternOrder: number[],
		index: number,
		getSchema: (songIndex: number) => ChipSchema | undefined
	): {
		newPatternsPerSong: Pattern[][];
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} | null {
		const targetPatternId = patternOrder[index];
		const newPatternId = this.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder);
		if (newPatternId === null) return null;

		const insertIndex = index + 1;
		const newPatternOrder = [...patternOrder];
		newPatternOrder.splice(insertIndex, 0, newPatternId);

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const sourcePattern = songPatterns.find((p) => p.id === targetPatternId);
			if (sourcePattern) {
				const clonedPattern = this.clonePattern(
					sourcePattern,
					newPatternId,
					getSchema(songIndex),
					songPatterns
				);
				return this.replaceOrAppendPattern(songPatterns, clonedPattern);
			}

			const emptyPattern = this.createEmptyPattern(
				newPatternId,
				getSchema(songIndex),
				undefined,
				DEFAULT_PATTERN_LENGTH,
				songPatterns
			);
			return this.replaceOrAppendPattern(songPatterns, emptyPattern);
		});

		return {
			newPatternsPerSong,
			newPatternOrder,
			newPatternId,
			insertIndex
		};
	}

	/**
	 * Find the next available pattern ID from all songs' patterns and the pattern order
	 */
	static findNextAvailablePatternIdFromPatterns(
		allPatterns: Pattern[][],
		patternOrder: number[]
	): number | null {
		return this.findFirstFreePatternId(
			this.collectAllocatedPatternIds(allPatterns.flat(), patternOrder)
		);
	}

	private static collectAllocatedPatternIds(
		patterns: Pattern[],
		patternOrder: number[]
	): Set<number> {
		const usedPatternIds = new Set(patternOrder);
		for (const pattern of patterns) {
			if (!this.isPatternEmpty(pattern)) {
				usedPatternIds.add(pattern.id);
			}
		}
		return usedPatternIds;
	}

	private static replaceOrAppendPattern(songPatterns: Pattern[], nextPattern: Pattern): Pattern[] {
		const existingIndex = songPatterns.findIndex((pattern) => pattern.id === nextPattern.id);
		if (existingIndex === -1) return [...songPatterns, nextPattern];
		return songPatterns.map((pattern, index) =>
			index === existingIndex ? nextPattern : pattern
		);
	}

	private static isChannelRowEmpty(row: Row): boolean {
		if (row.note.name !== NoteName.None) return false;
		if (row.effects.some((effect) => effect && !PatternEffectHandling.isEmptyEffect(effect))) {
			return false;
		}
		for (const [key, value] of Object.entries(row)) {
			if (key === 'note' || key === 'effects') continue;
			if (!this.isEmptyFieldValue(value)) return false;
		}
		return true;
	}

	private static isDataRecordEmpty(record: Record<string, unknown>): boolean {
		for (const value of Object.values(record)) {
			if (!this.isEmptyFieldValue(value)) return false;
		}
		return true;
	}

	private static isEmptyFieldValue(value: unknown): boolean {
		if (value === null || value === undefined || value === '' || value === 0 || value === false) {
			return true;
		}
		if (isEffectLike(value)) {
			return PatternEffectHandling.isEmptyEffect(value);
		}
		return false;
	}

	private static findFirstFreePatternId(usedPatternIds: Set<number>): number | null {
		for (let id = MIN_PATTERN_ID; id <= MAX_PATTERN_ID; id++) {
			if (!usedPatternIds.has(id)) return id;
		}
		return null;
	}

	static makePatternUniqueMultiChip(
		allPatterns: Pattern[][],
		patternOrder: number[],
		index: number,
		getSchema: (songIndex: number) => ChipSchema | undefined
	): { newPatternOrder: number[]; updatedPatterns: Pattern[][] } | null {
		const currentId = patternOrder[index];
		const newId = this.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder);
		if (newId === null) return null;
		const newPatternOrder = [...patternOrder];
		newPatternOrder[index] = newId;

		const updatedPatterns = allPatterns.map((songPatterns, songIndex) => {
			const pattern = songPatterns.find((p) => p.id === currentId);
			if (pattern) {
				const schema = getSchema(songIndex);
				const cloned = this.clonePattern(pattern, newId, schema, songPatterns);
				return this.replaceOrAppendPattern(songPatterns, cloned);
			}
			return songPatterns;
		});

		return { newPatternOrder, updatedPatterns };
	}

	/**
	 * Make a pattern unique by creating a copy with a new ID and replacing it at the specified index
	 */
	static makePatternUnique(
		patterns: Record<number, Pattern>,
		patternOrder: number[],
		index: number,
		targetPattern: Pattern,
		schema?: ChipSchema
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
		newPatternId: number;
	} | null {
		if (!targetPattern) return null;

		const newPatternId = this.findNextAvailablePatternId(patterns, patternOrder);
		if (newPatternId === null) return null;

		const uniquePattern = this.clonePattern(
			targetPattern,
			newPatternId,
			schema,
			Object.values(patterns)
		);

		const newPatterns = { ...patterns, [newPatternId]: uniquePattern };
		const newPatternOrder = [...patternOrder];

		newPatternOrder[index] = newPatternId;

		return {
			newPatterns,
			newPatternOrder,
			newPatternId
		};
	}

	/**
	 * Calculate adjusted current pattern index after a removal operation
	 */
	static calculateAdjustedIndex(
		currentIndex: number,
		removedIndex: number,
		newPatternOrderLength: number
	): number {
		if (currentIndex < removedIndex) {
			return currentIndex;
		} else if (currentIndex === removedIndex) {
			return Math.min(currentIndex, newPatternOrderLength - 1);
		} else {
			return currentIndex - 1;
		}
	}

	/**
	 * Change the pattern ID at a specific position in the pattern order
	 */
	static setPatternIdInOrder(
		patterns: Record<number, Pattern>,
		patternOrder: number[],
		index: number,
		newId: number,
		schema?: ChipSchema,
		length: number = DEFAULT_PATTERN_LENGTH
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
	} | null {
		if (newId < MIN_PATTERN_ID || newId > MAX_PATTERN_ID) return null;

		if (!patterns[newId]) {
			const newPattern = this.createEmptyPattern(
				newId,
				schema,
				undefined,
				length,
				Object.values(patterns)
			);
			patterns = { ...patterns, [newId]: newPattern };
		}

		const newPatternOrder = patternOrder.map((id, i) => (i === index ? newId : id));

		return {
			newPatterns: patterns,
			newPatternOrder
		};
	}

	/**
	 * Change the pattern ID at a specific position, creating the pattern for each song with its schema if needed
	 */
	static setPatternIdInOrderMultiChip(
		allPatterns: Pattern[][],
		patternOrder: number[],
		index: number,
		newId: number,
		getSchema: (songIndex: number) => ChipSchema | undefined,
		getEffectiveLabels?: (songIndex: number) => string[] | undefined,
		length: number = DEFAULT_PATTERN_LENGTH
	): {
		newPatternsPerSong: Pattern[][];
		newPatternOrder: number[];
	} | null {
		if (newId < MIN_PATTERN_ID || newId > MAX_PATTERN_ID) return null;

		const newPatternOrder = patternOrder.map((id, i) => (i === index ? newId : id));

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const existing = songPatterns.find((p) => p.id === newId);
			if (existing) return songPatterns;

			const newPattern = this.createEmptyPattern(
				newId,
				getSchema(songIndex),
				getEffectiveLabels?.(songIndex),
				length,
				songPatterns
			);
			return [...songPatterns, newPattern];
		});

		return {
			newPatternsPerSong,
			newPatternOrder
		};
	}

	/**
	 * Find a pattern by ID in an array, or create it if it doesn't exist
	 */
	static findOrCreatePattern(
		patterns: Pattern[],
		patternId: number,
		schema?: ChipSchema,
		effectiveChannelLabels?: string[],
		length: number = DEFAULT_PATTERN_LENGTH
	): { pattern: Pattern; newPatterns: Pattern[] } {
		let pattern = patterns.find((p) => p.id === patternId);
		if (!pattern) {
			pattern = this.createEmptyPattern(
				patternId,
				schema,
				effectiveChannelLabels,
				length,
				patterns
			);
			return { pattern, newPatterns: [...patterns, pattern] };
		}
		return { pattern, newPatterns: patterns };
	}

	/**
	 * Update a pattern in an array by replacing it with the updated version
	 */
	static updatePatternInArray(patterns: Pattern[], updatedPattern: Pattern): Pattern[] {
		const patternIndex = patterns.findIndex((p) => p.id === updatedPattern.id);
		if (patternIndex >= 0) {
			return [
				...patterns.slice(0, patternIndex),
				updatedPattern,
				...patterns.slice(patternIndex + 1)
			];
		}
		return patterns;
	}

	/**
	 * Move a pattern from one position to another in the pattern order
	 */
	static movePatternInOrder(
		patternOrder: number[],
		fromIndex: number,
		toIndex: number
	): {
		newPatternOrder: number[];
	} {
		if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= patternOrder.length || toIndex < 0 || toIndex >= patternOrder.length) {
			return { newPatternOrder: patternOrder };
		}

		const newPatternOrder = [...patternOrder];
		const [movedPattern] = newPatternOrder.splice(fromIndex, 1);
		newPatternOrder.splice(toIndex, 0, movedPattern);

		return { newPatternOrder };
	}

	/**
	 * Resize a pattern to a new length, preserving existing data
	 */
	static resizePattern(pattern: Pattern, newLength: number, schema?: ChipSchema): Pattern {
		if (newLength < 1 || newLength > 256) {
			throw new Error('Pattern length must be between 1 and 256');
		}

		if (pattern.length === newLength) {
			return pattern;
		}

		const channelLabels = pattern.channels.map((c) => c.label);
		const resizedPattern = new Pattern(pattern.id, newLength, schema, channelLabels);
		this.copyChannelEffectColumnLayout(pattern, resizedPattern);
		const copyLength = Math.min(pattern.length, newLength);

		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const sourceChannel = pattern.channels[channelIndex];
			const targetChannel = resizedPattern.channels[channelIndex];

			for (let rowIndex = 0; rowIndex < copyLength; rowIndex++) {
				const sourceRow = sourceChannel.rows[rowIndex];
				const targetRow = targetChannel.rows[rowIndex];

				targetRow.note = new Note(sourceRow.note.name, sourceRow.note.octave);
				targetRow.effects = sourceRow.effects.map((effect) =>
					effect && !PatternEffectHandling.isEmptyEffect(effect)
						? new Effect(effect.effect, effect.delay, effect.parameter, effect.tableIndex)
						: null
				);
				this.copyRowFields(sourceRow, targetRow);
			}
		}

		for (let rowIndex = 0; rowIndex < copyLength; rowIndex++) {
			const sourcePatternRow = pattern.patternRows[rowIndex];
			const targetPatternRow = resizedPattern.patternRows[rowIndex];
			this.copyPatternRowFields(sourcePatternRow, targetPatternRow);
		}

		return resizedPattern;
	}

	private static copyChannelRow(
		sourceRow: Pattern['channels'][number]['rows'][number],
		targetRow: Pattern['channels'][number]['rows'][number]
	): void {
		targetRow.note = new Note(sourceRow.note.name, sourceRow.note.octave);
		targetRow.effects = sourceRow.effects.map((effect) =>
			effect && !PatternEffectHandling.isEmptyEffect(effect)
				? new Effect(effect.effect, effect.delay, effect.parameter, effect.tableIndex)
				: null
		);
		this.copyRowFields(sourceRow, targetRow);
	}

	static insertRowAt(pattern: Pattern, rowIndex: number, schema?: ChipSchema): Pattern | null {
		if (rowIndex < 0 || rowIndex >= pattern.length) {
			return null;
		}

		const channelLabels = pattern.channels.map((c) => c.label);
		const result = new Pattern(pattern.id, pattern.length, schema, channelLabels);
		this.copyChannelEffectColumnLayout(pattern, result);

		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const sourceChannel = pattern.channels[channelIndex];
			const targetChannel = result.channels[channelIndex];

			for (let i = 0; i < rowIndex; i++) {
				this.copyChannelRow(sourceChannel.rows[i], targetChannel.rows[i]);
			}

			for (let i = rowIndex; i < pattern.length - 1; i++) {
				this.copyChannelRow(sourceChannel.rows[i], targetChannel.rows[i + 1]);
			}
		}

		for (let i = 0; i < rowIndex; i++) {
			this.copyPatternRowFields(pattern.patternRows[i], result.patternRows[i]);
		}

		for (let i = rowIndex; i < pattern.length - 1; i++) {
			this.copyPatternRowFields(pattern.patternRows[i], result.patternRows[i + 1]);
		}

		return result;
	}

	static removeRowAt(pattern: Pattern, rowIndex: number, schema?: ChipSchema): Pattern | null {
		if (rowIndex < 0 || rowIndex >= pattern.length) {
			return null;
		}

		const channelLabels = pattern.channels.map((c) => c.label);
		const result = new Pattern(pattern.id, pattern.length, schema, channelLabels);
		this.copyChannelEffectColumnLayout(pattern, result);

		for (let channelIndex = 0; channelIndex < pattern.channels.length; channelIndex++) {
			const sourceChannel = pattern.channels[channelIndex];
			const targetChannel = result.channels[channelIndex];

			for (let i = 0; i < rowIndex; i++) {
				this.copyChannelRow(sourceChannel.rows[i], targetChannel.rows[i]);
			}

			for (let i = rowIndex + 1; i < pattern.length; i++) {
				this.copyChannelRow(sourceChannel.rows[i], targetChannel.rows[i - 1]);
			}
		}

		for (let i = 0; i < rowIndex; i++) {
			this.copyPatternRowFields(pattern.patternRows[i], result.patternRows[i]);
		}

		for (let i = rowIndex + 1; i < pattern.length; i++) {
			this.copyPatternRowFields(pattern.patternRows[i], result.patternRows[i - 1]);
		}

		return result;
	}
}
