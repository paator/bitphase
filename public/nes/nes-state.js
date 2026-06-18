import TrackerState from '../tracker/tracker-state.js';
import {
	buildInstrumentIdToIndex,
	initChipChannelArrays,
	resetChipChannelArrays,
	resizeChipChannelArrays
} from '../tracker/tracker-chip-state.js';
import { NES_CHANNEL_COUNT, NES_NTSC_CPU_FREQUENCY } from './nes-constants.js';

const NES_CHANNEL_ARRAY_SPECS = [
	['channelInstruments', -1],
	['instrumentPositions', 0],
	['channelInstrumentVolumes', 0],
	['channelPatternVolumes', 15],
	['channelMuted', false],
	['channelSoundEnabled', false],
	['channelKeyOn', false],
	['channelToneAccumulator', 0]
];

class NesState extends TrackerState {
	constructor(sharedTimeline) {
		super(NES_CHANNEL_COUNT, sharedTimeline);
		this.wasmModule = null;
		this.wasmBuffer = null;
		this.apuPtr = 0;
		this.dmcPtr = 0;
		this.cpuFrequency = NES_NTSC_CPU_FREQUENCY;
		this.chipVariant = 'NTSC';

		this.instruments = [];
		this.instrumentIdToIndex = new Map();

		initChipChannelArrays(this, NES_CHANNEL_COUNT, NES_CHANNEL_ARRAY_SPECS);
	}

	setWasmModule(wasmModule, apuPtr, dmcPtr, wasmBuffer) {
		this.wasmModule = wasmModule;
		this.apuPtr = apuPtr;
		this.dmcPtr = dmcPtr;
		this.wasmBuffer = wasmBuffer;
	}

	setCpuFrequency(frequency) {
		if (frequency > 0) {
			this.cpuFrequency = frequency;
		}
	}

	setChipVariant(variant) {
		this.chipVariant = variant ?? 'NTSC';
	}

	setInstruments(instruments) {
		this.instruments = instruments;
		this.instrumentIdToIndex = buildInstrumentIdToIndex(instruments);
	}

	resizeChannels(newCount) {
		super.resizeChannels(newCount);
		resizeChipChannelArrays(this, newCount, NES_CHANNEL_ARRAY_SPECS);
	}

	reset(opts = {}) {
		super.reset(opts);
		resetChipChannelArrays(this, NES_CHANNEL_ARRAY_SPECS);
	}
}

export default NesState;
