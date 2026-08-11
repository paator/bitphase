import { Instrument, InstrumentRow, Note, NoteName, Pattern, Song } from '../../../models/song';
import type { Row } from '../../../models/song';
import { generate12TETTuningTable } from '../../../models/pt3/tuning-tables';
import { MAX_INSTRUMENT_ID_NUM, numberToInstrumentId } from '../../../utils/instrument-id';
import {
	AY_TIMER_WAVEFORM_MAX_LENGTH,
	DEFAULT_AY_TIMER_PWM_DUTY,
	type AyTimerRow
} from '../../../chips/ay/instrument';
import {
	SAMPLE_DAC_TABLE_AY,
	SAMPLE_DAC_TABLE_YM,
	type AyChipVariant
} from '../../../chips/ay/ay-sample-lut';
import {
	clampInstrumentSampleRate,
	resolveSamplePitchReferencePeriod
} from '../../../chips/ay/sample-region';
import { MAX_INSTRUMENT_SAMPLE_BYTES } from '../../../utils/audio-sample-decode';
import { ATARI_ST_CHIP_FREQUENCY } from '../../../chips/ay/schema';
import {
	createSilentFrames,
	decodePsgFramesForTrack,
	fitFrameCount,
	type PsgFrame
} from './taym-psg';
import type { TaymTimerSegment } from './taym-timers';
import type { TaymChipImportInput, TaymChipImportResult } from './taym-chip-import';

const AY_TONE_CHANNELS = 3;
const AY_ENGINE_TIMER_PRESCALER = 8;
const MAX_PATTERN_ROWS = 64;
const FULL_VOLUME = 15;
const EXPLICIT_ZERO = -1;
const NO_VOLUME_STATE = -2;
const TUNING_TABLE_CUSTOM_INDEX = 5;
const DEFAULT_A4_HZ = 440;
const DEFAULT_CHIP_FREQUENCY = 1773400;

const AY_TARGET = {
	toneFineA: 0x00,
	noisePeriod: 0x06,
	mixer: 0x07,
	amplitudeA: 0x08,
	envelopePeriodFine: 0x0b,
	envelopePeriodCoarse: 0x0c,
	envelopeShape: 0x0d
} as const;

const AY_SAMPLE_MIN_LANE_LENGTH = 8;
const AY_AMPLITUDE_LEVEL_MASK = 0x0f;
const AY_SID_AUTO_MAX_SEMITONE = 24;
const AY_SID_AUTO_MAX_DETUNE = 4;

const AY_STEREO_LAYOUTS: Record<number, string> = {
	0: 'mono',
	1: 'ABC',
	2: 'ACB',
	5: 'CAB'
};
const AY_ST_MONO_LAYOUT = 7;

type ChannelState = {
	tonePeriod: number;
	toneEnabled: boolean;
	noiseEnabled: boolean;
	envelopeMode: boolean;
	amplitude: number;
};

type FrameState = {
	channels: ChannelState[];
	noisePeriod: number;
	envelopePeriod: number;
	envelopeShape: number;
	envelopeShapeWritten: boolean;
};

type ChannelCarry = {
	noteIndex: number;
	volume: number;
	instrumentId: number;
	voiced: boolean;
	envelopeArmed: boolean;
};

type TimerSample = {
	laneKey: string;
	data: number[];
	rate: number;
	loopStart: number | null;
};

type TimerEffect = {
	channelIndex: number;
	ownsAmplitude: boolean;
	amplitudeLevel: number | null;
	row: AyTimerRow | null;
	pwmDuty: number | null;
	sample: TimerSample | null;
};

type InstrumentShape = {
	tone: boolean;
	noise: boolean;
	envelope: boolean;
	toneAdd: number;
	timer: TimerEffect | null;
};

