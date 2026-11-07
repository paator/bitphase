import {
	getChannelEffectFieldKey,
	getChannelEffectSlotIndex,
	isChannelEffectFieldKey,
	isEffectFieldKey
} from '../../chips/base/channel-effect-columns';
import type { ChipSchema } from '../../chips/base/schema';

const INDEXED_FIELD_KEY = /^(.+?)(\d+)$/;

interface IndexedGlobalFamily {
	stem: string;
	index: number;
	groupSize: number | null;
	members: Map<number, string>;
}

function parseIndexedFieldKey(fieldKey: string): { stem: string; index: number } | null {
	const match = INDEXED_FIELD_KEY.exec(fieldKey);
	if (!match) return null;
	return { stem: match[1], index: Number(match[2]) };
}

function indexedGlobalFamily(schema: ChipSchema, fieldKey: string): IndexedGlobalFamily | null {
	const parsed = parseIndexedFieldKey(fieldKey);
	if (!parsed || !schema.globalFields?.[fieldKey] || !schema.globalAnchors) return null;

	const members = new Map<number, string>();
	for (const anchor of schema.globalAnchors) {
		if (!schema.globalFields[anchor.field]) continue;
		const anchored = parseIndexedFieldKey(anchor.field);
		if (!anchored || anchored.stem !== parsed.stem) continue;
		members.set(anchored.index, anchor.field);
	}
	if (members.size < 2 || !members.has(parsed.index)) return null;

	const channelCount = schema.channelLabels?.length ?? 0;
	const groupSize =
		channelCount > 0 && channelCount % members.size === 0 ? channelCount / members.size : null;
	return { stem: parsed.stem, index: parsed.index, groupSize, members };
}

export function clipboardFieldsAreCompatible(
	sourceKey: string,
	targetKey: string,
	schema?: ChipSchema
): boolean {
	if (sourceKey === targetKey) return true;
	if (isEffectFieldKey(sourceKey) && isEffectFieldKey(targetKey)) return true;
	if (!schema) return false;
	const source = indexedGlobalFamily(schema, sourceKey);
	const target = indexedGlobalFamily(schema, targetKey);
	return !!source && !!target && source.stem === target.stem;
}

export function clipboardAllowsNoteEnvelopeConversion(fieldKeys: string[]): boolean {
	const keys = new Set(fieldKeys);
	if (keys.size !== 1) return false;
	const [key] = keys;
	return key === 'envelopeValue' || key === 'note';
}

export function resolveClipboardDestChannelIndex(
	sourceChannelIndex: number | undefined,
	originChannelIndex: number,
	minSourceChannelIndex: number
): number {
	if (sourceChannelIndex !== undefined && sourceChannelIndex < 0) {
		return -1;
	}
	const sourceChannel = sourceChannelIndex ?? originChannelIndex;
	if (sourceChannel < 0) {
		return originChannelIndex;
	}
	if (originChannelIndex < 0) {
		return sourceChannel;
	}
	return originChannelIndex + (sourceChannel - minSourceChannelIndex);
}

export function minClipboardChannelIndex(channelIndices: Array<number | undefined>): number {
	const channels = channelIndices.filter(
		(index): index is number => index !== undefined && index >= 0
	);
	return channels.length > 0 ? Math.min(...channels) : 0;
}

export function resolveClipboardDestGlobalFieldKey(
	sourceKey: string,
	schema: ChipSchema,
	originFieldKey: string | undefined,
	originChannelIndex: number,
	minSourceChannelIndex: number,
	sourceFieldKeys: string[]
): string {
	const family = indexedGlobalFamily(schema, sourceKey);
	if (!family) return sourceKey;

	const originFamily = originFieldKey ? indexedGlobalFamily(schema, originFieldKey) : null;
	if (originFamily && originFamily.stem === family.stem) {
		let minSourceIndex = family.index;
		for (const key of sourceFieldKeys) {
			const parsed = parseIndexedFieldKey(key);
			if (!parsed || parsed.stem !== family.stem || !family.members.has(parsed.index))
				continue;
			if (parsed.index < minSourceIndex) minSourceIndex = parsed.index;
		}
		return (
			family.members.get(originFamily.index + (family.index - minSourceIndex)) ?? sourceKey
		);
	}

	if (originChannelIndex < 0 || family.groupSize === null) return sourceKey;
	const groupShift =
		Math.floor(originChannelIndex / family.groupSize) -
		Math.floor(minSourceChannelIndex / family.groupSize);
	return family.members.get(family.index + groupShift) ?? sourceKey;
}

export function resolveClipboardDestFieldKey(
	sourceKey: string,
	originFieldKey: string | undefined,
	sourceFieldKeys: string[]
): string {
	if (!isChannelEffectFieldKey(sourceKey)) {
		return sourceKey;
	}
	const sourceSlot = getChannelEffectSlotIndex(sourceKey) ?? 0;
	const originSlot =
		originFieldKey && isChannelEffectFieldKey(originFieldKey)
			? (getChannelEffectSlotIndex(originFieldKey) ?? 0)
			: null;
	if (originSlot === null) {
		return getChannelEffectFieldKey(sourceSlot);
	}
	const sourceSlots = sourceFieldKeys
		.map((key) => getChannelEffectSlotIndex(key))
		.filter((slot): slot is number => slot !== null);
	const minSourceSlot = sourceSlots.length > 0 ? Math.min(...sourceSlots) : sourceSlot;
	return getChannelEffectFieldKey(originSlot + (sourceSlot - minSourceSlot));
}

export function clipboardNoteEnvelopeConversionTarget(sourceKey: string): string | null {
	if (sourceKey === 'envelopeValue') return 'note';
	if (sourceKey === 'note') return 'envelopeValue';
	return null;
}
