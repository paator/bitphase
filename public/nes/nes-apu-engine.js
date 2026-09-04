import NesChipRegisterState from './nes-chip-register-state.js';
import {
	NES_APU_STRUCT_SIZE,
	NES_DMC_STRUCT_SIZE,
	NES_NTSC_CPU_FREQUENCY,
	NES_SQUARE_LENGTH_NIBBLE,
	NES_TRIANGLE_LINEAR_RELOAD,
	NES_APU_OUTPUT_SCALE,
	NES_APU_STATUS_PULSE,
	NES_APU_STATUS_TRIANGLE_NOISE
} from './nes-constants.js';
import {
	buildNoiseSilentVolumeReg,
	buildSquareSilentVolumeReg,
	buildTriangleSilentLinearReg,
	NES_REGISTER_UNCHANGED,
	NES_SQUARE_SWEEP_DISABLED
} from './nes-instrument-utils.js';

const SQUARE_BASE = [0x4000, 0x4004];
const TRIANGLE_BASE = 0x4008;
const NOISE_BASE = 0x400c;

function buildSquareVolumeReg(volume, duty) {
	return (3 << 4) | (volume & 15) | ((duty & 3) << 6);
}

function isSquareChannelActive(channel) {
	return channel.enabled && channel.period > 0;
}

function isTriangleChannelActive(channel) {
	return channel.enabled && channel.period > 0;
}

function isNoiseChannelActive(channel) {
	return channel.enabled;
}

function buildApuOutputMask(registerState) {
	let mask = 0;
	if (!isSquareChannelActive(registerState.channels[0])) mask |= 1;
	if (!isSquareChannelActive(registerState.channels[1])) mask |= 2;
	return mask;
}