class TaymAySongBuilder {
	private readonly warnings: string[] = [];
	private instrumentLimitReported = false;
	private readonly instruments: Instrument[] = [];
	private readonly instrumentIdsByShape = new Map<string, number>();
	private readonly tuningTable: number[];
	private readonly frames: PsgFrame[];
	private readonly frameStates: FrameState[] = [];
	private readonly retriggerFrames: Array<Set<number>> = Array.from(
		{ length: AY_TONE_CHANNELS },
		() => new Set<number>()
	);

	constructor(private readonly input: TaymChipImportInput) {
		this.tuningTable = generate12TETTuningTable(this.clockHz(), DEFAULT_A4_HZ);
		this.frames = this.decodeFrameData();
	}

	build(): TaymChipImportResult {
		const song = this.createSong();
		const timerEffects = this.resolveTimerEffectsPerFrame();
		const boundaries = this.resolvePatternBoundaries();
		const carries = Array.from({ length: AY_TONE_CHANNELS }, () => createCarry());

		song.patterns = boundaries.map((boundary, index) =>
			this.buildPattern(index, boundary.startFrame, boundary.length, timerEffects, carries)
		);
		song.defaultPatternLength = Math.min(MAX_PATTERN_ROWS, this.input.track.frameCount);

		const loopPatternIndex = boundaries.findIndex(
			(boundary) => boundary.startFrame === this.input.track.loopFrame
		);

		return {
			song,
			instruments: this.instruments,
			patternOrder: boundaries.map((_, index) => index),
			loopPatternIndex: loopPatternIndex < 0 ? 0 : loopPatternIndex,
			warnings: this.warnings
		};
	}

	private decodeFrameData(): PsgFrame[] {
		const { frameCount } = this.input.track;
		if (!this.input.frameData) {
			if (this.input.chip.frameDataTag) {
				this.warnings.push(
					`Frame data ${this.input.chip.frameDataTag} for chip "${this.chipLabel()}" is stored in a sidecar file and was not available`
				);
			}
			return createSilentFrames(frameCount);
		}

		const decoded = decodePsgFramesForTrack(this.input.frameData, frameCount);
		if (decoded.length !== frameCount) {
			this.warnings.push(
				`Frame data for chip "${this.chipLabel()}" decoded to ${decoded.length} frames instead of ${frameCount}`
			);
		}
		return fitFrameCount(decoded, frameCount);
	}

	private chipLabel(): string {
		return this.input.chip.name || `chip ${this.input.chipIndex}`;
	}

	private clockHz(): number {
		return this.input.chip.clockHz > 0 ? this.input.chip.clockHz : DEFAULT_CHIP_FREQUENCY;
	}

	private createSong(): Song {
		const song = new Song();
		song.chipType = 'ay';
		song.chipVariant = this.input.chip.variant === 1 ? 'YM' : 'AY';
		song.chipFrequency = this.clockHz();
		song.interruptFrequency = this.input.track.frameRateHz;
		song.initialSpeed = 1;
		song.tuningTable = this.tuningTable;
		song.tuningTableIndex = TUNING_TABLE_CUSTOM_INDEX;
		song.a4TuningHz = DEFAULT_A4_HZ;

		const layout = this.input.chip.config & 0b111;
		const settings = song as unknown as Record<string, unknown>;
		if (layout === AY_ST_MONO_LAYOUT) {
			settings.stMixing = true;
			settings.stereoLayout = 'mono';
			song.chipVariant = 'YM';
			song.chipFrequency = ATARI_ST_CHIP_FREQUENCY;
			return song;
		}

		const stereoLayout = AY_STEREO_LAYOUTS[layout];
		if (!stereoLayout) {
			this.warnings.push(
				`Stereo layout ${layout} has no Bitphase equivalent and was imported as mono`
			);
		}
		settings.stereoLayout = stereoLayout ?? 'mono';
		return song;
	}

