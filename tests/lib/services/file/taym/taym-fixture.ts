import {
	TAYM_CHIP_TYPE_AY,
	TAYM_FIXED_POINT_SCALE,
	TAYM_HEADER_SIZE,
	TAYM_NONE_INDEX,
	TAYM_RECORD_SIZE,
	TaymClockMode,
	TaymCommand,
	TaymSourceMode,
	TaymTimingMode,
	TaymValueType
} from '@/lib/services/file/taym/taym-spec';

export const FIXTURE_CLOCK_HZ = 1_750_000;
export const FIXTURE_FRAME_COUNT = 8;
export const FIXTURE_FRAME_RATE_HZ = 50;

export const FIXTURE_TONE_A = 418;
export const FIXTURE_TONE_C = 211;
export const FIXTURE_AMPLITUDE_C = 10;

export const FIXTURE_SID_PERIOD = 418;
export const FIXTURE_SID_HIGH_PERIOD = 627;
export const FIXTURE_SID_LOW_PERIOD = 209;
export const FIXTURE_SID_PEAK = 12;
export const FIXTURE_SID_LANE = [FIXTURE_SID_PEAK, 0];

export const FIXTURE_DRUM_RATE_HZ = 6000;
export const FIXTURE_DRUM_LANE = [
	15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3,
	3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0
];

const AY_TARGET_AMPLITUDE_A = 0x08;
const AY_TARGET_AMPLITUDE_B = 0x09;

type Chunk = { tag: string; payload: Uint8Array };

function fixed16(value: number): number {
	return Math.round(value * TAYM_FIXED_POINT_SCALE);
}

