import NesChipRegisterState from './nes-chip-register-state.js';
import {
	NES_APU_STRUCT_SIZE,
	NES_DMC_STRUCT_SIZE,
	NES_NTSC_CPU_FREQUENCY,
	NES_SQUARE_LENGTH_NIBBLE,
	NES_TRIANGLE_LINEAR_RELOAD,
	NES_APU_OUTPUT_SCALE
} from './nes-constants.js';

const SQUARE_BASE = [0x4000, 0x4004];
const TRIANGLE_BASE = 0x4008;
const NOISE_BASE = 0x400c;
const SQUARE_SWEEP_DISABLED = 0x08;

function buildSquareVolumeReg(volume, duty) {
	return (3 << 4) | (volume & 15) | ((duty & 3) << 6);
}

class NesApuEngine {
	constructor(wasmModule, apuPtr, dmcPtr) {
		this.wasmModule = wasmModule;
		this.apuPtr = apuPtr;
		this.dmcPtr = dmcPtr;
		this.lastState = new NesChipRegisterState();
		this.cpuFrequency = NES_NTSC_CPU_FREQUENCY;
		this.isPal = false;
		this.clockAccumulator = 0;
		this.outputPtr = wasmModule.malloc(16);
		this.forceFullApply = false;
		this._lastApu4015 = -1;
		this._lastDmc4015 = -1;
		this._lastOutput = { left: 0, right: 0 };
	}

	setCpuFrequency(frequency) {
		if (frequency > 0) {
			this.cpuFrequency = frequency;
		}
	}

	setChipVariant(variant) {
		const isPal = variant === 'PAL';
		if (this.isPal !== isPal) {
			this.isPal = isPal;
			this.wasmModule.nes_dmc_SetPal(this.dmcPtr, isPal ? 1 : 0);
			this.forceFullApply = true;
		}
	}

	reset() {
		this.wasmModule.nes_apu_Reset(this.apuPtr);
		this.wasmModule.nes_dmc_Reset(this.dmcPtr);
		this.wasmModule.nes_dmc_SetAPU(this.dmcPtr, this.apuPtr);
		this.wasmModule.nes_dmc_SetPal(this.dmcPtr, this.isPal ? 1 : 0);
		this.lastState.reset();
		this.forceFullApply = true;
		this.clockAccumulator = 0;
	}

