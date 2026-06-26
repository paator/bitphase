import type { Actn, Chip, Lane, Mods, Taym, Timr, Tlan, Trak } from './model';
import * as spec from './spec';

export class TaymCodecError extends Error {}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('ascii');
const utf8Decoder = new TextDecoder('utf-8');

class ByteWriter {
	private chunks: Uint8Array[] = [];
	private length = 0;

	bytes(data: Uint8Array): void {
		this.chunks.push(data);
		this.length += data.length;
	}

	u8(value: number): void {
		this.bytes(new Uint8Array([value & 0xff]));
	}

	u16(value: number): void {
		const buffer = new Uint8Array(2);
		new DataView(buffer.buffer).setUint16(0, value & 0xffff, true);
		this.bytes(buffer);
	}

	u32(value: number): void {
		const buffer = new Uint8Array(4);
		new DataView(buffer.buffer).setUint32(0, value >>> 0, true);
		this.bytes(buffer);
	}

	get size(): number {
		return this.length;
	}

	toUint8Array(): Uint8Array {
		const out = new Uint8Array(this.length);
		let offset = 0;
		for (const chunk of this.chunks) {
			out.set(chunk, offset);
			offset += chunk.length;
		}
		return out;
	}
}

function tagBytes(tag: string): Uint8Array {
	const bytes = textEncoder.encode(tag);
	if (bytes.length !== 4) {
		throw new TaymCodecError(`chunk tag must be 4 ASCII chars: ${tag}`);
	}
	return bytes;
}

function fixedAscii(value: string, size: number): Uint8Array {
	const out = new Uint8Array(size);
	const encoded = textEncoder.encode(value).slice(0, size);
	out.set(encoded);
	return out;
}

function packTrak(trak: Trak, chipCount: number, timerCount: number): Uint8Array {
	const writer = new ByteWriter();
	writer.u32(spec.toFix16(trak.frameRateHz));
	writer.u32(trak.frameCount);
	writer.u32(trak.loopFrame);
	writer.u8(chipCount);
	writer.u8(timerCount);
	writer.u16(0);
	return writer.toUint8Array();
}

function packChip(chip: Chip): Uint8Array {
	const writer = new ByteWriter();
	writer.u32(chip.clockHz);
	writer.u8(chip.chipTypeId);
	writer.u8(chip.variant);
	writer.u16(0);
	writer.bytes(fixedAscii(chip.name, spec.CHIP_NAME_SIZE));
	if (chip.frameDataTag) {
		writer.bytes(tagBytes(chip.frameDataTag));
	} else {
		writer.bytes(new Uint8Array(spec.CHIP_TAG_SIZE));
	}
	writer.u32(chip.config);
	return writer.toUint8Array();
}

function packTimr(timr: Timr): Uint8Array {
	const writer = new ByteWriter();
	writer.u16(timr.clockDivider);
	writer.u8(timr.chipIndex);
	writer.u8(timr.clockMode);
	writer.u16(0);
	return writer.toUint8Array();
}

function packMods(mods: Mods): Uint8Array {
	const writer = new ByteWriter();
	if (mods.command === spec.CMD_EMPTY || mods.command === spec.CMD_STOP) {
		writer.u32(0);
		writer.u32(0);
		writer.u32(0);
		writer.u8(0);
		writer.u8(mods.command);
		writer.u16(0);
		return writer.toUint8Array();
	}
	writer.u32(mods.baseTimerValue);
	writer.u32(mods.timerLaneRef);
	writer.u32(mods.firstAction);
	writer.u8(mods.actionCount);
	writer.u8(mods.command);
	writer.u16(0);
	return writer.toUint8Array();
}

function packActn(actn: Actn): Uint8Array {
	const writer = new ByteWriter();
	writer.u32(actn.operand);
	writer.u8(actn.targetId);
	writer.u8(actn.sourceMode);
	return writer.toUint8Array();
}

function packLane(lane: Lane): Uint8Array {
	const writer = new ByteWriter();
	writer.u32(lane.valueOffset);
	writer.u32(lane.length);
	writer.u32(lane.loopIndex);
	writer.u8(lane.valueType);
	writer.bytes(new Uint8Array(3));
	return writer.toUint8Array();
}

function packTlan(tlan: Tlan): Uint8Array {
	const writer = new ByteWriter();
	writer.u32(tlan.valueOffset);
	writer.u32(tlan.length);
	writer.u32(tlan.loopIndex);
	writer.u8(tlan.timingMode);
	writer.bytes(new Uint8Array(3));
	return writer.toUint8Array();
}

function packInfo(info: Record<string, string>): Uint8Array {
	const entries = Object.entries(info);
	if (entries.length === 0) {
		return new Uint8Array(0);
	}
	const writer = new ByteWriter();
	for (const [key, value] of entries) {
		writer.bytes(textEncoder.encode(`${key}=${value}`));
		writer.u8(0);
	}
	writer.u8(0);
	return writer.toUint8Array();
}

function packPool16(values: number[]): Uint8Array {
	const out = new Uint8Array(values.length * 2);
	const view = new DataView(out.buffer);
	for (let i = 0; i < values.length; i++) {
		view.setUint16(i * 2, values[i] & 0xffff, true);
	}
	return out;
}

