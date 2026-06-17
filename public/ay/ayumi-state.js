import { DEFAULT_AYM_FREQUENCY } from './ayumi-constants.js';
import TrackerState from '../tracker/tracker-state.js';

const AY_CHANNEL_ARRAY_SPECS = [
	['channelInstruments', -1],
	['instrumentPositions', 0],
	['channelTimerPositions', 0],
	['channelInstrumentVolumes', 0],
	['channelToneAccumulator', 0],
	['channelNoiseAccumulator', 0],
	['channelEnvelopeAccumulator', 0],
	['channelAmplitudeSliding', 0],
	['channelTimerPwmSweep', -1],
	['channelEnvelopeEnabled', false],
	['channelMuted', false],
	['channelSoundEnabled', false],
	['channelTimerEffectReset', false],
	['channelSamplePositions', 0],
	['channelSamplePhase', 0],
	['channelPatternEnvelopeShapes', 0]
];

class AyumiState extends TrackerState {
	constructor(channelCount = 3, sharedTimeline = null) {
		super(channelCount, sharedTimeline);
		this.wasmModule = null;
		this.ayumiPtr = null;
		this.aymFrequency = DEFAULT_AYM_FREQUENCY;
		this.isYM = 0;
		this.isST = 0;
		this.wasmBuffer = null;

		this.instruments = [];
		this.instrumentIdToIndex = new Map();

		for (const [name, defaultVal] of AY_CHANNEL_ARRAY_SPECS) {
			this[name] = Array(channelCount).fill(defaultVal);
		}

		this.envelopeSlideDelay = 0;
		this.envelopeSlideDelayCounter = 0;
		this.envelopeSlideDelta = 0;
		this.envelopeSlideCurrent = 0;
		this.envelopeBaseValue = 0;
		this.envelopePortamentoTarget = -1;
		this.envelopePortamentoDelta = 0;
		this.envelopePortamentoActive = false;
		this.envelopePortamentoDelay = 0;
		this.envelopePortamentoCount = 0;
		this.envelopePortamentoStep = 0;
		this.envelopeOnDuration = 0;
		this.envelopeOffDuration = 0;
		this.envelopeOnOffCounter = 0;
		this.envelopeOnOffEnabled = false;
		this.envelopeArpeggioSemitone1 = 0;
		this.envelopeArpeggioSemitone2 = 0;
		this.envelopeArpeggioDelay = 0;
		this.envelopeArpeggioCounter = 0;
		this.envelopeArpeggioPosition = 0;
		this.envelopeArpeggioBaseValue = 0;
		this.noiseBaseValue = 0;
		this.noisePreviousValue = 0;
		this.noiseAddValue = 0;
		this.envelopeAddValue = 0;

		this.envelopeEffectTable = -1;
		this.envelopeEffectTablePosition = 0;
		this.envelopeEffectTableCounter = 0;
		this.envelopeEffectTableDelay = 1;
		this.envelopeEffectType = 0;
		this.envelopeVibratoSpeed = 1;
		this.envelopeVibratoDepth = 0;
		this.envelopeVibratoDelay = 0;
		this.envelopeVibratoCounter = 0;
		this.envelopeVibratoPosition = 0;
		this.envelopeVibratoSliding = 0;

		this.autoEnvelopeActive = false;
		this.autoEnvelopeNumerator = 0;
		this.autoEnvelopeDenominator = 0;
		this.envelopeDetune = 0;
	}

	setWasmModule(module, ptr, wasmBuffer) {
		this.wasmModule = module;
		this.ayumiPtr = ptr;
		this.wasmBuffer = wasmBuffer;
	}

	setAymFrequency(frequency) {
		this.aymFrequency = frequency;
	}

	setChipVariant(chipVariant) {
		this.isYM = chipVariant === 'YM' ? 1 : 0;
	}

	setStMixing(enabled) {
		this.isST = enabled ? 1 : 0;
		if (enabled) {
			this.isYM = 1;
		}
	}

	setInstruments(instruments) {
		this.instruments = instruments;
		this.instrumentIdToIndex = new Map();
		instruments.forEach((instrument, index) => {
			if (instrument && instrument.id !== undefined) {
				let numericId;
				if (typeof instrument.id === 'string') {
					numericId = parseInt(instrument.id, 36);
				} else {
					numericId = instrument.id;
				}
				this.instrumentIdToIndex.set(numericId, index);
			}
		});
	}

	resizeChannels(newCount) {
		super.resizeChannels(newCount);
		for (const [name, defaultVal] of AY_CHANNEL_ARRAY_SPECS) {
			const arr = this[name];
			while (arr.length < newCount) arr.push(defaultVal);
			if (arr.length > newCount) arr.length = newCount;
		}
	}

	reset(opts = {}) {
		super.reset(opts);

		for (const [name, defaultVal] of AY_CHANNEL_ARRAY_SPECS) {
			if (name === 'channelMuted') continue;
			this[name].fill(defaultVal);
		}

		this.envelopeSlideDelay = 0;
		this.envelopeSlideDelayCounter = 0;
		this.envelopeSlideDelta = 0;
		this.envelopeSlideCurrent = 0;
		this.envelopeBaseValue = 0;
		this.envelopePortamentoTarget = -1;
		this.envelopePortamentoDelta = 0;
		this.envelopePortamentoActive = false;
		this.envelopePortamentoDelay = 0;
		this.envelopePortamentoCount = 0;
		this.envelopePortamentoStep = 0;
		this.envelopeOnDuration = 0;
		this.envelopeOffDuration = 0;
		this.envelopeOnOffCounter = 0;
		this.envelopeOnOffEnabled = false;
		this.envelopeArpeggioSemitone1 = 0;
		this.envelopeArpeggioSemitone2 = 0;
		this.envelopeArpeggioDelay = 0;
		this.envelopeArpeggioCounter = 0;
		this.envelopeArpeggioPosition = 0;
		this.envelopeArpeggioBaseValue = 0;
		this.noiseBaseValue = 0;
		this.envelopeAddValue = 0;
		this.noiseAddValue = 0;

		this.envelopeEffectTable = -1;
		this.envelopeEffectTablePosition = 0;
		this.envelopeEffectTableCounter = 0;
		this.envelopeEffectTableDelay = 1;
		this.envelopeEffectType = 0;
		this.envelopeVibratoSpeed = 1;
		this.envelopeVibratoDepth = 0;
		this.envelopeVibratoDelay = 0;
		this.envelopeVibratoCounter = 0;
		this.envelopeVibratoPosition = 0;
		this.envelopeVibratoSliding = 0;

		this.autoEnvelopeActive = false;
		this.autoEnvelopeNumerator = 0;
		this.autoEnvelopeDenominator = 0;
		this.envelopeDetune = 0;
	}
}

export default AyumiState;
