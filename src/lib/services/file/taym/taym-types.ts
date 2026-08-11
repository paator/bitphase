import type {
	TaymClockMode,
	TaymCommand,
	TaymSourceMode,
	TaymTimingMode,
	TaymValueType
} from './taym-spec';

export type TaymTrack = {
	frameRateHz: number;
	frameCount: number;
	loopFrame: number | null;
	chipCount: number;
	timerCount: number;
};

export type TaymChip = {
	clockHz: number;
	chipTypeId: number;
	variant: number;
	name: string;
	frameDataTag: string | null;
	config: number;
};

export type TaymTimer = {
	clockDivider: number;
	chipIndex: number;
	clockMode: TaymClockMode;
};

export type TaymAction = {
	operand: number;
	targetId: number;
	sourceMode: TaymSourceMode;
};

export type TaymValueLane = {
	valueOffset: number;
	length: number;
	loopIndex: number | null;
	valueType: TaymValueType;
	values: number[];
};

export type TaymTimerLane = {
	valueOffset: number;
	length: number;
	loopIndex: number | null;
	timingMode: TaymTimingMode;
	values: number[];
};

export type TaymMod = {
	baseTimerValue: number;
	timerLaneRef: number | null | 'unchanged';
	firstAction: number;
	actionCount: number;
	command: TaymCommand;
};

export type TaymFile = {
	track: TaymTrack;
	info: Record<string, string>;
	chips: TaymChip[];
	timers: TaymTimer[];
	mods: TaymMod[];
	actions: TaymAction[];
	lanes: TaymValueLane[];
	timerLanes: TaymTimerLane[];
	frameData: Map<string, Uint8Array>;
};
