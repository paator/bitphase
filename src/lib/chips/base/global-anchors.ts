import { logicalColumnForHardwareChannel } from '../../models/virtual-channels';
import type { ChipField, ChipSchema } from './schema';

export interface AnchoredGlobalField {
	field: string;
	definition: ChipField;
}

export function usesAnchoredGlobals(schema: ChipSchema): boolean {
	return !!schema.globalFields && (schema.globalAnchors?.length ?? 0) > 0;
}

export function anchorsBeforeChannel(
	schema: ChipSchema,
	channelIndex: number,
	virtualChannelMap?: Record<number, number>
): AnchoredGlobalField[] {
	if (!schema.globalAnchors || !schema.globalFields) return [];
	const hardwareCount = schema.channelLabels?.length ?? 0;
	const anchors: AnchoredGlobalField[] = [];
	for (const anchor of schema.globalAnchors) {
		const column = virtualChannelMap
			? logicalColumnForHardwareChannel(anchor.beforeChannel, virtualChannelMap, hardwareCount)
			: anchor.beforeChannel;
		if (column !== channelIndex) continue;
		const definition = schema.globalFields[anchor.field];
		if (!definition) continue;
		anchors.push({ field: anchor.field, definition });
	}
	return anchors;
}

export type RowSlot =
	| { kind: 'globals' }
	| { kind: 'global'; field: string }
	| { kind: 'channel'; index: number };

export function rowSlots(
	schema: ChipSchema,
	channelCount: number,
	virtualChannelMap?: Record<number, number>
): RowSlot[] {
	if (usesAnchoredGlobals(schema)) {
		const slots: RowSlot[] = [];
		for (let index = 0; index < channelCount; index++) {
			for (const anchor of anchorsBeforeChannel(schema, index, virtualChannelMap)) {
				slots.push({ kind: 'global', field: anchor.field });
			}
			slots.push({ kind: 'channel', index });
		}
		return slots;
	}

	const slots: RowSlot[] = [];
	if (schema.globalTemplate && schema.globalFields) {
		slots.push({ kind: 'globals' });
	}
	for (let index = 0; index < channelCount; index++) {
		slots.push({ kind: 'channel', index });
	}
	return slots;
}

export function slotIndexForCell(
	slots: RowSlot[],
	fieldKey: string,
	isGlobal: boolean,
	channelIndex: number
): number {
	if (isGlobal) {
		const anchored = slots.findIndex(
			(slot) => slot.kind === 'global' && slot.field === fieldKey
		);
		if (anchored >= 0) return anchored;
		const block = slots.findIndex((slot) => slot.kind === 'globals');
		return block >= 0 ? block : 0;
	}
	const channel = slots.findIndex(
		(slot) => slot.kind === 'channel' && slot.index === channelIndex
	);
	return channel >= 0 ? channel : 0;
}