	private resolvePatternBoundaries(): Array<{ startFrame: number; length: number }> {
		const { frameCount, loopFrame } = this.input.track;
		const sectionStarts = loopFrame !== null && loopFrame > 0 ? [0, loopFrame] : [0];
		const splits = [...sectionStarts, frameCount];
		const boundaries: Array<{ startFrame: number; length: number }> = [];

		for (let index = 0; index < splits.length - 1; index++) {
			const sectionEnd = splits[index + 1]!;
			for (let start = splits[index]!; start < sectionEnd; start += MAX_PATTERN_ROWS) {
				boundaries.push({
					startFrame: start,
					length: Math.min(MAX_PATTERN_ROWS, sectionEnd - start)
				});
			}
		}

		return boundaries;
	}

	private frameState(frameIndex: number): FrameState {
		const cached = this.frameStates[frameIndex];
		if (cached) {
			return cached;
		}

		const frame = this.frames[Math.min(frameIndex, this.frames.length - 1)]!;
		const registers = frame.registers;
		const mixer = registers[AY_TARGET.mixer]!;
		const channels: ChannelState[] = [];

		for (let channel = 0; channel < AY_TONE_CHANNELS; channel++) {
			const amplitudeRegister = registers[AY_TARGET.amplitudeA + channel]!;
			channels.push({
				tonePeriod: registers[channel * 2]! | ((registers[channel * 2 + 1]! & 0x0f) << 8),
				toneEnabled: (mixer & (1 << channel)) === 0,
				noiseEnabled: (mixer & (1 << (channel + AY_TONE_CHANNELS))) === 0,
				envelopeMode: (amplitudeRegister & 0x10) !== 0,
				amplitude: amplitudeRegister & 0x0f
			});
		}

		const state: FrameState = {
			channels,
			noisePeriod: registers[AY_TARGET.noisePeriod]! & 0x1f,
			envelopePeriod:
				registers[AY_TARGET.envelopePeriodFine]! |
				(registers[AY_TARGET.envelopePeriodCoarse]! << 8),
			envelopeShape: registers[AY_TARGET.envelopeShape]! & 0x0f,
			envelopeShapeWritten: (frame.writeMask & (1 << AY_TARGET.envelopeShape)) !== 0
		};
		this.frameStates[frameIndex] = state;
		return state;
	}

	private buildPattern(
		patternId: number,
		startFrame: number,
		length: number,
		timerEffects: Array<Array<TimerEffect | null>>,
		carries: ChannelCarry[]
	): Pattern {
		const pattern = new Pattern(patternId, length);
		let previousNoise = startFrame === 0 ? 0 : this.frameState(startFrame - 1).noisePeriod;
		let previousEnvelopePeriod =
			startFrame === 0 ? 0 : this.frameState(startFrame - 1).envelopePeriod;

		for (let row = 0; row < length; row++) {
			const frameIndex = startFrame + row;
			const state = this.frameState(frameIndex);
			const patternRow = pattern.patternRows[row]!;

			patternRow.envelopeValue =
				state.envelopePeriod > 0 && state.envelopePeriod !== previousEnvelopePeriod
					? state.envelopePeriod
					: 0;
			patternRow.noiseValue =
				state.noisePeriod === previousNoise
					? 0
					: state.noisePeriod === 0
						? EXPLICIT_ZERO
						: state.noisePeriod;
			previousEnvelopePeriod = state.envelopePeriod;
			previousNoise = state.noisePeriod;

			const shapeChannel = Math.max(
				state.channels.findIndex((channel) => channel.envelopeMode),
				0
			);
			let shapeEmitted = false;
			for (let channel = 0; channel < AY_TONE_CHANNELS; channel++) {
				shapeEmitted =
					this.fillRow(
						pattern.channels[channel]!.rows[row]!,
						state,
						channel,
						carries[channel]!,
						timerEffects[channel]![frameIndex] ?? null,
						state.envelopeShapeWritten && channel === shapeChannel,
						this.retriggerFrames[channel]!.has(frameIndex)
					) || shapeEmitted;
			}
			if (shapeEmitted && state.envelopePeriod > 0) {
				patternRow.envelopeValue = state.envelopePeriod;
			}
		}

		return pattern;
	}

