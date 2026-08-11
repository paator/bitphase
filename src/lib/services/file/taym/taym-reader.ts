import {
	TAYM_CHIP_NAME_LENGTH,
	TAYM_CHUNK_HEADER_SIZE,
	TAYM_CORE_TAGS,
	TAYM_HEADER_SIZE,
	TAYM_MAGIC,
	TAYM_NONE_INDEX,
	TAYM_RECORD_SIZE,
	TAYM_RESERVED_TAGS,
	TAYM_TAG,
	TAYM_UNCHANGED_INDEX,
	TAYM_VERSION,
	TaymClockMode,
	TaymCommand,
	TaymFormatError,
	TaymSourceMode,
	TaymTimingMode,
	TaymValueType,
	decodeFixed16,
	isValidTagText
} from './taym-spec';
import type {
	TaymAction,
	TaymChip,
	TaymFile,
	TaymMod,
	TaymTimer,
	TaymTimerLane,
	TaymTrack,
	TaymValueLane
} from './taym-types';

type ChunkLocation = {
	offset: number;
	size: number;
};

export function hasTaymMagic(buffer: ArrayBuffer): boolean {
	if (buffer.byteLength < TAYM_HEADER_SIZE) {
		return false;
	}
	return readAscii(new Uint8Array(buffer), 0, TAYM_MAGIC.length) === TAYM_MAGIC;
}

export function readTaymFile(buffer: ArrayBuffer): TaymFile {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const chunks = readChunkTable(view, bytes);

	const track = readTrack(view, requireChunk(chunks, TAYM_TAG.track));
	const chips = readChips(view, bytes, requireChunk(chunks, TAYM_TAG.chip), track, chunks);
	const timers = readTimers(view, requireChunk(chunks, TAYM_TAG.timer), track, chips);
	const pool8 = readPool(view, requireChunk(chunks, TAYM_TAG.pool8), 1);
	const pool16 = readPool(view, requireChunk(chunks, TAYM_TAG.pool16), 2);
	const pool32 = readPool(view, requireChunk(chunks, TAYM_TAG.pool32), 4);
	const lanes = readValueLanes(view, requireChunk(chunks, TAYM_TAG.lanes), pool8, pool16, pool32);
	const timerLanes = readTimerLanes(view, requireChunk(chunks, TAYM_TAG.timerLanes), pool32);
	const actions = readActions(view, requireChunk(chunks, TAYM_TAG.actions), lanes.length);
	const mods = readMods(
		view,
		requireChunk(chunks, TAYM_TAG.mods),
		track,
		actions,
		timerLanes.length
	);
	const info = chunks.has(TAYM_TAG.info) ? readInfo(bytes, chunks.get(TAYM_TAG.info)!) : {};
	const frameData = collectFrameData(bytes, chunks, chips);

	return { track, info, chips, timers, mods, actions, lanes, timerLanes, frameData };
}

function readChunkTable(view: DataView, bytes: Uint8Array): Map<string, ChunkLocation> {
	if (view.byteLength < TAYM_HEADER_SIZE) {
		throw new TaymFormatError('File is smaller than the 16-byte TAYM header');
	}
	if (readAscii(bytes, 0, 4) !== TAYM_MAGIC) {
		throw new TaymFormatError('Missing TAYM magic');
	}
	const version = view.getUint16(4, true);
	if (version !== TAYM_VERSION) {
		throw new TaymFormatError(`Unsupported TAYM version ${version}`);
	}
	const headerSize = view.getUint16(6, true);
	if (headerSize !== TAYM_HEADER_SIZE) {
		throw new TaymFormatError(`Unsupported TAYM header size ${headerSize}`);
	}
	const flags = view.getUint32(8, true);
	if (flags !== 0) {
		throw new TaymFormatError('TAYM header flags must be zero in version 1');
	}
	const chunkBytes = view.getUint32(12, true);
	if (chunkBytes === 0) {
		throw new TaymFormatError('TAYM chunk stream is empty');
	}
	const chunkEnd = TAYM_HEADER_SIZE + chunkBytes;
	if (chunkEnd > view.byteLength) {
		throw new TaymFormatError('TAYM chunk stream extends past the end of the file');
	}
	if (chunkEnd < view.byteLength) {
		throw new TaymFormatError('Trailing bytes after the TAYM chunk stream');
	}

	const chunks = new Map<string, ChunkLocation>();
	let offset = TAYM_HEADER_SIZE;
	while (offset < chunkEnd) {
		if (offset + TAYM_CHUNK_HEADER_SIZE > chunkEnd) {
			throw new TaymFormatError('Truncated chunk header');
		}
		const tag = readAscii(bytes, offset, 4);
		if (!isValidTagText(tag)) {
			throw new TaymFormatError(`Invalid chunk tag at offset ${offset}`);
		}
		const size = view.getUint32(offset + 4, true);
		const payload = offset + TAYM_CHUNK_HEADER_SIZE;
		if (payload + size > chunkEnd) {
			throw new TaymFormatError(`Chunk ${tag} extends past the chunk stream`);
		}
		if (chunks.has(tag)) {
			throw new TaymFormatError(`Duplicate chunk tag ${tag}`);
		}
		chunks.set(tag, { offset: payload, size });
		offset = payload + size;
	}

	for (const tag of TAYM_CORE_TAGS) {
		if (!chunks.has(tag)) {
			throw new TaymFormatError(`Missing required chunk ${tag}`);
		}
	}

	return chunks;
}

