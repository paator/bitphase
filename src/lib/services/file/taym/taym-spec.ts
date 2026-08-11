export const TAYM_MAGIC = 'TAYM';
export const TAYM_VERSION = 1;
export const TAYM_HEADER_SIZE = 16;
export const TAYM_CHUNK_HEADER_SIZE = 8;
export const TAYM_FIXED_POINT_SCALE = 0x10000;

export const TAYM_TAG = {
	track: 'TRAK',
	info: 'INFO',
	chip: 'CHIP',
	timer: 'TIMR',
	mods: 'MODS',
	actions: 'ACTN',
	lanes: 'LANE',
	timerLanes: 'TLAN',
	pool8: 'VU08',
	pool16: 'VU16',
	pool32: 'VU32'
} as const;

export const TAYM_CORE_TAGS = [
	TAYM_TAG.track,
	TAYM_TAG.chip,
	TAYM_TAG.timer,
	TAYM_TAG.mods,
	TAYM_TAG.actions,
	TAYM_TAG.lanes,
	TAYM_TAG.timerLanes,
	TAYM_TAG.pool8,
	TAYM_TAG.pool16,
	TAYM_TAG.pool32
] as const;

export const TAYM_RESERVED_TAGS = [...TAYM_CORE_TAGS, TAYM_TAG.info] as const;

export const TAYM_RECORD_SIZE = {
	track: 16,
	chip: 32,
	timer: 6,
	mods: 16,
	action: 6,
	lane: 16,
	timerLane: 16
} as const;

export const TAYM_CHIP_NAME_LENGTH = 16;

export const TAYM_NONE_INDEX = 0xffffffff;
export const TAYM_UNCHANGED_INDEX = 0xfffffffe;

export const TaymClockMode = {
	AbsRateHz: 0,
	ChipPeriod: 1
} as const;
export type TaymClockMode = (typeof TaymClockMode)[keyof typeof TaymClockMode];

export const TaymValueType = {
	U8: 1,
	U16: 2,
	U32: 3
} as const;
export type TaymValueType = (typeof TaymValueType)[keyof typeof TaymValueType];

export const TaymTimingMode = {
	Absolute: 0,
	Relative: 1
} as const;
export type TaymTimingMode = (typeof TaymTimingMode)[keyof typeof TaymTimingMode];

export const TaymSourceMode = {
	InlineValue: 0,
	BindLane: 1
} as const;
export type TaymSourceMode = (typeof TaymSourceMode)[keyof typeof TaymSourceMode];

export const TaymCommand = {
	Empty: 0,
	Start: 1,
	Modulate: 2,
	Stop: 3
} as const;
export type TaymCommand = (typeof TaymCommand)[keyof typeof TaymCommand];

export const TAYM_CHIP_TYPE_AY = 0x01;

export const TAYM_HARDWARE_TARGET_MAX = 0x7f;
export const TAYM_FORMAT_VIRTUAL_TARGET_MIN = 0x80;
export const TAYM_FORMAT_VIRTUAL_TARGET_MAX = 0xbf;

export class TaymFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TaymFormatError';
	}
}

export function decodeFixed16(raw: number): number {
	return raw / TAYM_FIXED_POINT_SCALE;
}

export function isValidTagText(tag: string): boolean {
	return /^[A-Z0-9]{4}$/.test(tag);
}