	private fillRow(
		target: Row,
		state: FrameState,
		channel: number,
		carry: ChannelCarry,
		timer: TimerEffect | null,
		shapeRewritten: boolean,
		retrigger: boolean
	): boolean {
		const channelState = state.channels[channel]!;

		target.note = new Note();
		target.instrument = 0;
		target.envelopeShape = 0;
		target.table = 0;
		target.volume = 0;
		target.effects = [null];

		if (!this.isVoiced(channelState, timer)) {
			if (carry.voiced) {
				target.note = new Note(NoteName.Off, 0);
				resetCarry(carry);
			}
			return false;
		}

		const emitShape = shapeRewritten || (channelState.envelopeMode && !carry.envelopeArmed);
		if (emitShape) {
			target.envelopeShape = toPatternEnvelopeShape(state.envelopeShape);
		}
		carry.envelopeArmed = channelState.envelopeMode;

		const noteIndex = timer?.sample
			? this.samplePitchNoteIndex()
			: this.toNoteIndex(channelState.tonePeriod);

		const instrumentId = this.resolveInstrumentId({
			tone: channelState.toneEnabled,
			noise: channelState.noiseEnabled,
			envelope: channelState.envelopeMode,
			toneAdd: this.resolveToneAdd(channelState, timer, noteIndex),
			timer
		});
		if (instrumentId !== carry.instrumentId) {
			target.instrument = instrumentId;
			carry.instrumentId = instrumentId;
		}

		if (noteIndex !== carry.noteIndex || !carry.voiced || retrigger) {
			target.note = toNote(noteIndex);
			carry.noteIndex = noteIndex;
		}

		const level = timer?.ownsAmplitude ? timer.amplitudeLevel! : channelState.amplitude;
		const volume = level === 0 ? EXPLICIT_ZERO : level;
		if (volume !== carry.volume) {
			target.volume = volume;
			carry.volume = volume;
		}

		carry.voiced = true;
		return emitShape;
	}

	private isVoiced(channel: ChannelState, timer: TimerEffect | null): boolean {
		if (timer?.ownsAmplitude) {
			return true;
		}
		return (
			channel.toneEnabled ||
			channel.noiseEnabled ||
			channel.envelopeMode ||
			channel.amplitude > 0
		);
	}

	private resolveToneAdd(
		channel: ChannelState,
		timer: TimerEffect | null,
		noteIndex: number
	): number {
		if (timer?.sample || channel.tonePeriod <= 0) {
			return 0;
		}
		const drivesTimerRate = timer?.row?.sidPeriodMode === 'auto';
		if (!channel.toneEnabled && !drivesTimerRate) {
			return 0;
		}
		return channel.tonePeriod - (this.tuningTable[noteIndex] ?? channel.tonePeriod);
	}

	private samplePitchNoteIndex(): number {
		return this.toNoteIndex(Math.round(resolveSamplePitchReferencePeriod(this.clockHz())));
	}

	private toNoteIndex(tonePeriod: number): number {
		if (tonePeriod <= 0) {
			return this.tuningTable.length >> 1;
		}
		let bestIndex = 0;
		let bestDistance = Number.POSITIVE_INFINITY;
		const target = Math.log(tonePeriod);
		for (let index = 0; index < this.tuningTable.length; index++) {
			const distance = Math.abs(Math.log(this.tuningTable[index]!) - target);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		}
		return bestIndex;
	}