function requireChunk(chunks: Map<string, ChunkLocation>, tag: string): ChunkLocation {
	const chunk = chunks.get(tag);
	if (!chunk) {
		throw new TaymFormatError(`Missing required chunk ${tag}`);
	}
	return chunk;
}

function readTrack(view: DataView, chunk: ChunkLocation): TaymTrack {
	if (chunk.size !== TAYM_RECORD_SIZE.track) {
		throw new TaymFormatError('TRAK must contain exactly one 16-byte record');
	}
	const frameRateRaw = view.getUint32(chunk.offset, true);
	if (frameRateRaw === 0) {
		throw new TaymFormatError('TRAK frame rate must be nonzero');
	}
	const frameCount = view.getUint32(chunk.offset + 4, true);
	if (frameCount === 0) {
		throw new TaymFormatError('TRAK frame count must be nonzero');
	}
	const loopFrameRaw = view.getUint32(chunk.offset + 8, true);
	if (loopFrameRaw !== TAYM_NONE_INDEX && loopFrameRaw >= frameCount) {
		throw new TaymFormatError('TRAK loop frame is outside the track');
	}
	requireZero(view, chunk.offset + 14, 2, 'TRAK reserved field');

	return {
		frameRateHz: decodeFixed16(frameRateRaw),
		frameCount,
		loopFrame: loopFrameRaw === TAYM_NONE_INDEX ? null : loopFrameRaw,
		chipCount: view.getUint8(chunk.offset + 12),
		timerCount: view.getUint8(chunk.offset + 13)
	};
}

function readChips(
	view: DataView,
	bytes: Uint8Array,
	chunk: ChunkLocation,
	track: TaymTrack,
	chunks: Map<string, ChunkLocation>
): TaymChip[] {
	requireRecordCount(chunk, TAYM_RECORD_SIZE.chip, track.chipCount, TAYM_TAG.chip);

	const chips: TaymChip[] = [];
	const usedTags = new Set<string>();
	for (let index = 0; index < track.chipCount; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.chip;
		requireZero(view, offset + 6, 2, `CHIP[${index}] reserved field`);
		const chipTypeId = view.getUint8(offset + 4);
		if (chipTypeId === 0) {
			throw new TaymFormatError(`CHIP[${index}] has an invalid chip type id`);
		}
		const tagBytes = bytes.subarray(offset + 24, offset + 28);
		let frameDataTag: string | null = null;
		if (tagBytes.some((value) => value !== 0)) {
			frameDataTag = readAscii(bytes, offset + 24, 4);
			if (!isValidTagText(frameDataTag)) {
				throw new TaymFormatError(`CHIP[${index}] has an invalid frame data tag`);
			}
			if ((TAYM_RESERVED_TAGS as readonly string[]).includes(frameDataTag)) {
				throw new TaymFormatError(
					`CHIP[${index}] frame data tag ${frameDataTag} collides with a core chunk`
				);
			}
			if (usedTags.has(frameDataTag)) {
				throw new TaymFormatError(`Repeated frame data tag ${frameDataTag}`);
			}
			usedTags.add(frameDataTag);
		}

		chips.push({
			clockHz: view.getUint32(offset, true),
			chipTypeId,
			variant: view.getUint8(offset + 5),
			name: readChipName(bytes, offset + 8),
			frameDataTag,
			config: view.getUint32(offset + 28, true)
		});
	}
	return chips;
}

