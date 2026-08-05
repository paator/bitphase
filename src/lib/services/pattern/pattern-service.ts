import { Pattern, Note, Effect } from '../../models/song';
import { isEffectLike, toNumber } from '../../utils/type-guards';
import type { ChipSchema } from '../../chips/base/schema';
import { PatternEffectHandling } from './editing/pattern-effect-handling';

export class PatternService {
	/**
	 * Find the next available pattern ID
	 */
	static findNextAvailablePatternId(
		patterns: Record<number, Pattern>,
		patternOrder: number[]
	): number {
		const usedPatternIds = new Set([...patternOrder, ...Object.keys(patterns).map(Number)]);

		let newPatternId = 0;
		while (usedPatternIds.has(newPatternId)) {
			newPatternId++;
		}

		return newPatternId;
	}

	/**
	 * Create a new empty pattern
	 */
	static createEmptyPattern(
		id: number,
		schema?: ChipSchema,
		effectiveChannelLabels?: string[]
	): Pattern {
		return new Pattern(id, 64, schema, effectiveChannelLabels);
	}

	/**
	 * Create a deep copy of a pattern with a new ID
	 */
	static clonePattern(sourcePattern: Pattern, newId: number, schema?: ChipSchema): Pattern {
		const channelLabels = sourcePattern.channels.map((c) => c.label);
		const clonedPattern = new Pattern(newId, sourcePattern.length, schema, channelLabels);

		sourcePattern.channels.forEach((channel, channelIndex) => {
			channel.rows.forEach((row, rowIndex) => {
				const newRow = clonedPattern.channels[channelIndex].rows[rowIndex];
				newRow.note = new Note(row.note.name, row.note.octave);
				newRow.effects = row.effects.map((effect) =>
					effect && !PatternEffectHandling.isEmptyEffect(effect)
						? new Effect(effect.effect, effect.delay, effect.parameter, effect.tableIndex)
						: null
				);
				this.copyRowFields(row, newRow);
			});
		});

		sourcePattern.patternRows.forEach((patternRow, index) => {
			const newPatternRow = clonedPattern.patternRows[index];
			this.copyPatternRowFields(patternRow, newPatternRow);
		});

		return clonedPattern;
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
		schema?: ChipSchema
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} {
		const newPatternId = this.findNextAvailablePatternId(patterns, patternOrder);
		const newPattern = this.createEmptyPattern(newPatternId, schema);

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
		getEffectiveLabels?: (songIndex: number) => string[] | undefined
	): {
		newPatternsPerSong: Pattern[][];
		newPatternOrder: number[];
		newPatternId: number;
		insertIndex: number;
	} {
		const newPatternId = this.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder);
		const insertIndex = index + 1;
		const newPatternOrder = [...patternOrder];
		newPatternOrder.splice(insertIndex, 0, newPatternId);

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const newPattern = this.createEmptyPattern(
				newPatternId,
				getSchema(songIndex),
				getEffectiveLabels?.(songIndex)
			);
			const existing = songPatterns.find((p) => p.id === newPatternId);
			if (existing) {
				return songPatterns.map((p) => (p.id === newPatternId ? newPattern : p));
			}
			return [...songPatterns, newPattern];
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
		const clonedPattern = this.clonePattern(targetPattern, newPatternId, schema);

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
	} {
		const targetPatternId = patternOrder[index];
		const newPatternId =
			this.findNextAvailablePatternIdFromPatterns(allPatterns, patternOrder);
		const insertIndex = index + 1;
		const newPatternOrder = [...patternOrder];
		newPatternOrder.splice(insertIndex, 0, newPatternId);

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const sourcePattern = songPatterns.find((p) => p.id === targetPatternId);
			if (sourcePattern) {
				const clonedPattern = this.clonePattern(
					sourcePattern,
					newPatternId,
					getSchema(songIndex)
				);
				return [...songPatterns, clonedPattern];
			}

			const emptyPattern = this.createEmptyPattern(newPatternId, getSchema(songIndex));
			const existing = songPatterns.find((p) => p.id === newPatternId);
			if (existing) {
				return songPatterns.map((p) => (p.id === newPatternId ? emptyPattern : p));
			}
			return [...songPatterns, emptyPattern];
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
	): number {
		const usedPatternIds = new Set(patternOrder);
		for (const songPatterns of allPatterns) {
			for (const pattern of songPatterns) {
				usedPatternIds.add(pattern.id);
			}
		}
		let newPatternId = 0;
		while (usedPatternIds.has(newPatternId)) {
			newPatternId++;
		}
		return newPatternId;
	}

	static findNextSequentialPatternId(
		allPatterns: Pattern[][],
		patternOrder: number[]
	): number {
		let maxId = -1;
		for (const id of patternOrder) {
			if (id > maxId) maxId = id;
		}
		for (const songPatterns of allPatterns) {
			for (const pattern of songPatterns) {
				if (pattern.id > maxId) maxId = pattern.id;
			}
		}
		return maxId + 1;
	}

	static makePatternUniqueMultiChip(
		allPatterns: Pattern[][],
		patternOrder: number[],
		index: number,
		getSchema: (songIndex: number) => ChipSchema | undefined
	): { newPatternOrder: number[]; updatedPatterns: Pattern[][] } {
		const currentId = patternOrder[index];
		const newId = this.findNextSequentialPatternId(allPatterns, patternOrder);
		const newPatternOrder = [...patternOrder];
		newPatternOrder[index] = newId;

		const updatedPatterns = allPatterns.map((songPatterns, songIndex) => {
			const pattern = songPatterns.find((p) => p.id === currentId);
			if (pattern) {
				const schema = getSchema(songIndex);
				const cloned = this.clonePattern(pattern, newId, schema);
				return [...songPatterns, cloned];
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

		const allPatterns = [Object.values(patterns)];
		const newPatternId = this.findNextSequentialPatternId(allPatterns, patternOrder);
		const uniquePattern = this.clonePattern(targetPattern, newPatternId, schema);

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
		currentPattern?: Pattern,
		schema?: ChipSchema
	): {
		newPatterns: Record<number, Pattern>;
		newPatternOrder: number[];
	} | null {
		if (newId < 0 || newId > 99) return null;

		if (!patterns[newId]) {
			const newPattern = currentPattern
				? this.clonePattern(currentPattern, newId, schema)
				: this.createEmptyPattern(newId, schema);
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
		getEffectiveLabels?: (songIndex: number) => string[] | undefined
	): {
		newPatternsPerSong: Pattern[][];
		newPatternOrder: number[];
	} | null {
		if (newId < 0 || newId > 99) return null;

		const newPatternOrder = patternOrder.map((id, i) => (i === index ? newId : id));

		const newPatternsPerSong = allPatterns.map((songPatterns, songIndex) => {
			const existing = songPatterns.find((p) => p.id === newId);
			if (existing) return songPatterns;

			const currentPattern = songPatterns.find((p) => p.id === patternOrder[index]);
			const newPattern = currentPattern
				? this.clonePattern(currentPattern, newId, getSchema(songIndex))
				: this.createEmptyPattern(newId, getSchema(songIndex), getEffectiveLabels?.(songIndex));
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
		patternId: number
	): { pattern: Pattern; newPatterns: Pattern[] } {
		let pattern = patterns.find((p) => p.id === patternId);
		if (!pattern) {
			pattern = this.createEmptyPattern(patternId);
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
}