	private resolveInstrumentId(shape: InstrumentShape): number {
		const key = instrumentShapeKey(shape);
		const existing = this.instrumentIdsByShape.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const numericId = this.input.instrumentIdOffset + this.instruments.length + 1;
		if (numericId > MAX_INSTRUMENT_ID_NUM) {
			if (shape.toneAdd !== 0) {
				return this.resolveInstrumentId({ ...shape, toneAdd: 0 });
			}
			if (!this.instrumentLimitReported) {
				this.instrumentLimitReported = true;
				this.warnings.push(
					`Reached the ${MAX_INSTRUMENT_ID_NUM} instrument limit; later voices reuse existing instruments`
				);
			}
			return this.instruments.length > 0 ? this.input.instrumentIdOffset + 1 : 0;
		}
		const instrument = new Instrument(
			numberToInstrumentId(numericId),
			[
				new InstrumentRow({
					tone: shape.tone,
					noise: shape.noise,
					envelope: shape.envelope,
					retriggerEnvelope: false,
					toneAdd: shape.toneAdd,
					noiseAdd: 0,
					envelopeAdd: 0,
					volume: FULL_VOLUME,
					loop: true,
					amplitudeSliding: false,
					amplitudeSlideUp: false,
					toneAccumulation: false,
					noiseAccumulation: false,
					envelopeAccumulation: false
				})
			],
			0,
			describeInstrument(shape, numericId)
		);

		const extended = instrument as Instrument & {
			timerRows?: AyTimerRow[];
			timerLoop?: number;
			timerPwmDuty?: number;
			sampleData?: number[];
			sampleRate?: number;
			sampleStart?: number;
			sampleEnd?: number;
			sampleLoopStart?: number;
			sampleLoopEnabled?: boolean;
		};

		if (shape.timer?.row) {
			extended.timerRows = [shape.timer.row];
			extended.timerLoop = 0;
			if (shape.timer.pwmDuty !== null) {
				extended.timerPwmDuty = shape.timer.pwmDuty;
			}
		}

		const sample = shape.timer?.sample;
		if (sample) {
			extended.sampleData = sample.data;
			extended.sampleRate = sample.rate;
			extended.sampleStart = 0;
			extended.sampleEnd = sample.data.length - 1;
			extended.sampleLoopStart = sample.loopStart ?? 0;
			extended.sampleLoopEnabled = sample.loopStart !== null;
		}

		this.instruments.push(instrument);
		this.instrumentIdsByShape.set(key, numericId);
		return numericId;
	}

	private resolveTimerEffectsPerFrame(): Array<Array<TimerEffect | null>> {
		const perChannel: Array<Array<TimerEffect | null>> = Array.from(
			{ length: AY_TONE_CHANNELS },
			() => new Array<TimerEffect | null>(this.input.track.frameCount).fill(null)
		);

		for (const segment of this.input.segments) {
			const effect = this.toTimerEffect(segment);
			if (!effect) {
				continue;
			}
			const lane = perChannel[effect.channelIndex]!;
			for (let frame = segment.startFrame; frame < segment.endFrame; frame++) {
				lane[frame] = effect;
			}
			if (segment.retrigger) {
				this.retriggerFrames[effect.channelIndex]!.add(segment.startFrame);
			}
		}

		return perChannel;
	}

