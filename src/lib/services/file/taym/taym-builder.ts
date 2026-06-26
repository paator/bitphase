import type { SongCaptureResult } from '../ay/psg-export';
import { encodePSGMasked } from '../ay/psg-export';
import { buildTaymTimerTables, type TaymTimerMode } from './taym-export-timers';
import { makeChip, makeTaym, makeTrak, type Taym } from './model';
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

export function buildTaymFromCapture(
	capture: SongCaptureResult,
	options: BuildTaymOptions = {}
): Taym {
	const frameCount = capture.frames.length;
	const timerTables = buildTaymTimerTables(capture.frames, {
		timerMode: options.timerMode,
		chipClockHz: capture.chipFrequency
	});
	const psg = new Uint8Array(
		encodePSGMasked(
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
