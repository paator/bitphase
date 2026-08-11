import {
	SAMPLE_NO_LOOP,
	TONE_CHANNELS,
	volumeRegisterIndex,
	type HardwareTaymSampleState,
	type SongCaptureFrame
} from '../ay/ay-export-utils';
import { makeActn, makeLane, makeMods, makeTimr } from './model';
import type { Actn, Lane, Mods, Timr, Tlan } from './model';
import {
	CLOCK_ABS_RATE_HZ,
	CLOCK_CHIP_PERIOD,
	CMD_EMPTY,
	CMD_MODULATE,
	CMD_START,
	CMD_STOP,
	NO_LOOP,
	SRC_BIND_LANE,
	SRC_INLINE_VALUE,
	TGT_SAMPLE_AMPLITUDE,
	TLAN_NONE,
	TLAN_UNCHANGED,
	toFix16,
	VT_U8
} from './spec';
import { TAYM_TIMER_DIVIDER, type TaymTimerMode } from './taym-export-timers';

export const DEFAULT_TAYM_SAMPLE_TIMER_MODE: TaymTimerMode = 'abs-rate-hz';

export type TaymSampleOptions = {
	timerMode?: TaymTimerMode;
	chipClockHz?: number;
};

export type TaymSampleTables = {
	timers: Timr[];
	mods: Mods[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	vu08: number[];
	vu32: number[];
	ownedRegistersPerFrame: number[][];
};

type SamplePools = {
	vu08: number[];
	vu32: number[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	laneByKey: Map<string, number>;
	sliceByKey: Map<string, number>;
	encodeTimerValue(period: number): number;
};

function makeTimerValueEncoder(
	timerMode: TaymTimerMode,
	chipClockHz: number
): (rateHz: number) => number {
	if (timerMode === 'abs-rate-hz') {
		return (rateHz) => toFix16(Math.max(rateHz, 0));
	}
	return (rateHz) =>
		Math.max(1, Math.round(chipClockHz / (TAYM_TIMER_DIVIDER * Math.max(rateHz, 1))));
}

function internSampleLane(pools: SamplePools, values: number[], loopIndex: number): number {
	const laneLoop = loopIndex >= 0 ? loopIndex : NO_LOOP;
	const key = `${values.join(',')}#${laneLoop}`;
	const existing = pools.laneByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const lane = makeLane(VT_U8, pools.vu08.length, values.length, laneLoop);
	pools.vu08.push(...values);
	const index = pools.lanes.length;
	pools.lanes.push(lane);
	pools.laneByKey.set(key, index);
	return index;
}

function internSampleSlice(
	pools: SamplePools,
	channelIndex: number,
	sample: HardwareTaymSampleState
): number {
	const laneIndex = internSampleLane(pools, sample.sampleBytes, sample.loopIndex);
	const ampReg = volumeRegisterIndex(channelIndex);
	const volume = sample.volume & 0x0f;
	const key = `${ampReg}:${volume}|${TGT_SAMPLE_AMPLITUDE}:${laneIndex}`;
	const existing = pools.sliceByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const firstAction = pools.actions.length;
	pools.actions.push(makeActn(ampReg, SRC_INLINE_VALUE, volume));
	pools.actions.push(makeActn(TGT_SAMPLE_AMPLITUDE, SRC_BIND_LANE, laneIndex));
	pools.sliceByKey.set(key, firstAction);
	return firstAction;
}

function sampleSlotMods(
	pools: SamplePools,
	command: number,
	channelIndex: number,
	sample: HardwareTaymSampleState,
	pitchChanged: boolean
): Mods {
	const firstAction = internSampleSlice(pools, channelIndex, sample);
	return makeMods(command, {
		baseTimerValue: pitchChanged ? pools.encodeTimerValue(sample.rateHz) : 0,
		timerLaneRef: pitchChanged ? TLAN_NONE : TLAN_UNCHANGED,
		firstAction,
		actionCount: 2
	});
}

function channelPlaysSample(frames: SongCaptureFrame[], channelIndex: number): boolean {
	return frames.some((frame) => frame.samples?.[channelIndex]?.enabled);
}

export function buildTaymSampleTables(
	frames: SongCaptureFrame[],
	options: TaymSampleOptions = {}
): TaymSampleTables {
	const timerMode = options.timerMode ?? DEFAULT_TAYM_SAMPLE_TIMER_MODE;
	const chipClockHz = options.chipClockHz ?? 0;
	const encodeTimerValue = makeTimerValueEncoder(timerMode, chipClockHz);
	const frameCount = frames.length;
	const ownedRegistersPerFrame: number[][] = Array.from({ length: frameCount }, () => []);

	const sampleChannels: number[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		if (channelPlaysSample(frames, channelIndex)) {
			sampleChannels.push(channelIndex);
		}
	}

	if (sampleChannels.length === 0) {
		return {
			timers: [],
			mods: [],
			actions: [],
			lanes: [],
			tlanes: [],
			vu08: [],
			vu32: [],
			ownedRegistersPerFrame
		};
	}

	const pools: SamplePools = {
		vu08: [],
		vu32: [],
		actions: [],
		lanes: [],
		tlanes: [],
		laneByKey: new Map(),
		sliceByKey: new Map(),
		encodeTimerValue
	};

	const clockMode = timerMode === 'abs-rate-hz' ? CLOCK_ABS_RATE_HZ : CLOCK_CHIP_PERIOD;
	const clockDivider = timerMode === 'abs-rate-hz' ? 0 : TAYM_TIMER_DIVIDER;
	const timers: Timr[] = sampleChannels.map(() => makeTimr(0, clockMode, clockDivider));
	const timerCount = sampleChannels.length;
	const mods: Mods[] = new Array(frameCount * timerCount);

	for (let timerIndex = 0; timerIndex < timerCount; timerIndex++) {
		const channelIndex = sampleChannels[timerIndex]!;
		let activeInstanceId = 0;
		let prevTimerValue = -1;
		let prevVolume = -1;

		for (let frame = 0; frame < frameCount; frame++) {
			const sample = frames[frame]!.samples?.[channelIndex];
			const modsIndex = frame * timerCount + timerIndex;

			if (!sample?.enabled) {
				mods[modsIndex] = makeMods(activeInstanceId !== 0 ? CMD_STOP : CMD_EMPTY);
				activeInstanceId = 0;
				prevTimerValue = -1;
				prevVolume = -1;
				continue;
			}

			ownedRegistersPerFrame[frame]!.push(volumeRegisterIndex(channelIndex));

			const timerValue = pools.encodeTimerValue(sample.rateHz);
			const pitchChanged = timerValue !== prevTimerValue;
			const volumeChanged = sample.volume !== prevVolume;

			if (sample.instanceId !== activeInstanceId) {
				mods[modsIndex] = sampleSlotMods(pools, CMD_START, channelIndex, sample, true);
			} else if (pitchChanged || volumeChanged) {
				mods[modsIndex] = sampleSlotMods(pools, CMD_MODULATE, channelIndex, sample, pitchChanged);
			} else {
				mods[modsIndex] = makeMods(CMD_EMPTY);
			}

			activeInstanceId = sample.instanceId;
			prevTimerValue = timerValue;
			prevVolume = sample.volume;
		}
	}

	return {
		timers,
		mods,
		actions: pools.actions,
		lanes: pools.lanes,
		tlanes: pools.tlanes,
		vu08: pools.vu08,
		vu32: pools.vu32,
		ownedRegistersPerFrame
	};
}

export { SAMPLE_NO_LOOP };