	private toTimerEffect(segment: TaymTimerSegment): TimerEffect | null {
		const targets = segment.bindings.map((binding) => binding.targetId);

		if (targets.length === 1) {
			const targetId = targets[0]!;
			if (
				targetId >= AY_TARGET.amplitudeA &&
				targetId < AY_TARGET.amplitudeA + AY_TONE_CHANNELS
			) {
				return this.toAmplitudeEffect(segment, targetId - AY_TARGET.amplitudeA, targetId);
			}
			if (targetId === AY_TARGET.envelopeShape) {
				const waveform = this.laneWaveform(segment, targetId);
				const timing = this.resolveTimerTiming(segment, waveform.values);
				return {
					channelIndex: this.resolveEnvelopeChannel(segment),
					ownsAmplitude: false,
					amplitudeLevel: null,
					sample: null,
					pwmDuty: timing.pwmDuty,
					row: {
						sid: false,
						syncbuzzer: true,
						sidPeriodMode: 'manual',
						period: timing.period,
						timerWaveform: waveform.values,
						timerWaveformLoop: waveform.loop
					}
				};
			}
		}

		if (targets.length === 2) {
			const toneChannel = toneTargetChannel(targets);
			if (toneChannel !== null) {
				const offsets = this.laneWordOffsets(segment, toneChannel * 2, toneChannel * 2 + 1);
				const timing = this.resolveTimerTiming(segment, offsets.values);
				return {
					channelIndex: toneChannel,
					ownsAmplitude: false,
					amplitudeLevel: null,
					sample: null,
					pwmDuty: timing.pwmDuty,
					row: {
						sid: false,
						fm: true,
						fmOffsetMode: 'period',
						sidPeriodMode: 'manual',
						period: timing.period,
						fmWaveform: offsets.values,
						fmWaveformLoop: offsets.loop
					}
				};
			}
			if (
				targets[0] === AY_TARGET.envelopePeriodFine &&
				targets[1] === AY_TARGET.envelopePeriodCoarse
			) {
				const offsets = this.laneWordOffsets(
					segment,
					AY_TARGET.envelopePeriodFine,
					AY_TARGET.envelopePeriodCoarse
				);
				const timing = this.resolveTimerTiming(segment, offsets.values);
				return {
					channelIndex: this.resolveEnvelopeChannel(segment),
					ownsAmplitude: false,
					amplitudeLevel: null,
					sample: null,
					pwmDuty: timing.pwmDuty,
					row: {
						sid: false,
						envFm: true,
						fmOffsetMode: 'period',
						sidPeriodMode: 'manual',
						period: timing.period,
						envFmWaveform: offsets.values,
						envFmWaveformLoop: offsets.loop
					}
				};
			}
		}

		this.warnings.push(
			`Timer ${segment.timerIndex} drives ${targets
				.map((target) => `R${target}`)
				.join(' + ')}, which has no Bitphase timer-effect equivalent`
		);
		return null;
	}

	private toAmplitudeEffect(
		segment: TaymTimerSegment,
		channelIndex: number,
		targetId: number
	): TimerEffect {
		const lane =
			segment.bindings.find((binding) => binding.targetId === targetId)?.lane ?? null;

		if (lane && this.isSampleLane(lane.length, lane.loopIndex)) {
			return {
				channelIndex,
				ownsAmplitude: true,
				amplitudeLevel: FULL_VOLUME,
				row: null,
				pwmDuty: null,
				sample: {
					laneKey: `${lane.valueOffset}:${lane.length}`,
					data: this.toSampleBytes(lane.values),
					rate: clampInstrumentSampleRate(Math.round(segment.rateHz)),
					loopStart: lane.loopIndex
				}
			};
		}

		const waveform = this.laneWaveform(segment, targetId);
		const pulse = toPulseWaveform(waveform.values);
		const timing = this.resolveTimerTiming(segment, waveform.values);
		return {
			channelIndex,
			ownsAmplitude: true,
			amplitudeLevel: pulse.level,
			sample: null,
			pwmDuty: timing.pwmDuty,
			row: {
				sid: true,
				timerWaveform: pulse.values,
				timerWaveformLoop: waveform.loop,
				...this.resolveSidPeriod(segment, channelIndex, timing.period)
			}
		};
	}

	private resolveSidPeriod(
		segment: TaymTimerSegment,
		channelIndex: number,
		period: number
	): Pick<AyTimerRow, 'sidPeriodMode' | 'period' | 'semitone' | 'detune'> {
		const tonePeriod = this.frameState(segment.startFrame).channels[channelIndex]!.tonePeriod;
		if (tonePeriod > 0) {
			const semitone = Math.round(12 * Math.log2(tonePeriod / period));
			const detune = period - Math.round(tonePeriod * Math.pow(2, -semitone / 12));
			if (
				Math.abs(semitone) <= AY_SID_AUTO_MAX_SEMITONE &&
				Math.abs(detune) <= AY_SID_AUTO_MAX_DETUNE
			) {
				return { sidPeriodMode: 'auto', semitone, detune };
			}
		}
		return { sidPeriodMode: 'manual', period };
	}

	private isSampleLane(length: number, loopIndex: number | null): boolean {
		if (length > AY_TIMER_WAVEFORM_MAX_LENGTH) {
			return true;
		}
		return loopIndex === null && length >= AY_SAMPLE_MIN_LANE_LENGTH;
	}