function readChipName(bytes: Uint8Array, offset: number): string {
	const raw = readAscii(bytes, offset, TAYM_CHIP_NAME_LENGTH);
	const terminated = raw.split('\0')[0] ?? '';
	return terminated.trim();
}

function readTimers(
	view: DataView,
	chunk: ChunkLocation,
	track: TaymTrack,
	chips: TaymChip[]
): TaymTimer[] {
	requireRecordCount(chunk, TAYM_RECORD_SIZE.timer, track.timerCount, TAYM_TAG.timer);

	const timers: TaymTimer[] = [];
	for (let index = 0; index < track.timerCount; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.timer;
		requireZero(view, offset + 4, 2, `TIMR[${index}] reserved field`);
		const clockDivider = view.getUint16(offset, true);
		const chipIndex = view.getUint8(offset + 2);
		const clockMode = view.getUint8(offset + 3);
		if (chipIndex >= chips.length) {
			throw new TaymFormatError(`TIMR[${index}] references chip ${chipIndex} out of range`);
		}
		if (clockMode !== TaymClockMode.AbsRateHz && clockMode !== TaymClockMode.ChipPeriod) {
			throw new TaymFormatError(`TIMR[${index}] has an unsupported clock mode ${clockMode}`);
		}
		if (clockMode === TaymClockMode.AbsRateHz && clockDivider !== 0) {
			throw new TaymFormatError(
				`TIMR[${index}] must have a zero divider in ABS_RATE_HZ mode`
			);
		}
		if (clockMode === TaymClockMode.ChipPeriod) {
			if (clockDivider === 0) {
				throw new TaymFormatError(
					`TIMR[${index}] must have a nonzero divider in CHIP_PERIOD mode`
				);
			}
			if (chips[chipIndex]!.clockHz === 0) {
				throw new TaymFormatError(
					`TIMR[${index}] uses CHIP_PERIOD but its chip has a zero clock`
				);
			}
		}
		timers.push({ clockDivider, chipIndex, clockMode });
	}
	return timers;
}

function readPool(view: DataView, chunk: ChunkLocation, elementSize: number): number[] {
	if (chunk.size % elementSize !== 0) {
		throw new TaymFormatError('Value pool size is not a multiple of its element size');
	}
	const count = chunk.size / elementSize;
	const values: number[] = new Array(count);
	for (let index = 0; index < count; index++) {
		const offset = chunk.offset + index * elementSize;
		values[index] =
			elementSize === 1
				? view.getUint8(offset)
				: elementSize === 2
					? view.getUint16(offset, true)
					: view.getUint32(offset, true);
	}
	return values;
}

function readValueLanes(
	view: DataView,
	chunk: ChunkLocation,
	pool8: number[],
	pool16: number[],
	pool32: number[]
): TaymValueLane[] {
	requireStride(chunk, TAYM_RECORD_SIZE.lane, TAYM_TAG.lanes);

	const lanes: TaymValueLane[] = [];
	const count = chunk.size / TAYM_RECORD_SIZE.lane;
	for (let index = 0; index < count; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.lane;
		requireZero(view, offset + 13, 3, `LANE[${index}] reserved field`);
		const valueType = view.getUint8(offset + 12);
		if (
			valueType !== TaymValueType.U8 &&
			valueType !== TaymValueType.U16 &&
			valueType !== TaymValueType.U32
		) {
			throw new TaymFormatError(`LANE[${index}] has an unsupported value type ${valueType}`);
		}
		const pool =
			valueType === TaymValueType.U8
				? pool8
				: valueType === TaymValueType.U16
					? pool16
					: pool32;
		const { valueOffset, length, loopIndex } = readLaneSlice(
			view,
			offset,
			pool,
			`LANE[${index}]`
		);
		lanes.push({
			valueOffset,
			length,
			loopIndex,
			valueType,
			values: pool.slice(valueOffset, valueOffset + length)
		});
	}
	return lanes;
}

