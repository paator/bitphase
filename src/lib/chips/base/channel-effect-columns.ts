import { Effect } from '../../models/song';
import type { ChipField, ChipSchema } from './schema';
import type { GenericChannel, GenericRow } from '../../models/song/generic';
import { isEffectLike } from '../../utils/type-guards';
import { PatternEffectHandling } from '../../services/pattern/editing/pattern-effect-handling';

export const MIN_CHANNEL_EFFECT_COLUMNS = 1;
export const MAX_CHANNEL_EFFECT_COLUMNS = 4;

export function getChannelEffectFieldKey(slotIndex: number): string {
	return slotIndex <= 0 ? 'effect' : `effect${slotIndex}`;
}

export function isChannelEffectFieldKey(fieldKey: string): boolean {
	return fieldKey === 'effect' || /^effect[1-9]\d*$/.test(fieldKey);
}

export function isEffectFieldKey(fieldKey: string): boolean {
	return isChannelEffectFieldKey(fieldKey) || fieldKey === 'envelopeEffect';
}

export function getChannelEffectSlotIndex(fieldKey: string): number | null {
	if (fieldKey === 'effect') return 0;
	const match = /^effect([1-9]\d*)$/.exec(fieldKey);
	return match ? Number(match[1]) : null;
}

export function getChannelEffectColumnLabel(fieldKey: string): string | null {
	const slot = getChannelEffectSlotIndex(fieldKey);
	if (slot === null) return null;
	return slot <= 0 ? 'Effect' : `Effect ${slot + 1}`;
}

export function clampChannelEffectColumnCount(count: number): number {
	if (!Number.isFinite(count)) return MIN_CHANNEL_EFFECT_COLUMNS;
	return Math.max(
		MIN_CHANNEL_EFFECT_COLUMNS,
		Math.min(MAX_CHANNEL_EFFECT_COLUMNS, Math.trunc(count))
	);
}

export function padEffectsArray<T>(effects: (T | null)[] | undefined, count: number): (T | null)[] {
	const nextCount = clampChannelEffectColumnCount(count);
	const next = [...(effects ?? [null])];
	while (next.length < nextCount) {
		next.push(null);
	}
	if (next.length > nextCount) {
		next.length = nextCount;
	}
	if (next.length === 0) {
		next.push(null);
	}
	return next;
}

export function getPatternEffectColumnCounts(pattern: {
	channels: Array<{ effectColumnCount?: number; rows?: { effects?: unknown[] }[] }>;
}): number[] {
	return pattern.channels.map((channel) => resolveChannelEffectColumnCount(channel));
}

type EffectColumnChannel = {
	effectColumnCount?: number;
	rows?: { effects?: unknown[] }[];
};

type EffectColumnPattern = {
	channels: EffectColumnChannel[];
};

export function getSharedEffectColumnCounts(patterns: EffectColumnPattern[]): number[] {
	const channelCount = Math.max(0, ...patterns.map((pattern) => pattern.channels.length));
	const counts = Array.from({ length: channelCount }, () => MIN_CHANNEL_EFFECT_COLUMNS);
	for (const pattern of patterns) {
		for (let index = 0; index < pattern.channels.length; index++) {
			counts[index] = Math.max(
				counts[index] ?? MIN_CHANNEL_EFFECT_COLUMNS,
				resolveChannelEffectColumnCount(pattern.channels[index]!)
			);
		}
	}
	return counts;
}

export function applySharedEffectColumnCounts(
	pattern: EffectColumnPattern,
	counts: number[]
): void {
	const channelCount = Math.min(pattern.channels.length, counts.length);
	for (let index = 0; index < channelCount; index++) {
		const count = clampChannelEffectColumnCount(counts[index] ?? MIN_CHANNEL_EFFECT_COLUMNS);
		const channel = pattern.channels[index]!;
		channel.effectColumnCount = count;
		if (!channel.rows) continue;
		for (const row of channel.rows) {
			row.effects = padEffectsArray(row.effects, count);
		}
	}
}

export function syncSharedEffectColumnLayout(patterns: EffectColumnPattern[]): void {
	const counts = getSharedEffectColumnCounts(patterns);
	for (const pattern of patterns) {
		applySharedEffectColumnCounts(pattern, counts);
	}
}

export function resolveChannelEffectColumnCount(channel: {
	effectColumnCount?: number;
	rows?: { effects?: unknown[] }[];
}): number {
	if (channel.effectColumnCount !== undefined) {
		return clampChannelEffectColumnCount(channel.effectColumnCount);
	}
	let maxLength = MIN_CHANNEL_EFFECT_COLUMNS;
	for (const row of channel.rows ?? []) {
		const length = row.effects?.length ?? 0;
		if (length > maxLength) {
			maxLength = length;
		}
	}
	return clampChannelEffectColumnCount(maxLength);
}

