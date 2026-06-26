export const MAGIC = 'TAYM';
export const MAGIC_BYTES = [0x54, 0x41, 0x59, 0x4d];
export const VERSION = 1;
export const HEADER_SIZE = 16;
export const CHUNK_HEADER_SIZE = 8;

export const CHUNK_ORDER = [
	'TRAK',
	'INFO',
	'CHIP',
	'TIMR',
	'MODS',
	'ACTN',
	'LANE',
	'TLAN',
	'VU08',
	'VU16',
	'VU32'
] as const;

export const CORE_ONCE = [
	'TRAK',
	'CHIP',
	'TIMR',
	'MODS',
	'ACTN',
	'LANE',
	'TLAN',
	'VU08',
	'VU16',
	'VU32'
] as const;

export const NO_LOOP = 0xffffffff;
export const TLAN_NONE = 0xffffffff;
export const TLAN_UNCHANGED = 0xfffffffe;

export const CLOCK_ABS_RATE_HZ = 0;
export const CLOCK_CHIP_PERIOD = 1;
export const CLOCK_MODES = [CLOCK_ABS_RATE_HZ, CLOCK_CHIP_PERIOD];

export const VT_INVALID = 0;
export const VT_U8 = 1;
export const VT_U16 = 2;
export const VT_U32 = 3;
export const VALUE_TYPES = [VT_U8, VT_U16, VT_U32];

export const TM_ABSOLUTE = 0;
export const TM_RELATIVE = 1;
export const TIMING_MODES = [TM_ABSOLUTE, TM_RELATIVE];

export const SRC_INLINE_VALUE = 0;
export const SRC_BIND_LANE = 1;
export const SOURCE_MODES = [SRC_INLINE_VALUE, SRC_BIND_LANE];

export const CMD_EMPTY = 0;
export const CMD_START = 1;
export const CMD_MODULATE = 2;
export const CMD_STOP = 3;
export const COMMANDS = [CMD_EMPTY, CMD_START, CMD_MODULATE, CMD_STOP];

export const CHIP_TYPE_INVALID = 0x00;
export const CHIP_TYPE_AY = 0x01;

export const CHIP_VARIANT_DEFAULT = 0x00;
export const AY_VARIANT_AY = 0x00;
export const AY_VARIANT_YM = 0x01;

export const CHIP_CONFIG_DEFAULT = 0x00000000;

export const AY_CFG_STEREO_MASK = 0x00000007;
export const AY_LAYOUT_MONO = 0x00;
export const AY_LAYOUT_ABC = 0x01;
export const AY_LAYOUT_ACB = 0x02;
export const AY_LAYOUT_BAC = 0x03;
export const AY_LAYOUT_BCA = 0x04;
export const AY_LAYOUT_CAB = 0x05;
export const AY_LAYOUT_CBA = 0x06;
export const AY_LAYOUT_ST_MONO = 0x07;
export const AY_LAYOUTS = [
	AY_LAYOUT_MONO,
	AY_LAYOUT_ABC,
	AY_LAYOUT_ACB,
	AY_LAYOUT_BAC,
	AY_LAYOUT_BCA,
	AY_LAYOUT_CAB,
	AY_LAYOUT_CBA,
	AY_LAYOUT_ST_MONO
];

export function ayStereoLayout(config: number): number {
	return config & AY_CFG_STEREO_MASK;
}

export const TGT_SAMPLE_AMPLITUDE = 0x80;
export const TGT_SAMPLE_INDEX = 0x81;
export const TGT_SAMPLE_RATE = 0x82;

export const AY_TARGET_MAX = 0x0d;
export const AY_R13_SHAPE = 0x0d;

export const TRAK_SIZE = 16;
export const CHIP_SIZE = 32;
export const TIMR_SIZE = 6;
export const MODS_SIZE = 16;
export const ACTN_SIZE = 6;
export const LANE_SIZE = 16;
export const TLAN_SIZE = 16;

export const CHIP_NAME_SIZE = 16;
export const CHIP_TAG_SIZE = 4;

export const FIX16_ONE = 65536;
export const FIX16_MAX = 0xffffffff;

export function toFix16(value: number): number {
	return Math.round(value * FIX16_ONE);
}

export function fromFix16(encoded: number): number {
	return encoded / FIX16_ONE;
}

export function fitsFix16(value: number): boolean {
	const encoded = toFix16(value);
	return encoded >= 0 && encoded <= FIX16_MAX;
}

export const VALUE_TYPE_POOL: Record<number, { tag: string; width: number }> = {
	[VT_U8]: { tag: 'VU08', width: 1 },
	[VT_U16]: { tag: 'VU16', width: 2 },
	[VT_U32]: { tag: 'VU32', width: 4 }
};
