import type { SongCaptureResult } from '../ay/psg-export';
import { encodeForegroundPsgFrameData } from './foreground-psg';
import { buildTaymTimerTables, type TaymTimerMode } from './taym-export-timers';
import { buildTaymSampleTables } from './taym-samples';
import type { Actn, Lane, Mods, Timr, Tlan } from './model';
import { makeChip, makeMods, makeTaym, makeTrak, type Taym } from './model';
import { CMD_EMPTY, SRC_BIND_LANE, TLAN_NONE, TLAN_UNCHANGED } from './spec';
import {
	AY_CFG_STEREO_MASK,
	AY_LAYOUT_ABC,
	AY_LAYOUT_ACB,
	AY_LAYOUT_CAB,
	AY_LAYOUT_MONO,
	AY_LAYOUT_ST_MONO,
	AY_VARIANT_AY,
	AY_VARIANT_YM,
	CHIP_TYPE_AY
} from './spec';

const FRAME_DATA_TAG = 'PSG0';

export const ST_MONO_LAYOUT = 'st-mono';

const STEREO_LAYOUTS: Record<string, number> = {
	ABC: AY_LAYOUT_ABC,
	ACB: AY_LAYOUT_ACB,
	CAB: AY_LAYOUT_CAB,
	mono: AY_LAYOUT_MONO,
	[ST_MONO_LAYOUT]: AY_LAYOUT_ST_MONO
};

export function ayStereoConfig(stereoLayout: string | undefined): number {
	return (STEREO_LAYOUTS[stereoLayout ?? 'ABC'] ?? AY_LAYOUT_ABC) & AY_CFG_STEREO_MASK;
}

export interface TaymMetadata {
	title?: string;
	author?: string;
	stereoLayout?: string;
	tuningTable?: string;
	instruments?: string[];
}

export interface BuildTaymOptions {
	chipName?: string;
	metadata?: TaymMetadata;
	timerMode?: TaymTimerMode;
}

function buildInfo(metadata: TaymMetadata | undefined): Record<string, string> {
	const info: Record<string, string> = {};
	if (!metadata) {
		return info;
	}
	if (metadata.title) info.title = metadata.title;
	if (metadata.author) info.author = metadata.author;
	if (metadata.tuningTable) info.tuning = metadata.tuningTable;
	const instruments = (metadata.instruments ?? []).filter((name) => name.length > 0);
	if (instruments.length > 0) {
		info.instruments = instruments.join(', ');
	}
	return info;
}

type TimerTables = {
	timers: Timr[];
	mods: Mods[];
	actions: Actn[];
	lanes: Lane[];
	tlanes: Tlan[];
	vu08: number[];
	vu32: number[];
	ownedRegistersPerFrame: number[][];
};

function remapTimerLaneRef(timerLaneRef: number, tlanOffset: number): number {
	if (timerLaneRef === TLAN_NONE || timerLaneRef === TLAN_UNCHANGED) {
		return timerLaneRef;
	}
	return timerLaneRef + tlanOffset;
}

function remapSampleMods(mods: Mods, offsets: { action: number; tlan: number }): Mods {
	return makeMods(mods.command, {
		baseTimerValue: mods.baseTimerValue,
		timerLaneRef: remapTimerLaneRef(mods.timerLaneRef, offsets.tlan),
		firstAction: mods.firstAction + offsets.action,
		actionCount: mods.actionCount
	});
}

function remapSampleAction(action: Actn, laneOffset: number): Actn {
	if (action.sourceMode !== SRC_BIND_LANE) {
		return action;
	}
	return { ...action, operand: action.operand + laneOffset };
}

function remapSampleLane(lane: Lane, valueOffset: number): Lane {
	return { ...lane, valueOffset: lane.valueOffset + valueOffset };
}

function remapSampleTlan(tlan: Tlan, valueOffset: number): Tlan {
	return { ...tlan, valueOffset: tlan.valueOffset + valueOffset };
}

function mergeTimerTables(
	frameCount: number,
	effect: TimerTables,
	sample: TimerTables
): TimerTables {
	if (sample.timers.length === 0) {
		return effect;
	}
	if (effect.timers.length === 0) {
		return sample;
	}

	const effectCount = effect.timers.length;
	const sampleCount = sample.timers.length;
	const combinedCount = effectCount + sampleCount;

	const offsets = {
		action: effect.actions.length,
		lane: effect.lanes.length,
		tlan: effect.tlanes.length,
		vu08: effect.vu08.length,
		vu32: effect.vu32.length
	};

	const mods: Mods[] = new Array(frameCount * combinedCount);
	for (let frame = 0; frame < frameCount; frame++) {
		for (let i = 0; i < effectCount; i++) {
			mods[frame * combinedCount + i] =
				effect.mods[frame * effectCount + i] ?? makeMods(CMD_EMPTY);
		}
		for (let i = 0; i < sampleCount; i++) {
			const src = sample.mods[frame * sampleCount + i] ?? makeMods(CMD_EMPTY);
			mods[frame * combinedCount + effectCount + i] = remapSampleMods(src, {
				action: offsets.action,
				tlan: offsets.tlan
			});
		}
	}

	const ownedRegistersPerFrame = effect.ownedRegistersPerFrame.map((owned, frame) => [
		...owned,
		...(sample.ownedRegistersPerFrame[frame] ?? [])
	]);

	return {
		timers: [...effect.timers, ...sample.timers],
		mods,
		actions: [
			...effect.actions,
			...sample.actions.map((action) => remapSampleAction(action, offsets.lane))
		],
		lanes: [
			...effect.lanes,
			...sample.lanes.map((lane) => remapSampleLane(lane, offsets.vu08))
		],
		tlanes: [
			...effect.tlanes,
			...sample.tlanes.map((tlan) => remapSampleTlan(tlan, offsets.vu32))
		],
		vu08: [...effect.vu08, ...sample.vu08],
		vu32: [...effect.vu32, ...sample.vu32],
		ownedRegistersPerFrame
	};
}

export function buildTaymFromCapture(
	capture: SongCaptureResult,
	options: BuildTaymOptions = {}
): Taym {
	const frameCount = capture.frames.length;
	const effectTables = buildTaymTimerTables(capture.frames, {
		timerMode: options.timerMode,
		chipClockHz: capture.chipFrequency,
		chipVariant: capture.isYm ? 'YM' : 'AY'
	});
	const sampleTables = buildTaymSampleTables(capture.frames, {
		timerMode: options.timerMode,
		chipClockHz: capture.chipFrequency
	});
	const timerTables = mergeTimerTables(frameCount, effectTables, sampleTables);
	const psg = new Uint8Array(
		encodeForegroundPsgFrameData(
			capture.frames.map((frame) => frame.registers),
			timerTables.ownedRegistersPerFrame
		)
	);

	return makeTaym(makeTrak(capture.interruptFrequency, frameCount), {
		chips: [
			makeChip(capture.chipFrequency, {
				chipTypeId: CHIP_TYPE_AY,
				variant: capture.isYm ? AY_VARIANT_YM : AY_VARIANT_AY,
				config: ayStereoConfig(options.metadata?.stereoLayout),
				name: options.chipName ?? 'AY',
				frameDataTag: FRAME_DATA_TAG
			})
		],
		timers: timerTables.timers,
		mods: timerTables.mods,
		actions: timerTables.actions,
		lanes: timerTables.lanes,
		tlanes: timerTables.tlanes,
		vu08: timerTables.vu08,
		vu32: timerTables.vu32,
		info: buildInfo(options.metadata),
		frameData: { [FRAME_DATA_TAG]: psg }
	});
}