export function schemaHasChannelEffects(schema: Pick<ChipSchema, 'fields' | 'template'>): boolean {
	return Boolean(schema.fields.effect) && schema.template.includes('{effect}');
}

export function expandChannelTemplate(baseTemplate: string, effectCount: number): string {
	const count = clampChannelEffectColumnCount(effectCount);
	if (count <= 1 || !baseTemplate.includes('{effect}')) {
		return baseTemplate;
	}
	const extra = Array.from(
		{ length: count - 1 },
		(_, index) => `{${getChannelEffectFieldKey(index + 1)}}`
	).join(' ');
	return baseTemplate.replace('{effect}', `{effect} ${extra}`);
}

export function getExpandedChannelFields(
	baseFields: Record<string, ChipField>,
	effectCount: number
): Record<string, ChipField> {
	const count = clampChannelEffectColumnCount(effectCount);
	const effectField = baseFields.effect;
	if (!effectField || count <= 1) {
		return baseFields;
	}
	const fields = { ...baseFields };
	for (let index = 1; index < count; index++) {
		const key = getChannelEffectFieldKey(index);
		fields[key] = { ...effectField, key };
	}
	return fields;
}

export function resolveSchemaField(schema: ChipSchema, fieldKey: string): ChipField | undefined {
	if (schema.fields[fieldKey]) {
		return schema.fields[fieldKey];
	}
	if (schema.globalFields?.[fieldKey]) {
		return schema.globalFields[fieldKey];
	}
	if (isChannelEffectFieldKey(fieldKey) && schema.fields.effect) {
		return { ...schema.fields.effect, key: fieldKey };
	}
	return undefined;
}

export function getChannelLayout(
	schema: ChipSchema,
	effectCount: number
): { template: string; fields: Record<string, ChipField> } {
	const count = schemaHasChannelEffects(schema)
		? clampChannelEffectColumnCount(effectCount)
		: MIN_CHANNEL_EFFECT_COLUMNS;
	return {
		template: expandChannelTemplate(schema.template, count),
		fields: getExpandedChannelFields(schema.fields, count)
	};
}

export function getEffectColumnCountFromGenericRow(row: GenericRow | undefined): number {
	if (!row) {
		return MIN_CHANNEL_EFFECT_COLUMNS;
	}
	let count = MIN_CHANNEL_EFFECT_COLUMNS;
	for (let index = 1; index < MAX_CHANNEL_EFFECT_COLUMNS; index++) {
		if (getChannelEffectFieldKey(index) in row) {
			count = index + 1;
		} else {
			break;
		}
	}
	return count;
}

export function effectToGenericValue(effectValue: unknown): Record<string, unknown> | null {
	const effect = isEffectLike(effectValue) ? effectValue : null;
	if (!effect || PatternEffectHandling.isEmptyEffect(effect)) {
		return null;
	}
	return {
		effect: effect.effect,
		delay: effect.delay,
		parameter: effect.parameter,
		tableIndex: effect.tableIndex
	};
}

export function genericValueToEffect(value: unknown): Effect | null {
	if (!value || !isEffectLike(value) || PatternEffectHandling.isEmptyEffect(value)) {
		return null;
	}
	return new Effect(value.effect, value.delay, value.parameter, value.tableIndex);
}

export function assignEffectsToGenericRow(
	genericRow: GenericRow,
	effects: (Effect | null)[] | undefined,
	count: number
): void {
	const padded = padEffectsArray(effects, count);
	for (let index = 0; index < count; index++) {
		genericRow[getChannelEffectFieldKey(index)] = effectToGenericValue(padded[index]);
	}
}

export function readEffectsFromGenericRow(
	genericRow: GenericRow,
	count: number
): (Effect | null)[] {
	const effects: (Effect | null)[] = [];
	for (let index = 0; index < count; index++) {
		effects.push(genericValueToEffect(genericRow[getChannelEffectFieldKey(index)]));
	}
	return effects;
}

export function getEffectColumnCountFromGenericChannel(channel: GenericChannel): number {
	if (channel.effectColumnCount !== undefined) {
		return clampChannelEffectColumnCount(channel.effectColumnCount);
	}
	let maxCount = MIN_CHANNEL_EFFECT_COLUMNS;
	for (const row of channel.rows) {
		maxCount = Math.max(maxCount, getEffectColumnCountFromGenericRow(row));
	}
	return clampChannelEffectColumnCount(maxCount);
}