	private toSampleBytes(values: number[]): number[] {
		const dacTable = this.input.chip.variant === 1 ? SAMPLE_DAC_TABLE_YM : SAMPLE_DAC_TABLE_AY;
		if (values.length > MAX_INSTRUMENT_SAMPLE_BYTES) {
			this.warnings.push(
				`A ${values.length}-step amplitude lane was truncated to the ${MAX_INSTRUMENT_SAMPLE_BYTES}-byte sample limit`
			);
		}
		return values
			.slice(0, MAX_INSTRUMENT_SAMPLE_BYTES)
			.map((value) => dacTable[value & AY_AMPLITUDE_LEVEL_MASK]!);
	}

	private resolveTimerTiming(
		segment: TaymTimerSegment,
		waveform?: number[]
	): {
		period: number;
		pwmDuty: number | null;
	} {
		const periods = segment.intervalRatesHz
			.filter((rate) => rate > 0)
			.map((rate) => this.toEnginePeriod(rate));

		if (periods.length === 0) {
			return { period: 1, pwmDuty: null };
		}
		if (periods.length === 2 && periods[0] !== periods[1]) {
			const cycle = periods[0]! + periods[1]!;
			const highStep = Math.max(0, waveform?.findIndex((value) => (value & 0x0f) !== 0) ?? 0);
			const highPeriod = periods[highStep === 1 ? 1 : 0]!;
			return {
				period: Math.max(1, Math.round(cycle / 2)),
				pwmDuty: Math.max(1, Math.min(99, Math.round((highPeriod / cycle) * 100)))
			};
		}
		return { period: periods[0]!, pwmDuty: null };
	}

	private toEnginePeriod(rateHz: number): number {
		const period = Math.round(this.clockHz() / (AY_ENGINE_TIMER_PRESCALER * rateHz));
		return Math.max(1, Math.min(0xffff, period));
	}

	private resolveEnvelopeChannel(segment: TaymTimerSegment): number {
		const state = this.frameState(segment.startFrame);
		const channel = state.channels.findIndex((entry) => entry.envelopeMode);
		return channel >= 0 ? channel : 0;
	}

	private laneWaveform(
		segment: TaymTimerSegment,
		targetId: number
	): { values: number[]; loop: number } {
		const binding = segment.bindings.find((entry) => entry.targetId === targetId)!;
		if (!binding.lane) {
			return { values: [binding.inlineValue & 0x0f], loop: 0 };
		}
		return {
			values: binding.lane.values
				.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
				.map((value) => value & 0x0f),
			loop: binding.lane.loopIndex ?? 0
		};
	}

	private laneWordOffsets(
		segment: TaymTimerSegment,
		fineTargetId: number,
		coarseTargetId: number
	): { values: number[]; loop: number } {
		const fine = segment.bindings.find((entry) => entry.targetId === fineTargetId)!;
		const coarse = segment.bindings.find((entry) => entry.targetId === coarseTargetId)!;
		const fineValues = fine.lane ? fine.lane.values : [fine.inlineValue];
		const coarseValues = coarse.lane ? coarse.lane.values : [coarse.inlineValue];
		const length = Math.min(
			Math.max(fineValues.length, coarseValues.length),
			AY_TIMER_WAVEFORM_MAX_LENGTH
		);
		const basePeriod = this.resolveBasePeriod(segment, fineTargetId);

		const values: number[] = [];
		for (let index = 0; index < length; index++) {
			const low = fineValues[index % fineValues.length]! & 0xff;
			const high = coarseValues[index % coarseValues.length]! & 0xff;
			values.push((low | (high << 8)) - basePeriod);
		}

		return { values, loop: fine.lane?.loopIndex ?? coarse.lane?.loopIndex ?? 0 };
	}

