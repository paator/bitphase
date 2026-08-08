import { mapUint8SampleToVolumeLevel, type AyChipVariant } from '../../../chips/ay/ay-sample-lut';
import {
	computeSamplePitchScale,
	instrumentHasSample,
	normalizeSamplePlaybackBounds,
	resolveSamplePitchReferencePeriod,
	type SamplePlaybackBounds
} from '../../../chips/ay/sample-region';
import {
	TONE_CHANNELS,
	sidVolumeLevel,
	volumeRegisterIndex,
	type CapturedAySampleInstrument,
	type HardwareSampleState,
	type SongCaptureFrame
} from '../ay/ay-export-utils';
import type { AyTimedWrite } from './vgm-ay-timers';
import { VGM_SAMPLE_RATE } from './vgm-encoder';

export type AySampleInstrument = CapturedAySampleInstrument;

function resolveSamplePlaybackRate(
	instrument: AySampleInstrument,
	outputSampleRate: number
): number {
	const rate = instrument.sampleRate;
	if (typeof rate === 'number' && rate > 0) {
		return rate;
	}
	return outputSampleRate > 0 ? outputSampleRate : VGM_SAMPLE_RATE;
}

function resolveSampleLoopEnabled(instrument: AySampleInstrument): boolean {
	return instrument.sampleLoopEnabled !== false;
}

function mapSampleByteAtPosition(
	instrument: AySampleInstrument,
	position: number,
	variant: AyChipVariant
): number {
	const data = instrument.sampleData;
	if (!data?.length) {
		return 0;
	}
	const index = Math.max(0, Math.min(data.length - 1, position | 0));
	return mapUint8SampleToVolumeLevel(data[index] ?? 0, variant);
}

function advanceCapturedSample(
	sample: HardwareSampleState,
	instrument: AySampleInstrument,
	bounds: SamplePlaybackBounds,
	chipFrequency: number,
	variant: AyChipVariant
): { active: boolean; volume: number } {
	let position = sample.position | 0;
	if (position < bounds.start || position > bounds.end) {
		position = bounds.start;
		sample.position = position;
	}

	const volume = mapSampleByteAtPosition(instrument, position, variant);
	const rate = resolveSamplePlaybackRate(instrument, VGM_SAMPLE_RATE);
	const referencePeriod = resolveSamplePitchReferencePeriod(chipFrequency);
	const pitchScale = computeSamplePitchScale(referencePeriod, sample.effectiveTone);
	let phase = sample.phase + (rate / VGM_SAMPLE_RATE) * pitchScale;

	while (phase >= 1) {
		position++;
		if (position > bounds.end) {
			if (resolveSampleLoopEnabled(instrument)) {
				position = bounds.loopStart;
			} else {
				sample.position = bounds.end + 1;
				sample.phase = 0;
				return { active: false, volume: 0 };
			}
		}
		phase -= 1;
	}

	sample.position = position;
	sample.phase = phase;
	return { active: true, volume };
}

function expandChannelSampleWrites(
	sample: HardwareSampleState,
	instrument: AySampleInstrument | undefined,
	baseVolume: number,
	chipFrequency: number,
	isYm: boolean,
	frameStartSample: number,
	frameEndSample: number,
	out: AyTimedWrite[]
): void {
	if (!sample.enabled || !instrumentHasSample(instrument) || sample.effectiveTone <= 0) {
		return;
	}
	const bounds = normalizeSamplePlaybackBounds(instrument!);
	if (!bounds) {
		return;
	}

	const variant: AyChipVariant = isYm ? 'YM' : 'AY';
	const register = volumeRegisterIndex(sample.hardwareChannelIndex);
	const working: HardwareSampleState = { ...sample };
	const scaledBaseVolume = baseVolume & 0xf;
	let lastVolume = -1;

	for (let at = frameStartSample; at < frameEndSample; at++) {
		const playback = advanceCapturedSample(
			working,
			instrument!,
			bounds,
			chipFrequency,
			variant
		);
		if (!playback.active) {
			if (lastVolume !== 0) {
				out.push({ sample: at, register, value: 0 });
			}
			return;
		}
		const volume = sidVolumeLevel(playback.volume, scaledBaseVolume);
		if (volume !== lastVolume) {
			out.push({ sample: at, register, value: volume });
			lastVolume = volume;
		}
	}
}

export function expandAyFrameSampleWrites(
	frame: SongCaptureFrame,
	instruments: readonly AySampleInstrument[],
	chipFrequency: number,
	isYm: boolean,
	frameStartSample: number,
	frameEndSample: number
): AyTimedWrite[] {
	const out: AyTimedWrite[] = [];
	for (let channelIndex = 0; channelIndex < TONE_CHANNELS; channelIndex++) {
		const sample = frame.sample[channelIndex];
		if (!sample?.enabled) {
			continue;
		}
		const instrument =
			sample.instrumentIndex >= 0 ? instruments[sample.instrumentIndex] : undefined;
		const baseVolume = frame.sid[channelIndex]?.baseVolume ?? 0;
		expandChannelSampleWrites(
			sample,
			instrument,
			baseVolume,
			chipFrequency,
			isYm,
			frameStartSample,
			frameEndSample,
			out
		);
	}
	out.sort((a, b) => a.sample - b.sample || a.register - b.register);
	return out;
}
