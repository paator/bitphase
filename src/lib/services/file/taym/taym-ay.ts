import { ATARI_ST_CHIP_FREQUENCY } from '../../../chips/ay/schema';
import type { AyChipVariant } from '../../../chips/ay/ay-sample-lut';
import { createSilentFrames, decodePsgFramesForTrack, type PsgFrame } from '../ay/psg-frames';
import { importAyRegisterFrames } from '../ay/ay-register-import';
import type { TaymChipImportInput, TaymChipImportResult } from './taym-chip-import';

const TAYM_CHIP_VARIANT_YM = 1;
const AY_ST_MONO_LAYOUT = 7;
const AY_STEREO_LAYOUTS: Record<number, string> = {
	0: 'mono',
	1: 'ABC',
	2: 'ACB',
	5: 'CAB'
};

type StereoSettings = {
	clockHz: number;
	chipVariant: AyChipVariant;
	stereoLayout: string;
	stMixing: boolean;
	warnings: string[];
};

export function importTaymAyChip(input: TaymChipImportInput): TaymChipImportResult {
	const warnings: string[] = [];
	const frames = decodeFrameData(input, warnings);
	const settings = resolveChipSettings(input);
	warnings.push(...settings.warnings);

	const result = importAyRegisterFrames({
		frames,
		frameCount: input.track.frameCount,
		frameRateHz: input.track.frameRateHz,
		loopFrame: input.track.loopFrame,
		clockHz: settings.clockHz,
		chipVariant: settings.chipVariant,
		stereoLayout: settings.stereoLayout,
		stMixing: settings.stMixing,
		timerSegments: input.segments,
		instrumentIdOffset: input.instrumentIdOffset
	});

	return { ...result, warnings: [...warnings, ...result.warnings] };
}

function decodeFrameData(input: TaymChipImportInput, warnings: string[]): PsgFrame[] {
	const { frameCount } = input.track;
	if (!input.frameData) {
		if (input.chip.frameDataTag) {
			warnings.push(
				`Frame data ${input.chip.frameDataTag} for chip "${chipLabel(input)}" is stored in a sidecar file and was not available`
			);
		}
		return createSilentFrames(frameCount);
	}

	const decoded = decodePsgFramesForTrack(input.frameData, frameCount);
	if (decoded.length !== frameCount) {
		warnings.push(
			`Frame data for chip "${chipLabel(input)}" decoded to ${decoded.length} frames instead of ${frameCount}`
		);
	}
	return decoded;
}

function resolveChipSettings(input: TaymChipImportInput): StereoSettings {
	const variant: AyChipVariant = input.chip.variant === TAYM_CHIP_VARIANT_YM ? 'YM' : 'AY';
	const layout = input.chip.config & 0b111;

	if (layout === AY_ST_MONO_LAYOUT) {
		return {
			clockHz: ATARI_ST_CHIP_FREQUENCY,
			chipVariant: 'YM',
			stereoLayout: 'mono',
			stMixing: true,
			warnings: []
		};
	}

	const stereoLayout = AY_STEREO_LAYOUTS[layout];
	return {
		clockHz: input.chip.clockHz,
		chipVariant: variant,
		stereoLayout: stereoLayout ?? 'mono',
		stMixing: false,
		warnings: stereoLayout
			? []
			: [`Stereo layout ${layout} has no Bitphase equivalent and was imported as mono`]
	};
}

function chipLabel(input: TaymChipImportInput): string {
	return input.chip.name || `chip ${input.chipIndex}`;
}
