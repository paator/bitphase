import TrackerState from '../tracker/tracker-state.js';
import { NES_CHANNEL_COUNT, NES_NTSC_CPU_FREQUENCY } from './nes-constants.js';

const NES_CHANNEL_ARRAY_SPECS = [
	['channelInstruments', -1],
	['instrumentPositions', 0],
	['channelInstrumentVolumes', 0],
	['channelPatternVolumes', 15],
	['channelMuted', false],
	['channelSoundEnabled', false],
	['channelKeyOn', false]
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

		for (const [name, defaultVal] of NES_CHANNEL_ARRAY_SPECS) {
			this[name] = Array(NES_CHANNEL_COUNT).fill(defaultVal);
		}
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
		for (const [name, defaultVal] of NES_CHANNEL_ARRAY_SPECS) {
			const arr = this[name];
			while (arr.length < newCount) arr.push(defaultVal);
			if (arr.length > newCount) arr.length = newCount;
		}
	}
}

export default NesState;