function readTimerLanes(view: DataView, chunk: ChunkLocation, pool32: number[]): TaymTimerLane[] {
	requireStride(chunk, TAYM_RECORD_SIZE.timerLane, TAYM_TAG.timerLanes);

	const lanes: TaymTimerLane[] = [];
	const count = chunk.size / TAYM_RECORD_SIZE.timerLane;
	for (let index = 0; index < count; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.timerLane;
		requireZero(view, offset + 13, 3, `TLAN[${index}] reserved field`);
		const timingMode = view.getUint8(offset + 12);
		if (timingMode !== TaymTimingMode.Absolute && timingMode !== TaymTimingMode.Relative) {
			throw new TaymFormatError(
				`TLAN[${index}] has an unsupported timing mode ${timingMode}`
			);
		}
		const { valueOffset, length, loopIndex } = readLaneSlice(
			view,
			offset,
			pool32,
			`TLAN[${index}]`
		);
		const values = pool32.slice(valueOffset, valueOffset + length);
		if (values.some((value) => value === 0)) {
			throw new TaymFormatError(`TLAN[${index}] contains a zero interval`);
		}
		lanes.push({ valueOffset, length, loopIndex, timingMode, values });
	}
	return lanes;
}

function readLaneSlice(
	view: DataView,
	offset: number,
	pool: number[],
	label: string
): { valueOffset: number; length: number; loopIndex: number | null } {
	const valueOffset = view.getUint32(offset, true);
	const length = view.getUint32(offset + 4, true);
	const loopRaw = view.getUint32(offset + 8, true);
	if (length === 0) {
		throw new TaymFormatError(`${label} has a zero length`);
	}
	if (valueOffset + length > pool.length) {
		throw new TaymFormatError(`${label} slice is outside its value pool`);
	}
	if (loopRaw !== TAYM_NONE_INDEX && loopRaw >= length) {
		throw new TaymFormatError(`${label} has an out-of-range loop index`);
	}
	return {
		valueOffset,
		length,
		loopIndex: loopRaw === TAYM_NONE_INDEX ? null : loopRaw
	};
}

function readActions(view: DataView, chunk: ChunkLocation, laneCount: number): TaymAction[] {
	requireStride(chunk, TAYM_RECORD_SIZE.action, TAYM_TAG.actions);

	const actions: TaymAction[] = [];
	const count = chunk.size / TAYM_RECORD_SIZE.action;
	for (let index = 0; index < count; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.action;
		const operand = view.getUint32(offset, true);
		const targetId = view.getUint8(offset + 4);
		const sourceMode = view.getUint8(offset + 5);
		if (sourceMode !== TaymSourceMode.InlineValue && sourceMode !== TaymSourceMode.BindLane) {
			throw new TaymFormatError(
				`ACTN[${index}] has an unsupported source mode ${sourceMode}`
			);
		}
		if (sourceMode === TaymSourceMode.BindLane && operand >= laneCount) {
			throw new TaymFormatError(`ACTN[${index}] binds lane ${operand} out of range`);
		}
		actions.push({ operand, targetId, sourceMode });
	}
	return actions;
}

