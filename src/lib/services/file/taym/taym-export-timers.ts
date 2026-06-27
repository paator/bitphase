import {
	buildMergedEffectSteps,
	envFmStepSource,
	fmStepSource,
	normalizePwmPeriods,
	sidStepSource,
	syncBuzzerStepSource,
	type MergedEffectStep,
	type TimerEffectStepSource
} from '../ay/ay-timer-effects';
import { TONE_CHANNELS, type SongCaptureFrame } from '../ay/ay-export-utils';
import { makeActn, makeLane, makeMods, makeTimr, makeTlan } from './model';
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
	TLAN_NONE,
	TM_ABSOLUTE,
	toFix16,
	VT_U8
} from './spec';

export const TAYM_TIMER_DIVIDER = 8;

export type TaymTimerMode = 'chip-period' | 'abs-rate-hz';

export const DEFAULT_TAYM_TIMER_MODE: TaymTimerMode = 'chip-period';

export interface TaymTimerOptions {
	timerMode?: TaymTimerMode;
	chipClockHz?: number;
}

export type TaymTimerTables = {
	timers: Timr[];
	mods: Mods[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	vu08: number[];
	vu32: number[];
	ownedRegistersPerFrame: number[][];
};

type ChannelEffectConfig = {
	steps: MergedEffectStep[];
	ownedRegisters: number[];
	setKey: string;
	periodKey: string;
};

type Pools = {
	vu08: number[];
	vu32: number[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	laneByKey: Map<string, number>;
	tlanByKey: Map<string, number>;
	actionSliceByKey: Map<string, number>;
	encodeTimerValue(period: number): number;
};

function makeTimerValueEncoder(
	timerMode: TaymTimerMode,
	chipClockHz: number
): (period: number) => number {
	if (timerMode === 'abs-rate-hz') {
		return (period) => toFix16(chipClockHz / (TAYM_TIMER_DIVIDER * Math.max(period, 1)));
	}
	return (period) => period;
}

function collectStepSources(
	channelIndex: number,
	frame: SongCaptureFrame
): { sources: TimerEffectStepSource[]; setKey: string; periodKey: string } {
	const sources: TimerEffectStepSource[] = [];
	const setKeys: string[] = [];
	const periodKeys: string[] = [];

	const syncbuzzer = frame.syncbuzzer?.[channelIndex];
	if (syncbuzzer?.enabled) {
		const state = normalizePwmPeriods(syncbuzzer);
		sources.push(syncBuzzerStepSource(state));
		setKeys.push(`sync:${state.waveform.join(',')}:${state.waveformLoop}`);
		periodKeys.push(`${state.period}:${state.periodLow}`);
	}

	const sid = frame.sid?.[channelIndex];
	if (sid?.enabled) {
		const state = normalizePwmPeriods(sid);
		sources.push(sidStepSource(channelIndex, state));
		setKeys.push(`sid:${state.baseVolume}:${state.waveform.join(',')}:${state.waveformLoop}`);
		periodKeys.push(`${state.period}:${state.periodLow}`);
	}

	const fm = frame.fm?.[channelIndex];
	if (fm?.enabled) {
		const state = fm.pwm ? normalizePwmPeriods(fm) : fm;
		sources.push(fmStepSource(channelIndex, state));
		setKeys.push(
			`fm:${state.baseTonePeriod}:${state.fmOffsetMode}:${state.waveform.join(',')}:${state.waveformLoop}`
		);
		periodKeys.push(`${state.period}:${state.periodLow}`);
	}

	const envFm = frame.envFm?.[channelIndex];
	if (envFm?.enabled) {
		const state = envFm.pwm ? normalizePwmPeriods(envFm) : envFm;
		sources.push(envFmStepSource(state));
		setKeys.push(
			`envfm:${state.baseEnvelopePeriod}:${state.fmOffsetMode}:${state.waveform.join(',')}:${state.waveformLoop}`
		);
		periodKeys.push(`${state.period}:${state.periodLow}`);
	}

	return {
		sources,
		setKey: setKeys.join('|'),
		periodKey: periodKeys.join('|')
	};
}

function buildChannelConfig(
	channelIndex: number,
	frame: SongCaptureFrame
): ChannelEffectConfig | undefined {
	const { sources, setKey, periodKey } = collectStepSources(channelIndex, frame);
	if (sources.length === 0) {
		return undefined;
	}
	const steps = buildMergedEffectSteps(sources);
	if (steps.length === 0) {
		return undefined;
	}
	const ownedRegisters: number[] = [];
	for (let register = 0; register < 14; register++) {
		if (steps.some((step) => step.writes.some((write) => write.register === register))) {
			ownedRegisters.push(register);
		}
	}
	return { steps, ownedRegisters, setKey, periodKey };
}

function internValueLane(pools: Pools, values: number[], loopIndex: number): number {
	const key = `${values.join(',')}#${loopIndex}`;
	const existing = pools.laneByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const lane = makeLane(VT_U8, pools.vu08.length, values.length, loopIndex);
	pools.vu08.push(...values);
	const index = pools.lanes.length;
	pools.lanes.push(lane);
	pools.laneByKey.set(key, index);
	return index;
}

function internTimerLane(pools: Pools, periods: number[], loopIndex: number): number {
	const values = periods.map((period) => pools.encodeTimerValue(period));
	const key = `${values.join(',')}#${loopIndex}`;
	const existing = pools.tlanByKey.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const tlan = makeTlan(TM_ABSOLUTE, pools.vu32.length, values.length, loopIndex);
	pools.vu32.push(...values);
	const index = pools.tlanes.length;
	pools.tlanes.push(tlan);
	pools.tlanByKey.set(key, index);
	return index;
}

function internActionSlice(
	pools: Pools,
	config: ChannelEffectConfig
): { firstAction: number; actionCount: number } {
	const loopIndex = config.steps.length > 0 ? config.steps[config.steps.length - 1]!.nextIndex : 0;
	const laneRefs: Array<{ targetId: number; laneIndex: number }> = [];
	for (const register of config.ownedRegisters) {
		const values = config.steps.map(
			(step) => step.writes.find((write) => write.register === register)?.value ?? 0
		);
		laneRefs.push({ targetId: register, laneIndex: internValueLane(pools, values, loopIndex) });
	}
	const sliceKey = laneRefs.map((ref) => `${ref.targetId}:${ref.laneIndex}`).join(',');
	const existing = pools.actionSliceByKey.get(sliceKey);
	if (existing !== undefined) {
		return { firstAction: existing, actionCount: laneRefs.length };
	}
	const firstAction = pools.actions.length;
	for (const ref of laneRefs) {
		pools.actions.push(makeActn(ref.targetId, SRC_BIND_LANE, ref.laneIndex));
	}
	pools.actionSliceByKey.set(sliceKey, firstAction);
	return { firstAction, actionCount: laneRefs.length };
}

function startMods(pools: Pools, config: ChannelEffectConfig): Mods {
	const slice = internActionSlice(pools, config);
	const loopIndex = config.steps.length > 0 ? config.steps[config.steps.length - 1]!.nextIndex : 0;
	const periods = config.steps.map((step) => step.period || 1);
	const timerLaneRef = internTimerLane(pools, periods, loopIndex);
	return makeMods(CMD_START, {
		baseTimerValue: pools.encodeTimerValue(periods[0] || 1),
		timerLaneRef,
		firstAction: slice.firstAction,
		actionCount: slice.actionCount
	});
}

export function buildTaymTimerTables(
	frames: SongCaptureFrame[],
	options: TaymTimerOptions = {}
): TaymTimerTables {
	const timerMode = options.timerMode ?? DEFAULT_TAYM_TIMER_MODE;
	const chipClockHz = options.chipClockHz ?? 0;
	const encodeTimerValue = makeTimerValueEncoder(timerMode, chipClockHz);
	const frameCount = frames.length;

	const channelConfigs: Array<Array<ChannelEffectConfig | undefined>> = [];
	const channelUsed: boolean[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const configs = frames.map((frame) => buildChannelConfig(channelIndex, frame));
		channelConfigs.push(configs);
		channelUsed.push(configs.some((config) => config !== undefined));
	}

	const activeChannels = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		if (channelUsed[channelIndex]) {
			activeChannels.push(channelIndex);
		}
	}

	const ownedRegistersPerFrame: number[][] = Array.from({ length: frameCount }, () => []);
	if (activeChannels.length === 0) {
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

	const pools: Pools = {
		vu08: [],
		vu32: [],
		actions: [],
		lanes: [],
		tlanes: [],
		laneByKey: new Map(),
		tlanByKey: new Map(),
		actionSliceByKey: new Map(),
		encodeTimerValue
	};

	const clockMode = timerMode === 'abs-rate-hz' ? CLOCK_ABS_RATE_HZ : CLOCK_CHIP_PERIOD;
	const clockDivider = timerMode === 'abs-rate-hz' ? 0 : TAYM_TIMER_DIVIDER;
	const timers: Timr[] = activeChannels.map(() => makeTimr(0, clockMode, clockDivider));
	const timerCount = activeChannels.length;
	const mods: Mods[] = new Array(frameCount * timerCount);

	for (let timerIndex = 0; timerIndex < timerCount; timerIndex++) {
		const channelIndex = activeChannels[timerIndex]!;
		const configs = channelConfigs[channelIndex]!;
		let prevSetKey: string | undefined;
		let prevPeriodKey: string | undefined;

		for (let frame = 0; frame < frameCount; frame++) {
			const config = configs[frame];
			const modsIndex = frame * timerCount + timerIndex;

			if (!config) {
				mods[modsIndex] = makeMods(prevSetKey !== undefined ? CMD_STOP : CMD_EMPTY);
				prevSetKey = undefined;
				prevPeriodKey = undefined;
				continue;
			}

			for (const register of config.ownedRegisters) {
				ownedRegistersPerFrame[frame]!.push(register);
			}

			const setChanged = prevSetKey === undefined || prevSetKey !== config.setKey;
			const periodChanged = prevPeriodKey !== undefined && prevPeriodKey !== config.periodKey;

			if (setChanged) {
				mods[modsIndex] = startMods(pools, config);
			} else if (periodChanged) {
				const loopIndex = config.steps[config.steps.length - 1]!.nextIndex;
				const periods = config.steps.map((step) => step.period || 1);
				const timerLaneRef = internTimerLane(pools, periods, loopIndex);
				mods[modsIndex] = makeMods(CMD_MODULATE, {
					baseTimerValue: pools.encodeTimerValue(periods[0] || 1),
					timerLaneRef
				});
			} else {
				mods[modsIndex] = makeMods(CMD_EMPTY);
			}

			prevSetKey = config.setKey;
			prevPeriodKey = config.periodKey;
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
