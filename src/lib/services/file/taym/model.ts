import {
	CHIP_CONFIG_DEFAULT,
	CHIP_TYPE_AY,
	CHIP_VARIANT_DEFAULT,
	CLOCK_ABS_RATE_HZ,
	NO_LOOP,
	TLAN_NONE,
	VT_U8,
	VT_U16,
	VT_U32
} from './spec';

export interface Trak {
	frameRateHz: number;
	frameCount: number;
	loopFrame: number;
}

export interface Chip {
	clockHz: number;
	chipTypeId: number;
	name: string;
	frameDataTag: string;
	variant: number;
	config: number;
}

export interface Timr {
	chipIndex: number;
	clockMode: number;
	clockDivider: number;
}

export interface Actn {
	targetId: number;
	sourceMode: number;
	operand: number;
}

export interface Lane {
	valueType: number;
	valueOffset: number;
	length: number;
	loopIndex: number;
}

export interface Tlan {
	timingMode: number;
	valueOffset: number;
	length: number;
	loopIndex: number;
}

export interface Mods {
	command: number;
	baseTimerValue: number;
	timerLaneRef: number;
	firstAction: number;
	actionCount: number;
}

export interface Taym {
	trak: Trak;
	chips: Chip[];
	timers: Timr[];
	mods: Mods[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	vu08: number[];
	vu16: number[];
	vu32: number[];
	info: Record<string, string>;
	frameData: Record<string, Uint8Array>;
	flags: number;
}

export function makeTrak(frameRateHz: number, frameCount: number, loopFrame = NO_LOOP): Trak {
	return { frameRateHz, frameCount, loopFrame };
}

export function makeChip(
	clockHz: number,
	options: Partial<Omit<Chip, 'clockHz'>> = {}
): Chip {
	return {
		clockHz,
		chipTypeId: options.chipTypeId ?? CHIP_TYPE_AY,
		name: options.name ?? '',
		frameDataTag: options.frameDataTag ?? '',
		variant: options.variant ?? CHIP_VARIANT_DEFAULT,
		config: options.config ?? CHIP_CONFIG_DEFAULT
	};
}

export function makeTimr(
	chipIndex: number,
	clockMode = CLOCK_ABS_RATE_HZ,
	clockDivider = 0
): Timr {
	return { chipIndex, clockMode, clockDivider };
}

export function makeActn(targetId: number, sourceMode: number, operand: number): Actn {
	return { targetId, sourceMode, operand };
}

export function makeLane(
	valueType: number,
	valueOffset: number,
	length: number,
	loopIndex = NO_LOOP
): Lane {
	return { valueType, valueOffset, length, loopIndex };
}

export function makeTlan(
	timingMode: number,
	valueOffset: number,
	length: number,
	loopIndex = NO_LOOP
): Tlan {
	return { timingMode, valueOffset, length, loopIndex };
}

export function makeMods(command: number, options: Partial<Omit<Mods, 'command'>> = {}): Mods {
	return {
		command,
		baseTimerValue: options.baseTimerValue ?? 0,
		timerLaneRef: options.timerLaneRef ?? TLAN_NONE,
		firstAction: options.firstAction ?? 0,
		actionCount: options.actionCount ?? 0
	};
}

export function makeTaym(trak: Trak, parts: Partial<Omit<Taym, 'trak'>> = {}): Taym {
	return {
		trak,
		chips: parts.chips ?? [],
		timers: parts.timers ?? [],
		mods: parts.mods ?? [],
		actions: parts.actions ?? [],
		lanes: parts.lanes ?? [],
		tlanes: parts.tlanes ?? [],
		vu08: parts.vu08 ?? [],
		vu16: parts.vu16 ?? [],
		vu32: parts.vu32 ?? [],
		info: parts.info ?? {},
		frameData: parts.frameData ?? {},
		flags: parts.flags ?? 0
	};
}

export function poolFor(taym: Taym, valueType: number): number[] {
	if (valueType === VT_U8) return taym.vu08;
	if (valueType === VT_U16) return taym.vu16;
	if (valueType === VT_U32) return taym.vu32;
	throw new Error(`invalid value_type ${valueType}`);
}
