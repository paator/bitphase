import TrackerState from '../tracker/tracker-state.js';
import {
	buildInstrumentIdToIndex,
	initChipChannelArrays,
	resetChipChannelArrays,
	resizeChipChannelArrays
} from '../tracker/tracker-chip-state.js';
import { SAA_CHANNEL_COUNT, SAA_LEVEL_MAX, SAA_SAM_CLOCK } from './saa-constants.js';

const SAA_CHANNEL_ARRAY_SPECS = [
	['channelInstruments', -1],
	['instrumentPositions', 0],
	['channelMacroReleased', false],
	['channelMacroReleaseTick', -1],
	['channelInstrumentLeft', SAA_LEVEL_MAX],
	['channelInstrumentRight', SAA_LEVEL_MAX],
	['channelPatternLeft', SAA_LEVEL_MAX],
	['channelPatternRight', SAA_LEVEL_MAX],
	['channelAmplitudeSliding', 0],
	['channelToneAccumulator', 0],
	['channelNoiseAccumulator', 0],
	['channelStereoInvert', false],
	['channelMuted', false],
	['channelSoundEnabled', false],
	['channelKeyOn', false]
];

class SaaState extends TrackerState {
	constructor(sharedTimeline) {
		super(SAA_CHANNEL_COUNT, sharedTimeline);
		this.wasmModule = null;
		this.wasmBuffer = null;
		this.chipPtr = 0;
		this.clockRate = SAA_SAM_CLOCK;
		this.instruments = [];
		this.instrumentIdToIndex = new Map();
		initChipChannelArrays(this, SAA_CHANNEL_COUNT, SAA_CHANNEL_ARRAY_SPECS);
		this.noiseClock0 = 0;
		this.noiseClock1 = 0;
		this.envelopeRetrigger0 = false;
		this.envelopeRetrigger1 = false;
		this.envelopeCommand0 = null;
		this.envelopeCommand1 = null;
		this.noiseLock0 = false;
		this.noiseLock1 = false;
	}

	setWasmModule(wasmModule, chipPtr, wasmBuffer) {
		this.wasmModule = wasmModule;
		this.chipPtr = chipPtr;
		this.wasmBuffer = wasmBuffer;
	}

	setClockRate(clockRate) {
		if (clockRate > 0) this.clockRate = clockRate;
	}

	setInstruments(instruments) {
		this.instruments = instruments;
		this.instrumentIdToIndex = buildInstrumentIdToIndex(instruments);
	}

	resizeChannels(newCount) {
		super.resizeChannels(newCount);
		resizeChipChannelArrays(this, newCount, SAA_CHANNEL_ARRAY_SPECS);
	}

	reset(opts = {}) {
		super.reset(opts);
		resetChipChannelArrays(this, SAA_CHANNEL_ARRAY_SPECS);
		this.noiseClock0 = 0;
		this.noiseClock1 = 0;
		this.envelopeRetrigger0 = false;
		this.envelopeRetrigger1 = false;
		this.envelopeCommand0 = null;
		this.envelopeCommand1 = null;
		this.noiseLock0 = false;
		this.noiseLock1 = false;
	}
}

export default SaaState;