function buildDmcOutputMask(_registerState) {
	return 4;
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
		this._lastApuOutputMask = -1;
		this._lastDmcOutputMask = -1;
		this._lastOutput = { left: 0, right: 0 };
		this._scopeRawOut = [0, 0, 0, 0, 0];
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
		this._lastApu4015 = -1;
		this._lastDmc4015 = -1;
		this._lastApuOutputMask = -1;
		this._lastDmcOutputMask = -1;
		this._lastOutput = { left: 0, right: 0 };
		this._scopeRawOut = [0, 0, 0, 0, 0];
		this._parkTriangleDacAtZero();
	}

	_parkTriangleDacAtZero() {
		this.wasmModule.nes_dmc_Write(this.dmcPtr, 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE, 0x81);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 2, 1);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 3, 0x08);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, 0x4017, 0x80);
		this.wasmModule.nes_dmc_Tick(this.dmcPtr, 32);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE, 0);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 2, 0);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, 0x4017, 0x40);
	}

	_applyOutputMasks(registerState, forceApply) {
		const apuOutputMask = buildApuOutputMask(registerState);
		const dmcOutputMask = buildDmcOutputMask(registerState);
		if (forceApply || apuOutputMask !== this._lastApuOutputMask) {
			this.wasmModule.nes_apu_SetMask(this.apuPtr, apuOutputMask);
			this._lastApuOutputMask = apuOutputMask;
		}
		if (forceApply || dmcOutputMask !== this._lastDmcOutputMask) {
			this.wasmModule.nes_dmc_SetMask(this.dmcPtr, dmcOutputMask);
			this._lastDmcOutputMask = dmcOutputMask;
		}
	}

	_writeSquareSilent(channelIndex, channel) {
		const last = this.lastState.channels[channelIndex];
		const base = SQUARE_BASE[channelIndex];
		const volumeReg = buildSquareSilentVolumeReg(channel.duty);
		this.wasmModule.nes_apu_Write(this.apuPtr, base, volumeReg);
		this.wasmModule.nes_apu_Write(this.apuPtr, base + 1, NES_SQUARE_SWEEP_DISABLED);
		last.volumeReg = volumeReg;
		last.volume = 0;
		last.duty = channel.duty;
		last.sweepReg = NES_SQUARE_SWEEP_DISABLED;
		last.period = 0;
		last.lengthNibble = NES_REGISTER_UNCHANGED;
		last.retrigger = false;
	}

	_writeTriangleSilent() {
		const last = this.lastState.channels[2];
		const linearReg = buildTriangleSilentLinearReg();
		this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE, linearReg);
		last.linearReg = linearReg;
		last.retrigger = false;
	}

	_writeNoiseSilent() {
		const last = this.lastState.channels[3];
		const volumeReg = buildNoiseSilentVolumeReg();
		this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE, volumeReg);
		last.volumeReg = volumeReg;
		last.volume = 0;
		last.lengthNibble = NES_REGISTER_UNCHANGED;
		last.retrigger = false;
	}

	_writeSquare(channelIndex, channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[channelIndex];
		if (!isSquareChannelActive(channel)) {
			if (forceApply || last.enabled) {
				this._writeSquareSilent(channelIndex, channel);
			}
			last.enabled = false;
			return;
		}
		const base = SQUARE_BASE[channelIndex];
		const volumeReg =
			channel.volumeReg !== NES_REGISTER_UNCHANGED
				? channel.volumeReg
				: buildSquareVolumeReg(channel.volume, channel.duty);
		const lengthNibble =
			channel.lengthNibble !== NES_REGISTER_UNCHANGED
				? channel.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const period = channel.period > 0 ? channel.period - 1 : 0;
		const periodLow = period & 0xff;
		const periodHigh = (lengthNibble << 3) | ((period >> 8) & 7);
		const lastLengthNibble =
			last.lengthNibble !== NES_REGISTER_UNCHANGED
				? last.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const lastPeriodHigh = (lastLengthNibble << 3) | ((last.period >> 8) & 7);

		if (
			isSquareChannelActive(channel) &&
			(channel.volumeReg !== NES_REGISTER_UNCHANGED ||
				forceApply ||
				!last.enabled ||
				volumeReg !== last.volumeReg)
		) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base, volumeReg);
			last.volumeReg = volumeReg;
			last.volume = channel.volume;
			last.duty = channel.duty;
		}

		const sweepReg =
			channel.sweepReg === undefined || channel.sweepReg < 0
				? NES_SQUARE_SWEEP_DISABLED
				: channel.sweepReg;
		const sweepChanged = last.sweepReg !== sweepReg;
		const sweepUpdateOnly = channel.sweepUpdateOnly === true;
		const sweepActive = sweepReg !== NES_SQUARE_SWEEP_DISABLED;
		const sweepRetrigger =
			sweepActive && (triggerChannel || channel.retrigger) && !sweepUpdateOnly;
		const sweepChannelRetrigger = sweepChanged && !sweepUpdateOnly;
		if (forceApply || sweepChanged || sweepRetrigger) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 1, sweepReg);
			last.sweepReg = sweepReg;
		}

		if (
			forceApply ||
			periodLow !== (last.period & 0xff) ||
			sweepChannelRetrigger ||
			(channel.retrigger && sweepActive && !sweepUpdateOnly)
		) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 2, periodLow);
		}

		if (
			forceApply ||
			triggerChannel ||
			channel.retrigger ||
			periodHigh !== lastPeriodHigh ||
			sweepChannelRetrigger ||
			(channel.lengthNibble !== NES_REGISTER_UNCHANGED &&
				lengthNibble !== lastLengthNibble)
		) {
			this.wasmModule.nes_apu_Write(this.apuPtr, base + 3, periodHigh);
		}

		last.period = period;
		last.lengthNibble = channel.lengthNibble;
		last.retrigger = channel.retrigger;
	}

	_writeTriangle(channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[2];
		if (!isTriangleChannelActive(channel)) {
			if (forceApply || last.enabled) {
				this._writeTriangleSilent();
			}
			last.enabled = false;
			return;
		}
		const linearReg =
			channel.linearReg !== NES_REGISTER_UNCHANGED
				? channel.linearReg
				: (1 << 7) | NES_TRIANGLE_LINEAR_RELOAD;
		const lengthNibble =
			channel.lengthNibble !== NES_REGISTER_UNCHANGED
				? channel.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const periodLow = channel.period & 0xff;
		const periodHigh = (lengthNibble << 3) | ((channel.period >> 8) & 7);
		const lastLengthNibble =
			last.lengthNibble !== NES_REGISTER_UNCHANGED
				? last.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const lastPeriodHigh = (lastLengthNibble << 3) | ((last.period >> 8) & 7);

		const linearRegChanged =
			channel.linearReg !== NES_REGISTER_UNCHANGED && linearReg !== last.linearReg;
		if (forceApply || triggerChannel || channel.retrigger || linearRegChanged) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE, linearReg);
			last.linearReg = linearReg;
		}
		if (forceApply || periodLow !== (last.period & 0xff)) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 2, periodLow);
		}
		if (
			forceApply ||
			triggerChannel ||
			channel.retrigger ||
			periodHigh !== lastPeriodHigh ||
			(channel.lengthNibble !== NES_REGISTER_UNCHANGED &&
				lengthNibble !== lastLengthNibble)
		) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, TRIANGLE_BASE + 3, periodHigh);
		}
		last.period = channel.period;
		last.lengthNibble = channel.lengthNibble;
		last.retrigger = channel.retrigger;
	}

	_writeNoise(channel, forceApply, triggerChannel) {
		const last = this.lastState.channels[3];
		if (!isNoiseChannelActive(channel)) {
			if (forceApply || last.enabled) {
				this._writeNoiseSilent();
			}
			last.enabled = false;
			return;
		}
		const volumeReg =
			channel.volumeReg !== NES_REGISTER_UNCHANGED
				? channel.volumeReg
				: buildSquareVolumeReg(channel.volume, 0);
		const lengthNibble =
			channel.lengthNibble !== NES_REGISTER_UNCHANGED
				? channel.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const periodReg = (channel.noiseMode ? 0x80 : 0) | (channel.noisePeriod & 15);

		if (
			isNoiseChannelActive(channel) &&
			(channel.volumeReg !== NES_REGISTER_UNCHANGED ||
				forceApply ||
				!last.enabled ||
				volumeReg !== last.volumeReg)
		) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE, volumeReg);
			last.volumeReg = volumeReg;
			last.volume = channel.volume;
		}
		if (forceApply || periodReg !== ((last.noiseMode ? 0x80 : 0) | (last.noisePeriod & 15))) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE + 2, periodReg);
			last.noisePeriod = channel.noisePeriod;
			last.noiseMode = channel.noiseMode;
		}
		if (
			forceApply ||
			triggerChannel ||
			channel.retrigger ||
			(channel.lengthNibble !== NES_REGISTER_UNCHANGED &&
				lengthNibble !== last.lengthNibble)
		) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, NOISE_BASE + 3, lengthNibble << 3);
			last.lengthNibble = channel.lengthNibble;
			last.retrigger = channel.retrigger;
		}
	}

	applyRegisterState(registerState) {
		const forceApply = this.forceFullApply;
		this.forceFullApply = false;

		if (forceApply || this._lastApu4015 !== NES_APU_STATUS_PULSE) {
			this.wasmModule.nes_apu_Write(this.apuPtr, 0x4015, NES_APU_STATUS_PULSE);
			this._lastApu4015 = NES_APU_STATUS_PULSE;
		}
		if (forceApply || this._lastDmc4015 !== NES_APU_STATUS_TRIANGLE_NOISE) {
			this.wasmModule.nes_dmc_Write(this.dmcPtr, 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
			this._lastDmc4015 = NES_APU_STATUS_TRIANGLE_NOISE;
		}

		for (let i = 0; i < 2; i++) {
			const channel = registerState.channels[i];
			const last = this.lastState.channels[i];
			const isActive = isSquareChannelActive(channel);
			const triggerChannel = isActive && (channel.retrigger || !last.enabled);
			this._writeSquare(i, channel, forceApply, triggerChannel);
			last.enabled = isActive;
		}

		const triangleChannel = registerState.channels[2];
		const triangleLast = this.lastState.channels[2];
		const triangleActive = isTriangleChannelActive(triangleChannel);
		const triangleTrigger =
			triangleActive && (triangleChannel.retrigger || !triangleLast.enabled);
		this._writeTriangle(triangleChannel, forceApply, triangleTrigger);
		triangleLast.enabled = triangleActive;

		const noiseChannel = registerState.channels[3];
		const noiseLast = this.lastState.channels[3];
		const noiseActive = isNoiseChannelActive(noiseChannel);
		const noiseTrigger = noiseActive && (noiseChannel.retrigger || !noiseLast.enabled);
		this._writeNoise(noiseChannel, forceApply, noiseTrigger);
		noiseLast.enabled = noiseActive;

		this._applyOutputMasks(registerState, forceApply);
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

		if (this.canReadChannelOutputs()) {
			this._scopeRawOut[0] = this.wasmModule.nes_apu_GetOut(this.apuPtr, 0);
			this._scopeRawOut[1] = this.wasmModule.nes_apu_GetOut(this.apuPtr, 1);
			this._scopeRawOut[2] = this.wasmModule.nes_dmc_GetOut(this.dmcPtr, 0);
			this._scopeRawOut[3] = this.wasmModule.nes_dmc_GetOut(this.dmcPtr, 1);
			this._scopeRawOut[4] = this.wasmModule.nes_dmc_GetOut(this.dmcPtr, 2);
		}

		const memory = this.wasmModule.memory.buffer;
		this.wasmModule.nes_apu_Render(this.apuPtr, this.outputPtr);
		this.wasmModule.nes_dmc_Render(this.dmcPtr, this.outputPtr + 8);
		const samples = new Int32Array(memory, this.outputPtr, 4);
		const left = (samples[0] + samples[2]) * NES_APU_OUTPUT_SCALE;
		const right = (samples[1] + samples[3]) * NES_APU_OUTPUT_SCALE;
		this._lastOutput = { left, right };
		return this._lastOutput;
	}

	canReadChannelOutputs() {
		return (
			typeof this.wasmModule.nes_apu_GetOut === 'function' &&
			typeof this.wasmModule.nes_dmc_GetOut === 'function'
		);
	}

	getChannelRawOut(channelIndex) {
		if (channelIndex >= 0 && channelIndex < this._scopeRawOut.length) {
			return this._scopeRawOut[channelIndex];
		}
		return 0;
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
	wasmModule.nes_apu_SetMask(apuPtr, 3);
	wasmModule.nes_dmc_SetMask(dmcPtr, 4);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 0, 128, 128);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 0, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 2, 128, 128);
	const engine = new NesApuEngine(wasmModule, apuPtr, dmcPtr);
	engine.reset();
	return { engine, apuPtr, dmcPtr };
}