function record(size: number, write: (view: DataView, bytes: Uint8Array) => void): Uint8Array {
	const bytes = new Uint8Array(size);
	write(new DataView(bytes.buffer), bytes);
	return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function ascii(text: string, length: number): Uint8Array {
	const out = new Uint8Array(length);
	for (let index = 0; index < Math.min(text.length, length); index++) {
		out[index] = text.charCodeAt(index);
	}
	return out;
}

function trackChunk(): Uint8Array {
	return record(TAYM_RECORD_SIZE.track, (view) => {
		view.setUint32(0, fixed16(FIXTURE_FRAME_RATE_HZ), true);
		view.setUint32(4, FIXTURE_FRAME_COUNT, true);
		view.setUint32(8, TAYM_NONE_INDEX, true);
		view.setUint8(12, 1);
		view.setUint8(13, 2);
	});
}

function chipChunk(): Uint8Array {
	return record(TAYM_RECORD_SIZE.chip, (view, bytes) => {
		view.setUint32(0, FIXTURE_CLOCK_HZ, true);
		view.setUint8(4, TAYM_CHIP_TYPE_AY);
		view.setUint8(5, 0);
		bytes.set(ascii('AY', 16), 8);
		bytes.set(ascii('PSG0', 4), 24);
		view.setUint32(28, 0, true);
	});
}

function timerChunk(): Uint8Array {
	const sidTimer = record(TAYM_RECORD_SIZE.timer, (view) => {
		view.setUint16(0, 8, true);
		view.setUint8(2, 0);
		view.setUint8(3, TaymClockMode.ChipPeriod);
	});
	const drumTimer = record(TAYM_RECORD_SIZE.timer, (view) => {
		view.setUint16(0, 0, true);
		view.setUint8(2, 0);
		view.setUint8(3, TaymClockMode.AbsRateHz);
	});
	return concat([sidTimer, drumTimer]);
}

function modsChunk(): Uint8Array {
	const empty = () =>
		record(TAYM_RECORD_SIZE.mods, (view) => {
			view.setUint8(13, TaymCommand.Empty);
		});
	const start = (baseValue: number, timerLaneRef: number, firstAction: number) =>
		record(TAYM_RECORD_SIZE.mods, (view) => {
			view.setUint32(0, baseValue, true);
			view.setUint32(4, timerLaneRef, true);
			view.setUint32(8, firstAction, true);
			view.setUint8(12, 1);
			view.setUint8(13, TaymCommand.Start);
		});

	const records: Uint8Array[] = [];
	for (let frame = 0; frame < FIXTURE_FRAME_COUNT; frame++) {
		if (frame === 0) {
			records.push(start(FIXTURE_SID_PERIOD, 0, 0));
			records.push(start(fixed16(FIXTURE_DRUM_RATE_HZ), TAYM_NONE_INDEX, 1));
			continue;
		}
		records.push(empty());
		records.push(empty());
	}
	return concat(records);
}

function actionsChunk(): Uint8Array {
	const action = (targetId: number, laneIndex: number) =>
		record(TAYM_RECORD_SIZE.action, (view) => {
			view.setUint32(0, laneIndex, true);
			view.setUint8(4, targetId);
			view.setUint8(5, TaymSourceMode.BindLane);
		});
	return concat([action(AY_TARGET_AMPLITUDE_A, 0), action(AY_TARGET_AMPLITUDE_B, 1)]);
}

function lanesChunk(): Uint8Array {
	const lane = (valueOffset: number, length: number, loopIndex: number) =>
		record(TAYM_RECORD_SIZE.lane, (view) => {
			view.setUint32(0, valueOffset, true);
			view.setUint32(4, length, true);
			view.setUint32(8, loopIndex, true);
			view.setUint8(12, TaymValueType.U8);
		});
	return concat([
		lane(0, FIXTURE_SID_LANE.length, 0),
		lane(FIXTURE_SID_LANE.length, FIXTURE_DRUM_LANE.length, TAYM_NONE_INDEX)
	]);
}

function timerLanesChunk(): Uint8Array {
	return record(TAYM_RECORD_SIZE.timerLane, (view) => {
		view.setUint32(0, 0, true);
		view.setUint32(4, 2, true);
		view.setUint32(8, 0, true);
		view.setUint8(12, TaymTimingMode.Absolute);
	});
}

function pool8(): Uint8Array {
	return new Uint8Array([...FIXTURE_SID_LANE, ...FIXTURE_DRUM_LANE]);
}

function pool32(): Uint8Array {
	const values = [FIXTURE_SID_HIGH_PERIOD, FIXTURE_SID_LOW_PERIOD];
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	values.forEach((value, index) => view.setUint32(index * 4, value, true));
	return bytes;
}

function psgChunk(): Uint8Array {
	const registers = [
		FIXTURE_TONE_A & 0xff,
		(FIXTURE_TONE_A >> 8) & 0x0f,
		0,
		0,
		FIXTURE_TONE_C & 0xff,
		(FIXTURE_TONE_C >> 8) & 0x0f,
		0,
		0b111010,
		0,
		0,
		FIXTURE_AMPLITUDE_C,
		0,
		0,
		0xff
	];
	const out: number[] = [...ascii('PSG', 3), 0x1a, ...new Array(12).fill(0), 0xff];
	registers.forEach((value, index) => out.push(index, value & 0xff));
	out.push(0xfe, FIXTURE_FRAME_COUNT - 1, 0xfd);
	return new Uint8Array(out);
}

function chunk({ tag, payload }: Chunk): Uint8Array {
	const header = record(8, (view, bytes) => {
		bytes.set(ascii(tag, 4), 0);
		view.setUint32(4, payload.length, true);
	});
	return concat([header, payload]);
}

export function buildTaymFixture(): ArrayBuffer {
	const chunks = concat(
		[
			{ tag: 'TRAK', payload: trackChunk() },
			{ tag: 'CHIP', payload: chipChunk() },
			{ tag: 'TIMR', payload: timerChunk() },
			{ tag: 'MODS', payload: modsChunk() },
			{ tag: 'ACTN', payload: actionsChunk() },
			{ tag: 'LANE', payload: lanesChunk() },
			{ tag: 'TLAN', payload: timerLanesChunk() },
			{ tag: 'VU08', payload: pool8() },
			{ tag: 'VU16', payload: new Uint8Array(0) },
			{ tag: 'VU32', payload: pool32() },
			{ tag: 'PSG0', payload: psgChunk() }
		].map(chunk)
	);

	const header = record(TAYM_HEADER_SIZE, (view, bytes) => {
		bytes.set(ascii('TAYM', 4), 0);
		view.setUint16(4, 1, true);
		view.setUint16(6, TAYM_HEADER_SIZE, true);
		view.setUint32(8, 0, true);
		view.setUint32(12, chunks.length, true);
	});

	const file = concat([header, chunks]);
	return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