	private resolveBasePeriod(segment: TaymTimerSegment, fineTargetId: number): number {
		const state = this.frameState(segment.startFrame);
		if (fineTargetId === AY_TARGET.envelopePeriodFine) {
			return state.envelopePeriod;
		}
		return state.channels[fineTargetId >> 1]?.tonePeriod ?? 0;
	}
}

function createCarry(): ChannelCarry {
	return {
		noteIndex: -1,
		volume: NO_VOLUME_STATE,
		instrumentId: 0,
		voiced: false,
		envelopeArmed: false
	};
}

function resetCarry(carry: ChannelCarry): void {
	carry.noteIndex = -1;
	carry.volume = NO_VOLUME_STATE;
	carry.instrumentId = 0;
	carry.voiced = false;
	carry.envelopeArmed = false;
}

function toPulseWaveform(values: number[]): { values: number[]; level: number } {
	const peak = Math.max(...values);
	if (peak === 0 || !values.every((value) => value === 0 || value === peak)) {
		return { values, level: FULL_VOLUME };
	}
	return { values: values.map((value) => (value === 0 ? 0 : FULL_VOLUME)), level: peak };
}

function toneTargetChannel(targets: number[]): number | null {
	for (let channel = 0; channel < AY_TONE_CHANNELS; channel++) {
		const fine = AY_TARGET.toneFineA + channel * 2;
		if (targets[0] === fine && targets[1] === fine + 1) {
			return channel;
		}
	}
	return null;
}

function toPatternEnvelopeShape(shape: number): number {
	if (shape <= 3) {
		return 9;
	}
	if (shape <= 7 || shape === 15) {
		return 4;
	}
	return shape;
}

function toNote(noteIndex: number): Note {
	return new Note(NoteName.C + (noteIndex % 12), Math.floor(noteIndex / 12) + 1);
}

function instrumentShapeKey(shape: InstrumentShape): string {
	const mixer = `${shape.tone ? 'T' : '-'}${shape.noise ? 'N' : '-'}${shape.envelope ? 'E' : '-'}${shape.toneAdd}`;
	if (!shape.timer) {
		return mixer;
	}
	if (shape.timer.sample) {
		const sample = shape.timer.sample;
		return `sample|${sample.laneKey}|${sample.rate}|${sample.loopStart ?? 'none'}`;
	}
	const timer = shape.timer.row!;
	return [
		mixer,
		timer.sid ? 'sid' : '',
		timer.syncbuzzer ? 'buzz' : '',
		timer.fm ? 'fm' : '',
		timer.envFm ? 'envfm' : '',
		timer.sidPeriodMode ?? 'auto',
		timer.period ?? 0,
		timer.semitone ?? 0,
		timer.detune ?? 0,
		shape.timer.pwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY,
		(timer.timerWaveform ?? []).join('.'),
		timer.timerWaveformLoop ?? 0,
		(timer.fmWaveform ?? []).join('.'),
		(timer.envFmWaveform ?? []).join('.')
	].join('|');
}

function describeInstrument(shape: InstrumentShape, numericId: number): string {
	if (shape.timer?.sample) {
		return `Sample ${shape.timer.sample.rate} Hz`;
	}
	const parts: string[] = [];
	if (shape.tone) parts.push('Tone');
	if (shape.noise) parts.push('Noise');
	if (shape.envelope) parts.push('Env');
	if (shape.timer?.row?.sid) parts.push('SID');
	if (shape.timer?.row?.syncbuzzer) parts.push('Buzzer');
	if (shape.timer?.row?.fm) parts.push('FM');
	if (shape.timer?.row?.envFm) parts.push('EnvFM');
	if (shape.toneAdd !== 0) {
		parts.push(shape.toneAdd > 0 ? `+${shape.toneAdd}` : `${shape.toneAdd}`);
	}
	return parts.length > 0 ? parts.join(' ') : `Instrument ${numberToInstrumentId(numericId)}`;
}

export function importTaymAyChip(input: TaymChipImportInput): TaymChipImportResult {
	return new TaymAySongBuilder(input).build();
}