function packPool32(values: number[]): Uint8Array {
	const out = new Uint8Array(values.length * 4);
	const view = new DataView(out.buffer);
	for (let i = 0; i < values.length; i++) {
		view.setUint32(i * 4, values[i] >>> 0, true);
	}
	return out;
}

function concatRecords(records: Uint8Array[]): Uint8Array {
	const writer = new ByteWriter();
	for (const record of records) {
		writer.bytes(record);
	}
	return writer.toUint8Array();
}

function chunk(tag: string, payload: Uint8Array): Uint8Array {
	const writer = new ByteWriter();
	writer.bytes(tagBytes(tag));
	writer.u32(payload.length);
	writer.bytes(payload);
	return writer.toUint8Array();
}

export function writeTaym(taym: Taym): ArrayBuffer {
	const payloads: Array<[string, Uint8Array]> = [
		['TRAK', packTrak(taym.trak, taym.chips.length, taym.timers.length)]
	];

	const infoPayload = packInfo(taym.info);
	if (infoPayload.length > 0) {
		payloads.push(['INFO', infoPayload]);
	}

	payloads.push(['CHIP', concatRecords(taym.chips.map(packChip))]);
	payloads.push(['TIMR', concatRecords(taym.timers.map(packTimr))]);
	payloads.push(['MODS', concatRecords(taym.mods.map(packMods))]);
	payloads.push(['ACTN', concatRecords(taym.actions.map(packActn))]);
	payloads.push(['LANE', concatRecords(taym.lanes.map(packLane))]);
	payloads.push(['TLAN', concatRecords(taym.tlanes.map(packTlan))]);
	payloads.push(['VU08', Uint8Array.from(taym.vu08, (value) => value & 0xff)]);
	payloads.push(['VU16', packPool16(taym.vu16)]);
	payloads.push(['VU32', packPool32(taym.vu32)]);

	for (const chip of taym.chips) {
		if (chip.frameDataTag) {
			const payload = taym.frameData[chip.frameDataTag];
			if (!payload) {
				throw new TaymCodecError(
					`chip references frame_data_tag ${chip.frameDataTag} with no payload`
				);
			}
			payloads.push([chip.frameDataTag, payload]);
		}
	}

	const body = new ByteWriter();
	for (const [tag, payload] of payloads) {
		body.bytes(chunk(tag, payload));
	}
	const chunkBytes = body.toUint8Array();

	const out = new ByteWriter();
	out.bytes(tagBytes(spec.MAGIC));
	out.u16(spec.VERSION);
	out.u16(spec.HEADER_SIZE);
	out.u32(taym.flags);
	out.u32(chunkBytes.length);
	out.bytes(chunkBytes);

	const result = out.toUint8Array();
	const buffer = new ArrayBuffer(result.byteLength);
	new Uint8Array(buffer).set(result);
	return buffer;
}

interface SplitResult {
	chunks: Map<string, Uint8Array>;
	version: number;
	flags: number;
}