function readMods(
	view: DataView,
	chunk: ChunkLocation,
	track: TaymTrack,
	actions: TaymAction[],
	timerLaneCount: number
): TaymMod[] {
	const expected = track.frameCount * track.timerCount;
	requireRecordCount(chunk, TAYM_RECORD_SIZE.mods, expected, TAYM_TAG.mods);

	const mods: TaymMod[] = new Array(expected);
	for (let index = 0; index < expected; index++) {
		const offset = chunk.offset + index * TAYM_RECORD_SIZE.mods;
		requireZero(view, offset + 14, 2, `MODS[${index}] reserved field`);
		const command = view.getUint8(offset + 13);
		if (
			command !== TaymCommand.Empty &&
			command !== TaymCommand.Start &&
			command !== TaymCommand.Modulate &&
			command !== TaymCommand.Stop
		) {
			throw new TaymFormatError(`MODS[${index}] has an unsupported command ${command}`);
		}

		if (command === TaymCommand.Empty || command === TaymCommand.Stop) {
			mods[index] = {
				baseTimerValue: 0,
				timerLaneRef: null,
				firstAction: 0,
				actionCount: 0,
				command
			};
			continue;
		}

		const baseTimerValue = view.getUint32(offset, true);
		const timerLaneRaw = view.getUint32(offset + 4, true);
		const firstAction = view.getUint32(offset + 8, true);
		const actionCount = view.getUint8(offset + 12);

		if (command === TaymCommand.Start) {
			if (baseTimerValue === 0) {
				throw new TaymFormatError(`MODS[${index}] START has a zero base timer value`);
			}
			if (timerLaneRaw === TAYM_UNCHANGED_INDEX) {
				throw new TaymFormatError(
					`MODS[${index}] START cannot use an UNCHANGED timer lane`
				);
			}
			if (actionCount === 0) {
				throw new TaymFormatError(`MODS[${index}] START has no target actions`);
			}
		}
		if (
			timerLaneRaw !== TAYM_NONE_INDEX &&
			timerLaneRaw !== TAYM_UNCHANGED_INDEX &&
			timerLaneRaw >= timerLaneCount
		) {
			throw new TaymFormatError(
				`MODS[${index}] references timer lane ${timerLaneRaw} out of range`
			);
		}
		if (actionCount > 0 && firstAction + actionCount > actions.length) {
			throw new TaymFormatError(`MODS[${index}] action slice is out of range`);
		}
		if (actionCount === 0 && firstAction !== 0) {
			throw new TaymFormatError(
				`MODS[${index}] has an empty action slice with a nonzero index`
			);
		}
		requireSortedTargets(actions, firstAction, actionCount, index);

		mods[index] = {
			baseTimerValue,
			timerLaneRef:
				timerLaneRaw === TAYM_NONE_INDEX
					? null
					: timerLaneRaw === TAYM_UNCHANGED_INDEX
						? 'unchanged'
						: timerLaneRaw,
			firstAction,
			actionCount,
			command
		};
	}
	return mods;
}

function requireSortedTargets(
	actions: TaymAction[],
	firstAction: number,
	actionCount: number,
	modIndex: number
): void {
	for (let offset = 1; offset < actionCount; offset++) {
		const previous = actions[firstAction + offset - 1]!.targetId;
		const current = actions[firstAction + offset]!.targetId;
		if (current <= previous) {
			throw new TaymFormatError(
				`MODS[${modIndex}] action slice targets are unsorted or duplicated`
			);
		}
	}
}

function readInfo(bytes: Uint8Array, chunk: ChunkLocation): Record<string, string> {
	const text = new TextDecoder().decode(bytes.subarray(chunk.offset, chunk.offset + chunk.size));
	const info: Record<string, string> = {};
	for (const entry of text.split('\0')) {
		if (!entry) continue;
		const separator = entry.indexOf('=');
		if (separator <= 0) continue;
		info[entry.slice(0, separator)] = entry.slice(separator + 1);
	}
	return info;
}

function collectFrameData(
	bytes: Uint8Array,
	chunks: Map<string, ChunkLocation>,
	chips: TaymChip[]
): Map<string, Uint8Array> {
	const frameData = new Map<string, Uint8Array>();
	for (const chip of chips) {
		if (!chip.frameDataTag) continue;
		const chunk = chunks.get(chip.frameDataTag);
		if (!chunk) continue;
		frameData.set(chip.frameDataTag, bytes.subarray(chunk.offset, chunk.offset + chunk.size));
	}
	return frameData;
}

function requireRecordCount(
	chunk: ChunkLocation,
	stride: number,
	count: number,
	tag: string
): void {
	if (chunk.size !== stride * count) {
		throw new TaymFormatError(`${tag} size does not match the record count declared in TRAK`);
	}
}

function requireStride(chunk: ChunkLocation, stride: number, tag: string): void {
	if (chunk.size % stride !== 0) {
		throw new TaymFormatError(`${tag} size is not a multiple of its ${stride}-byte stride`);
	}
}

function requireZero(view: DataView, offset: number, length: number, label: string): void {
	for (let index = 0; index < length; index++) {
		if (view.getUint8(offset + index) !== 0) {
			throw new TaymFormatError(`${label} must be zero`);
		}
	}
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	let text = '';
	for (let index = 0; index < length; index++) {
		text += String.fromCharCode(bytes[offset + index] ?? 0);
	}
	return text;
}
