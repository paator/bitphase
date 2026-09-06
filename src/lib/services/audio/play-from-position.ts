import type { Pattern } from '../../models/song';
import type { ChipSchema, ChipField } from '../../chips/base/schema';

export interface PlaybackCarryState {
	channelFields?: Array<Record<string, unknown>>;
	globalFields?: Record<string, unknown>;
	speed?: number;
}

const SPEED_EFFECT_TYPE = 'S'.charCodeAt(0);

function toNum(v: unknown): number {
	if (v === undefined || v === null) return NaN;
	const n = Number(v);
	return Number.isNaN(n) ? NaN : n;
}

function isGlobalFieldValueSet(
	key: string,
	value: unknown,
	field: ChipField
): boolean {
	if (value === undefined || value === null) return false;
	const n = toNum(value);
	if (Number.isNaN(n)) return false;
	const when = field.backtrackWhen ?? 'any';
	if (when === 'nonZero') return n !== 0;
	return true;
}

function isChannelFieldValueSet(
	key: string,
	value: unknown,
	field: ChipField
): boolean {
	if (value === undefined || value === null) return false;
	if (field.type === 'note' || key === 'note') {
		const note = value as { name?: number } | undefined;
		const name = note?.name;
		return name !== undefined && name !== null && name !== 0;
	}
	const n = toNum(value);
	if (Number.isNaN(n)) return false;
	if (key === 'table') return n === -1 || n > 0;
	const when = field.backtrackWhen ?? 'any';
	if (when === 'nonZero') return n !== 0;
	return true;
}

function isPersistChannelField(key: string, field: ChipField): boolean {
	if (field.usedForBacktracking !== true) return false;
	if (field.type === 'note' || key === 'note') return false;
	return true;
}

function readRowSpeed(row: Record<string, unknown> | undefined): number | null {
	const effects = row?.effects;
	if (!Array.isArray(effects)) return null;
	for (const effect of effects) {
		if (!effect || typeof effect !== 'object') continue;
		const slot = effect as { effect?: unknown; parameter?: unknown };
		if (slot.effect !== SPEED_EFFECT_TYPE) continue;
		const speed = toNum(slot.parameter);
		if (!Number.isNaN(speed) && speed > 0) return speed;
	}
	return null;
}

export function collectPlaybackCarry(
	patternOrder: number[],
	getPattern: (patternId: number) => Pattern | undefined,
	targetOrderIndex: number,
	targetRow: number,
	schema: ChipSchema
): PlaybackCarryState | null {
	if (targetOrderIndex < 0) return null;
	const targetPatternId = patternOrder[targetOrderIndex];
	const targetPattern =
		targetPatternId === undefined ? undefined : getPattern(targetPatternId);
	const channelCount = Math.max(
		schema.channelLabels?.length ?? 0,
		targetPattern?.channels?.length ?? 0
	);
	if (channelCount <= 0) return null;

	const channelFieldEntries = schema.fields
		? Object.entries(schema.fields).filter(([key, field]) =>
				isPersistChannelField(key, field)
			)
		: [];
	const globalFieldEntries = schema.globalFields
		? Object.entries(schema.globalFields).filter(
				([_, field]) => field.usedForBacktracking === true
			)
		: [];

	const channelFields = Array.from(
		{ length: channelCount },
		() => ({}) as Record<string, unknown>
	);
	const globalFields: Record<string, unknown> = {};
	let speed: number | undefined;
	let remaining =
		channelCount * channelFieldEntries.length + globalFieldEntries.length + 1;
	if (remaining === 0) return null;

	for (let orderIndex = targetOrderIndex; orderIndex >= 0 && remaining > 0; orderIndex--) {
		const patternId = patternOrder[orderIndex];
		const pattern = patternId === undefined ? undefined : getPattern(patternId);
		if (!pattern?.channels?.length) continue;
		const rowStart =
			orderIndex === targetOrderIndex ? targetRow - 1 : pattern.length - 1;
		for (let rowIndex = rowStart; rowIndex >= 0 && remaining > 0; rowIndex--) {
			const patternRow = pattern.patternRows?.[rowIndex] as
				| Record<string, unknown>
				| undefined;
			for (const [key, field] of globalFieldEntries) {
				if (key in globalFields) continue;
				const value = patternRow?.[key];
				if (!isGlobalFieldValueSet(key, value, field)) continue;
				globalFields[key] = value;
				remaining--;
			}
			for (let ch = 0; ch < channelCount && ch < pattern.channels.length; ch++) {
				const row = pattern.channels[ch].rows?.[rowIndex] as
					| Record<string, unknown>
					| undefined;
				if (!row) continue;
				if (speed === undefined) {
					const rowSpeed = readRowSpeed(row);
					if (rowSpeed !== null) {
						speed = rowSpeed;
						remaining--;
					}
				}
				const carryForChannel = channelFields[ch];
				for (const [key, field] of channelFieldEntries) {
					if (key in carryForChannel) continue;
					const value = row[key];
					if (!isChannelFieldValueSet(key, value, field)) continue;
					carryForChannel[key] = value;
					remaining--;
				}
			}
		}
	}

	const hasChannelFields = channelFields.some(
		(fields) => Object.keys(fields).length > 0
	);
	const hasGlobalFields = Object.keys(globalFields).length > 0;
	if (!hasChannelFields && !hasGlobalFields && speed === undefined) {
		return null;
	}

	const carry: PlaybackCarryState = {};
	if (hasChannelFields) carry.channelFields = channelFields;
	if (hasGlobalFields) carry.globalFields = globalFields;
	if (speed !== undefined) carry.speed = speed;
	return carry;
}
