import { AY_REGISTER_COUNT } from '../ay/ay-export-utils';
import { TMR_ITEM_SIZE, type TmrEventItemRecord } from './tmr-format';

export const TEL_MAGIC = [0x54, 0x45, 0x4c, 0x1a] as const;
export const TEL_HEADER_SIZE = 16;

export type ParsedEventList = {
	eventItems: TmrEventItemRecord[];
};

export type TelParseResult =
	| { ok: true; file: ParsedEventList }
	| { ok: false; errors: string[] };

export function encodeEventList(eventItems: TmrEventItemRecord[]): ArrayBuffer {
	const buffer = new ArrayBuffer(TEL_HEADER_SIZE + eventItems.length * TMR_ITEM_SIZE);
	const view = new DataView(buffer);
	view.setUint8(0, 0x54);
	view.setUint8(1, 0x45);
	view.setUint8(2, 0x4c);
	view.setUint8(3, 0x1a);
	view.setUint16(4, 1, true);
	view.setUint16(6, TEL_HEADER_SIZE, true);
	view.setUint32(8, eventItems.length >>> 0, true);
	view.setUint32(12, 0, true);
	writeEventItems(view, TEL_HEADER_SIZE, eventItems);
	return buffer;
}

export function parseEventList(buffer: ArrayBuffer): TelParseResult {
	const errors: string[] = [];
	const bytes = new Uint8Array(buffer);

	if (bytes.length < TEL_HEADER_SIZE) {
		return {
			ok: false,
			errors: [`File too small (${bytes.length} bytes, need at least ${TEL_HEADER_SIZE})`]
		};
	}

	for (let index = 0; index < TEL_MAGIC.length; index++) {
		if (bytes[index] !== TEL_MAGIC[index]) {
			errors.push(
				`Invalid magic at byte ${index}: expected 0x${TEL_MAGIC[index]!.toString(16).toUpperCase()}, got 0x${bytes[index]!.toString(16).toUpperCase()}`
			);
		}
	}

	const view = new DataView(buffer);
	const version = view.getUint16(4, true);
	const headerSize = view.getUint16(6, true);
	const eventCount = view.getUint32(8, true);

	if (version !== 1) {
		errors.push(`Unsupported version ${version} (expected 1)`);
	}
	if (headerSize !== TEL_HEADER_SIZE) {
		errors.push(`Unexpected header size ${headerSize} (expected ${TEL_HEADER_SIZE})`);
	}

	const expectedSize = TEL_HEADER_SIZE + eventCount * TMR_ITEM_SIZE;
	if (bytes.length !== expectedSize) {
		errors.push(
			`File size mismatch for ${eventCount} event items (expected ${expectedSize} bytes, got ${bytes.length})`
		);
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true, file: { eventItems: readEventItems(view, TEL_HEADER_SIZE, eventCount) } };
}

export function writeEventItems(
	view: DataView,
	offset: number,
	eventItems: TmrEventItemRecord[]
): number {
	for (const item of eventItems) {
		for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
			view.setUint8(offset + regIndex, item.psgData[regIndex]! & 0xff);
		}
		offset += AY_REGISTER_COUNT;
		view.setUint16(offset, item.psgMask, true);
		offset += 2;
		view.setUint32(offset, item.timerFrequency, true);
		offset += 4;
		view.setUint16(offset, item.timerEventIndex, true);
		offset += 2;
	}
	return offset;
}

export function readEventItems(
	view: DataView,
	offset: number,
	eventCount: number
): TmrEventItemRecord[] {
	const eventItems: TmrEventItemRecord[] = [];
	for (let itemIndex = 0; itemIndex < eventCount; itemIndex++) {
		const psgData: number[] = [];
		for (let regIndex = 0; regIndex < AY_REGISTER_COUNT; regIndex++) {
			psgData.push(view.getUint8(offset + regIndex));
		}
		offset += AY_REGISTER_COUNT;
		const psgMask = view.getUint16(offset, true);
		offset += 2;
		const timerFrequency = view.getUint32(offset, true);
		offset += 4;
		const timerEventIndex = view.getUint16(offset, true);
		offset += 2;
		eventItems.push({ psgData, psgMask, timerFrequency, timerEventIndex });
	}
	return eventItems;
}