	_writeSquare(channelIndex, channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[channelIndex];
		const base = SQUARE_BASE[channelIndex];
		const volumeReg = buildSquareVolumeReg(channel.volume, channel.duty);
		const period = channel.period > 0 ? channel.period - 1 : 0;
		const periodLow = period & 0xff;
		const periodHigh = (NES_SQUARE_LENGTH_NIBBLE << 3) | ((period >> 8) & 7);
		const lastPeriodHigh = (NES_SQUARE_LENGTH_NIBBLE << 3) | ((last.period >> 8) & 7);

		if (forceApply || volumeReg !== buildSquareVolumeReg(last.volume, last.duty)) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base, volumeReg);
			last.volume = channel.volume;
			last.duty = channel.duty;
		}

		if (forceApply || last.sweepReg !== SQUARE_SWEEP_DISABLED) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 1, SQUARE_SWEEP_DISABLED);
			last.sweepReg = SQUARE_SWEEP_DISABLED;
		}

		if (forceApply || periodLow !== (last.period & 0xff)) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 2, periodLow);
		}

		if (forceApply || triggerChannel || channel.retrigger || periodHigh !== lastPeriodHigh) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 3, periodHigh);
		}

		last.period = period;
		last.retrigger = channel.retrigger;
	}

	_writeTriangle(channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[2];
		const linearReg = (1 << 7) | NES_TRIANGLE_LINEAR_RELOAD;
		const periodLow = channel.period & 0xff;
		const periodHigh = (NES_SQUARE_LENGTH_NIBBLE << 3) | ((channel.period >> 8) & 7);
		const lastPeriodHigh = (NES_SQUARE_LENGTH_NIBBLE << 3) | ((last.period >> 8) & 7);

		if (forceApply || linearReg !== ((1 << 7) | NES_TRIANGLE_LINEAR_RELOAD)) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE, linearReg);
		}
		if (forceApply || periodLow !== (last.period & 0xff)) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 2, periodLow);
		}
		if (forceApply || triggerChannel || channel.retrigger || periodHigh !== lastPeriodHigh) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 3, periodHigh);
		}
		last.period = channel.period;
		last.retrigger = channel.retrigger;
	}

	_writeNoise(channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[3];
		const volumeReg = buildSquareVolumeReg(channel.volume, 0);
		const periodReg = (channel.noiseMode ? 0x80 : 0) | (channel.noisePeriod & 15);

		if (forceApply || volumeReg !== buildSquareVolumeReg(last.volume, 0)) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE, volumeReg);
			last.volume = channel.volume;
		}
		if (forceApply || periodReg !== ((last.noiseMode ? 0x80 : 0) | (last.noisePeriod & 15))) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE + 2, periodReg);
			last.noisePeriod = channel.noisePeriod;
			last.noiseMode = channel.noiseMode;
		}
		if (forceApply || triggerChannel || channel.retrigger) {
			this.wasmModule.nes_dmc_Write(
				this.dmcPtr,
				NOISE_BASE + 3,
				NES_SQUARE_LENGTH_NIBBLE << 3
			);
			last.retrigger = channel.retrigger;
		}
	}

	_channelJustEnabled(mask, bit) {
		return (this._lastApu4015 & bit) === 0 && (mask & bit) !== 0;
	}

	_dmcChannelJustEnabled(mask, bit) {
		return (this._lastDmc4015 & bit) === 0 && (mask & bit) !== 0;
	}

	applyRegisterState(registerState) {
		const forceApply = this.forceFullApply;
		this.forceFullApply = false;

		let apu4015 = 0;
		let dmc4015 = 0;
		const squareChannels = [];
		let triangle = null;
		let noise = null;

		for (let i = 0; i < 2; i++) {
			const channel = registerState.channels[i];
			const last = this.lastState.channels[i];
			const isEnabled = channel.enabled && channel.period > 0 && channel.volume > 0;
			if (isEnabled) {
				apu4015 |= 1 << i;
				squareChannels.push({ index: i, channel });
			}
			last.enabled = isEnabled;
		}

		const triangleChannel = registerState.channels[2];
		const triangleLast = this.lastState.channels[2];
		const triangleEnabled = triangleChannel.enabled && triangleChannel.period > 0;
		if (triangleEnabled) {
			dmc4015 |= 4;
			triangle = triangleChannel;
		}
		triangleLast.enabled = triangleEnabled;

		const noiseChannel = registerState.channels[3];
		const noiseLast = this.lastState.channels[3];
		const noiseEnabled = noiseChannel.enabled && noiseChannel.volume > 0;
		if (noiseEnabled) {
			dmc4015 |= 8;
			noise = noiseChannel;
		}
		noiseLast.enabled = noiseEnabled;

		if (forceApply || apu4015 !== this._lastApu4015) {
			this.wasmModule.nes_apu_Write(this.apuPtr, 0x4015, apu4015);
			this._lastApu4015 = apu4015;
		}
		if (forceApply || dmc4015 !== this._lastDmc4015) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, 0x4015, dmc4015);
			this._lastDmc4015 = dmc4015;
		}

		for (const { index, channel } of squareChannels) {
			const bit = 1 << index;
			const triggerChannel = forceApply || this._channelJustEnabled(apu4015, bit);
			this._writeSquare(index, channel, forceApply, triggerChannel);
		}
		if (triangle) {
			const triggerChannel = forceApply || this._dmcChannelJustEnabled(dmc4015, 4);
			this._writeTriangle(triangle, forceApply, triggerChannel);
		}
		if (noise) {
			const triggerChannel = forceApply || this._dmcChannelJustEnabled(dmc4015, 8);
			this._writeNoise(noise, forceApply, triggerChannel);
		}
	}

	process(sampleRate) {
		this.clockAccumulator += this.cpuFrequency / sampleRate;
		const clocks = Math.floor(this.clockAccumulator);
		if (clocks <= 0) {
			return this._lastOutput;
		}
		this.clockAccumulator -= clocks;

		this.wasmModule.nes_dmc_TickFrameSequence(this.dmcPtr, clocks);
		this.wasmModule.nes_apu_Tick(this.apuPtr, clocks);
		this.wasmModule.nes_dmc_Tick(this.dmcPtr, clocks);

		const memory = this.wasmModule.memory.buffer;
		this.wasmModule.nes_apu_Render(this.apuPtr, this.outputPtr);
		this.wasmModule.nes_dmc_Render(this.dmcPtr, this.outputPtr + 8);
		const samples = new Int32Array(memory, this.outputPtr, 4);
		const left = (samples[0] + samples[2]) * NES_APU_OUTPUT_SCALE;
		const right = (samples[1] + samples[3]) * NES_APU_OUTPUT_SCALE;
		this._lastOutput = { left, right };
		return this._lastOutput;
	}

	dispose() {
		if (this.outputPtr) {
			this.wasmModule.free(this.outputPtr);
			this.outputPtr = 0;
		}
	}
}

export default NesApuEngine;

export function createNesApuEngine(wasmModule) {
	const apuPtr = wasmModule.malloc(NES_APU_STRUCT_SIZE);
	const dmcPtr = wasmModule.malloc(NES_DMC_STRUCT_SIZE);
	wasmModule.nes_apu_Init(apuPtr);
	wasmModule.nes_dmc_Init(dmcPtr);
	wasmModule.nes_dmc_SetAPU(dmcPtr, apuPtr);
	wasmModule.nes_apu_SetMask(apuPtr, 0);
	wasmModule.nes_dmc_SetMask(dmcPtr, 0);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 0, 128, 128);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 0, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 2, 128, 128);
	const engine = new NesApuEngine(wasmModule, apuPtr, dmcPtr);
	engine.reset();
	return { engine, apuPtr, dmcPtr };
}