function splitChunks(data: Uint8Array): SplitResult {
	if (data.length < spec.HEADER_SIZE) {
		throw new TaymCodecError('file shorter than header');
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const magic = textDecoder.decode(data.subarray(0, 4));
	if (magic !== spec.MAGIC) {
		throw new TaymCodecError(`bad magic ${magic}`);
	}
	const version = view.getUint16(4, true);
	const headerSize = view.getUint16(6, true);
	const flags = view.getUint32(8, true);
	const chunkBytes = view.getUint32(12, true);
	if (headerSize !== spec.HEADER_SIZE) {
		throw new TaymCodecError(`bad header_size ${headerSize}`);
	}
	const end = headerSize + chunkBytes;
	if (end !== data.length) {
		throw new TaymCodecError(`chunk_bytes says file ends at ${end}, got ${data.length}`);
	}
	const chunks = new Map<string, Uint8Array>();
	let p = headerSize;
	while (p < end) {
		if (p + spec.CHUNK_HEADER_SIZE > end) {
			throw new TaymCodecError(`truncated chunk header at ${p}`);
		}
		const tag = textDecoder.decode(data.subarray(p, p + 4));
		const size = view.getUint32(p + 4, true);
		p += spec.CHUNK_HEADER_SIZE;
		if (p + size > end) {
			throw new TaymCodecError(`chunk ${tag} payload runs past end`);
		}
		if (chunks.has(tag)) {
			throw new TaymCodecError(`duplicate chunk tag ${tag}`);
		}
		chunks.set(tag, data.subarray(p, p + size));
		p += size;
	}
	return { chunks, version, flags };
}

function records(payload: Uint8Array, stride: number, tag: string): Uint8Array[] {
	if (payload.length % stride !== 0) {
		throw new TaymCodecError(`${tag} size ${payload.length} not a multiple of stride ${stride}`);
	}
	const out: Uint8Array[] = [];
	for (let off = 0; off < payload.length; off += stride) {
		out.push(payload.subarray(off, off + stride));
	}
	return out;
}

function viewOf(record: Uint8Array): DataView {
	return new DataView(record.buffer, record.byteOffset, record.byteLength);
}

function parseInfo(payload: Uint8Array): Record<string, string> {
	const info: Record<string, string> = {};
	if (payload.length === 0) {
		return info;
	}
	let end = payload.length;
	while (end > 0 && payload[end - 1] === 0) {
		end -= 1;
	}
	const text = utf8Decoder.decode(payload.subarray(0, end));
	for (const entry of text.split('\0')) {
		if (!entry) continue;
		const eq = entry.indexOf('=');
		if (eq === -1) {
			info[entry] = '';
		} else {
			info[entry.slice(0, eq)] = entry.slice(eq + 1);
		}
	}
	return info;
}

export function readTaym(data: ArrayBuffer | Uint8Array): Taym {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	const { chunks, flags } = splitChunks(bytes);

	const need = (tag: string): Uint8Array => {
		const payload = chunks.get(tag);
		if (payload === undefined) {
			throw new TaymCodecError(`missing core chunk ${tag}`);
		}
		return payload;
	};

	const trakView = viewOf(need('TRAK'));
	const trak: Trak = {
		frameRateHz: spec.fromFix16(trakView.getUint32(0, true)),
		frameCount: trakView.getUint32(4, true),
		loopFrame: trakView.getUint32(8, true)
	};

	const chips: Chip[] = records(need('CHIP'), spec.CHIP_SIZE, 'CHIP').map((record) => {
		const recordView = viewOf(record);
		const name = textDecoder.decode(record.subarray(8, 24)).split('\0', 1)[0];
		const tagBytesRaw = record.subarray(24, 28);
		const frameDataTag = tagBytesRaw.every((value) => value === 0)
			? ''
			: textDecoder.decode(tagBytesRaw);
		return {
			clockHz: recordView.getUint32(0, true),
			chipTypeId: recordView.getUint8(4),
			variant: recordView.getUint8(5),
			name,
			frameDataTag,
			config: recordView.getUint32(28, true)
		};
	});

	const timers: Timr[] = records(need('TIMR'), spec.TIMR_SIZE, 'TIMR').map((record) => {
		const recordView = viewOf(record);
		return {
			clockDivider: recordView.getUint16(0, true),
			chipIndex: recordView.getUint8(2),
			clockMode: recordView.getUint8(3)
		};
	});

	const mods: Mods[] = records(need('MODS'), spec.MODS_SIZE, 'MODS').map((record) => {
		const recordView = viewOf(record);
		return {
			baseTimerValue: recordView.getUint32(0, true),
			timerLaneRef: recordView.getUint32(4, true),
			firstAction: recordView.getUint32(8, true),
			actionCount: recordView.getUint8(12),
			command: recordView.getUint8(13)
		};
	});

	const actions: Actn[] = records(need('ACTN'), spec.ACTN_SIZE, 'ACTN').map((record) => {
		const recordView = viewOf(record);
		return {
			operand: recordView.getUint32(0, true),
			targetId: recordView.getUint8(4),
			sourceMode: recordView.getUint8(5)
		};
	});

	const lanes: Lane[] = records(need('LANE'), spec.LANE_SIZE, 'LANE').map((record) => {
		const recordView = viewOf(record);
		return {
			valueOffset: recordView.getUint32(0, true),
			length: recordView.getUint32(4, true),
			loopIndex: recordView.getUint32(8, true),
			valueType: recordView.getUint8(12)
		};
	});

	const tlanes: Tlan[] = records(need('TLAN'), spec.TLAN_SIZE, 'TLAN').map((record) => {
		const recordView = viewOf(record);
		return {
			valueOffset: recordView.getUint32(0, true),
			length: recordView.getUint32(4, true),
			loopIndex: recordView.getUint32(8, true),
			timingMode: recordView.getUint8(12)
		};
	});

	const vu08 = Array.from(need('VU08'));
	const p16 = need('VU16');
	if (p16.length % 2 !== 0) {
		throw new TaymCodecError('VU16 size not a multiple of 2');
	}
	const p16View = viewOf(p16);
	const vu16: number[] = [];
	for (let i = 0; i < p16.length; i += 2) {
		vu16.push(p16View.getUint16(i, true));
	}
	const p32 = need('VU32');
	if (p32.length % 4 !== 0) {
		throw new TaymCodecError('VU32 size not a multiple of 4');
	}
	const p32View = viewOf(p32);
	const vu32: number[] = [];
	for (let i = 0; i < p32.length; i += 4) {
		vu32.push(p32View.getUint32(i, true));
	}

	const info = parseInfo(chunks.get('INFO') ?? new Uint8Array(0));

	const core = new Set<string>([...spec.CORE_ONCE, 'INFO']);
	const frameData: Record<string, Uint8Array> = {};
	for (const [tag, payload] of chunks) {
		if (!core.has(tag)) {
			frameData[tag] = payload;
		}
	}

	return {
		trak,
		chips,
		timers,
		mods,
		actions,
		lanes,
		tlanes,
		vu08,
		vu16,
		vu32,
		info,
		frameData,
		flags
	};
}
