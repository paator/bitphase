import { channelKeyOn } from './nes-channel-trigger.js';
import NesChipRegisterState from './nes-chip-register-state.js';
import {
	NES_APU_STRUCT_SIZE,
	NES_DMC_STRUCT_SIZE,
	NES_NTSC_CPU_FREQUENCY,
	NES_SQUARE_LENGTH_NIBBLE,
	NES_TRIANGLE_LINEAR_RELOAD,
	NES_APU_OUTPUT_SCALE,
	NES_APU_STATUS_DPCM,
	NES_APU_STATUS_PULSE,
	NES_APU_STATUS_TRIANGLE_NOISE
} from './nes-constants.js';
import { NES_DPCM_WINDOW_SIZE, dpcmLengthRegister } from './nes-dpcm.js';
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
const APU_REGISTER_BASE = 0x4000;
const APU_REGISTER_COUNT = 0x18;
const APU_STATUS = 0x4015;
const APU_STATUS_PULSE_MASK = 0x03;
const APU_STATUS_DMC_MASK = 0x1c;
const NES_EXPORT_CHANNEL_COUNT = 5;
const NES_OUTPUT_DC_POLE = 0.995;
const NES_DMC_OPT_DPCM_ANTI_CLICK = 3;

function emptyExportChannels() {
	return [0, 0, 0, 0, 0];
}

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
		this._dcPrevIn = [0, 0];
		this._dcPrevOut = [0, 0];
		this._scopeRawOut = [0, 0, 0, 0, 0];
		this._exportDcIn = emptyExportChannels();
		this._exportDcOut = emptyExportChannels();
		this._exportChannelSamples = emptyExportChannels();
		this.sampleMemPtr = 0;
		this.apuRegisters = new Array(APU_REGISTER_COUNT).fill(0);
	}

	getApuRegisters() {
		return this.apuRegisters.slice();
	}

	_rememberApuWrite(address, value) {
		const index = address - APU_REGISTER_BASE;
		if (index < 0 || index >= APU_REGISTER_COUNT) return;
		const byte = value & 0xff;
		if (address === APU_STATUS) {
			this.apuRegisters[index] =
				(this.apuRegisters[index] & ~APU_STATUS_PULSE_MASK) | (byte & APU_STATUS_PULSE_MASK);
			return;
		}
		this.apuRegisters[index] = byte;
	}

	_rememberDmcWrite(address, value) {
		const index = address - APU_REGISTER_BASE;
		if (index < 0 || index >= APU_REGISTER_COUNT) return;
		const byte = value & 0xff;
		if (address === APU_STATUS) {
			this.apuRegisters[index] =
				(this.apuRegisters[index] & ~APU_STATUS_DMC_MASK) | (byte & APU_STATUS_DMC_MASK);
			return;
		}
		this.apuRegisters[index] = byte;
	}

	_writeApu(address, value) {
		this._rememberApuWrite(address, value);
		this.wasmModule.nes_apu_Write(this.apuPtr, address, value);
	}

	_writeDmc(address, value) {
		this._rememberDmcWrite(address, value);
		this.wasmModule.nes_dmc_Write(this.dmcPtr, address, value);
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
		this._dcPrevIn = [0, 0];
		this._dcPrevOut = [0, 0];
		this._scopeRawOut = [0, 0, 0, 0, 0];
		this._exportDcIn = emptyExportChannels();
		this._exportDcOut = emptyExportChannels();
		this._exportChannelSamples = emptyExportChannels();
		this.apuRegisters.fill(0);
		this._parkTriangleDacAtZero();
	}

	_parkTriangleDacAtZero() {
		this._writeDmc( 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
		this._writeDmc( TRIANGLE_BASE, 0x81);
		this._writeDmc( TRIANGLE_BASE + 2, 1);
		this._writeDmc( TRIANGLE_BASE + 3, 0x08);
		this._writeDmc( 0x4017, 0x80);
		this.wasmModule.nes_dmc_Tick(this.dmcPtr, 32);
		this._writeDmc( TRIANGLE_BASE, 0);
		this._writeDmc( TRIANGLE_BASE + 2, 0);
		this._writeDmc( 0x4017, 0x40);
	}

	_applyOutputMasks(registerState, forceApply) {
		const apuOutputMask = buildApuOutputMask(registerState);
		const dmcOutputMask = 0;
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
		this._writeApu( base, volumeReg);
		this._writeApu( base + 1, NES_SQUARE_SWEEP_DISABLED);
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
		this._writeDmc( TRIANGLE_BASE, linearReg);
		last.linearReg = linearReg;
		last.retrigger = false;
	}

	_writeNoiseSilent() {
		const last = this.lastState.channels[3];
		const volumeReg = buildNoiseSilentVolumeReg();
		this._writeDmc( NOISE_BASE, volumeReg);
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
			this._writeApu( base, volumeReg);
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
		const sweepHoldsPeriod = sweepActive && !forceApply;
		if (forceApply || sweepChanged || sweepRetrigger) {
			this._writeApu( base + 1, sweepReg);
			last.sweepReg = sweepReg;
		}

		let wrotePeriod = false;
		if (
			forceApply ||
			triggerChannel ||
			(!sweepHoldsPeriod && periodLow !== (last.period & 0xff)) ||
			sweepChannelRetrigger ||
			(channel.retrigger && sweepActive && !sweepUpdateOnly)
		) {
			this._writeApu( base + 2, periodLow);
			wrotePeriod = true;
		}

		if (
			forceApply ||
			triggerChannel ||
			channel.retrigger ||
			(!sweepHoldsPeriod && periodHigh !== lastPeriodHigh) ||
			sweepChannelRetrigger ||
			(!sweepHoldsPeriod &&
				channel.lengthNibble !== NES_REGISTER_UNCHANGED &&
				lengthNibble !== lastLengthNibble)
		) {
			this._writeApu( base + 3, periodHigh);
			wrotePeriod = true;
		}

		if (wrotePeriod || !sweepHoldsPeriod) {
			last.period = period;
			last.lengthNibble = channel.lengthNibble;
		}
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
		const period = channel.period > 0 ? channel.period - 1 : 0;
		const periodLow = period & 0xff;
		const periodHigh = (lengthNibble << 3) | ((period >> 8) & 7);
		const lastLengthNibble =
			last.lengthNibble !== NES_REGISTER_UNCHANGED
				? last.lengthNibble
				: NES_SQUARE_LENGTH_NIBBLE;
		const lastPeriodHigh = (lastLengthNibble << 3) | ((last.period >> 8) & 7);

		const linearRegChanged =
			channel.linearReg !== NES_REGISTER_UNCHANGED && linearReg !== last.linearReg;
		if (forceApply || triggerChannel || channel.retrigger || linearRegChanged) {
			this._writeDmc( TRIANGLE_BASE, linearReg);
			last.linearReg = linearReg;
		}
		if (forceApply || periodLow !== (last.period & 0xff)) {
			this._writeDmc( TRIANGLE_BASE + 2, periodLow);
		}
		if (
			forceApply ||
			triggerChannel ||
			channel.retrigger ||
			periodHigh !== lastPeriodHigh ||
			(channel.lengthNibble !== NES_REGISTER_UNCHANGED &&
				lengthNibble !== lastLengthNibble)
		) {
			this._writeDmc( TRIANGLE_BASE + 3, periodHigh);
		}
		last.period = period;
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
			this._writeDmc( NOISE_BASE, volumeReg);
			last.volumeReg = volumeReg;
			last.volume = channel.volume;
		}
		if (forceApply || periodReg !== ((last.noiseMode ? 0x80 : 0) | (last.noisePeriod & 15))) {
			this._writeDmc( NOISE_BASE + 2, periodReg);
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
			this._writeDmc( NOISE_BASE + 3, lengthNibble << 3);
			last.lengthNibble = channel.lengthNibble;
			last.retrigger = channel.retrigger;
		}
	}

	applyRegisterState(registerState) {
		const forceApply = this.forceFullApply;
		this.forceFullApply = false;

		if (forceApply || this._lastApu4015 !== NES_APU_STATUS_PULSE) {
			this._writeApu( 0x4015, NES_APU_STATUS_PULSE);
			this._lastApu4015 = NES_APU_STATUS_PULSE;
		}
		const dpcmChannel = registerState.channels[4];
		const dpcmRetrigger = Boolean(
			dpcmChannel?.enabled && (dpcmChannel.retrigger || forceApply)
		);
		if (
			!dpcmChannel?.enabled &&
			(forceApply || this._lastDmc4015 !== NES_APU_STATUS_TRIANGLE_NOISE)
		) {
			this._writeDmc( 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
			this._lastDmc4015 = NES_APU_STATUS_TRIANGLE_NOISE;
		} else if (
			dpcmRetrigger &&
			this._lastDmc4015 !== NES_APU_STATUS_TRIANGLE_NOISE
		) {
			this._writeDmc( 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
			this._lastDmc4015 = NES_APU_STATUS_TRIANGLE_NOISE;
		}

		for (let i = 0; i < 2; i++) {
			const channel = registerState.channels[i];
			const last = this.lastState.channels[i];
			const isActive = isSquareChannelActive(channel);
			const triggerChannel = channelKeyOn(isActive, channel.retrigger, last.enabled);
			this._writeSquare(i, channel, forceApply, triggerChannel);
			last.enabled = isActive;
		}

		const triangleChannel = registerState.channels[2];
		const triangleLast = this.lastState.channels[2];
		const triangleActive = isTriangleChannelActive(triangleChannel);
		const triangleTrigger = channelKeyOn(
			triangleActive,
			triangleChannel.retrigger,
			triangleLast.enabled
		);
		this._writeTriangle(triangleChannel, forceApply, triangleTrigger);
		triangleLast.enabled = triangleActive;

		const noiseChannel = registerState.channels[3];
		const noiseLast = this.lastState.channels[3];
		const noiseActive = isNoiseChannelActive(noiseChannel);
		const noiseTrigger = channelKeyOn(noiseActive, noiseChannel.retrigger, noiseLast.enabled);
		this._writeNoise(noiseChannel, forceApply, noiseTrigger);
		noiseLast.enabled = noiseActive;

		this._writeDpcm(dpcmChannel, dpcmRetrigger);
		if (dpcmChannel) {
			this.lastState.channels[4].enabled = Boolean(dpcmChannel.enabled);
			this.lastState.channels[4].retrigger = false;
		}

		this._applyOutputMasks(registerState, forceApply);
	}

	_loadDpcmSample(bytes) {
		if (!this.sampleMemPtr || !bytes?.length) return 0;
		const memory = this.wasmModule.memory?.buffer;
		if (!memory) return dpcmLengthRegister(bytes.length);
		const heap = new Uint8Array(memory, this.sampleMemPtr, NES_DPCM_WINDOW_SIZE);
		heap.fill(0);
		const count = Math.min(bytes.length, NES_DPCM_WINDOW_SIZE);
		for (let i = 0; i < count; i++) {
			heap[i] = bytes[i] & 0xff;
		}
		return dpcmLengthRegister(bytes.length);
	}

	_writeDpcm(channel, retrigger) {
		if (!channel?.enabled) return;
		if (!retrigger) return;
		const lengthReg = this._loadDpcmSample(channel.dpcmBytes) || (channel.dpcmLengthReg & 0xff);
		const pitch = channel.dpcmPitch & 15;
		const loopBit = channel.dpcmLoop ? 0x40 : 0;
		if (channel.dpcmDelta != null && channel.dpcmDelta >= 0) {
			this._writeDmc( 0x4011, channel.dpcmDelta & 127);
		}
		this._writeDmc( 0x4010, loopBit | pitch);
		this._writeDmc( 0x4012, 0);
		this._writeDmc( 0x4013, lengthReg);
		this._writeDmc( 0x4015, NES_APU_STATUS_TRIANGLE_NOISE);
		this._writeDmc(0x4015, NES_APU_STATUS_TRIANGLE_NOISE | NES_APU_STATUS_DPCM);
		this._lastDmc4015 = NES_APU_STATUS_TRIANGLE_NOISE | NES_APU_STATUS_DPCM;
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
		const rawLeft = (samples[0] + samples[2]) * NES_APU_OUTPUT_SCALE;
		const rawRight = (samples[1] + samples[3]) * NES_APU_OUTPUT_SCALE;
		const left = rawLeft - this._dcPrevIn[0] + NES_OUTPUT_DC_POLE * this._dcPrevOut[0];
		const right = rawRight - this._dcPrevIn[1] + NES_OUTPUT_DC_POLE * this._dcPrevOut[1];
		this._dcPrevIn[0] = rawLeft;
		this._dcPrevIn[1] = rawRight;
		this._dcPrevOut[0] = left;
		this._dcPrevOut[1] = right;
		this._lastOutput = { left, right };
		this._updateExportChannelSamples();
		return this._lastOutput;
	}

	_readMixOut(channelIndex) {
		if (channelIndex <= 1) {
			if (typeof this.wasmModule.nes_apu_GetMixOut !== 'function') return 0;
			return this.wasmModule.nes_apu_GetMixOut(this.apuPtr, channelIndex);
		}
		if (typeof this.wasmModule.nes_dmc_GetMixOut !== 'function') return 0;
		return this.wasmModule.nes_dmc_GetMixOut(this.dmcPtr, channelIndex - 2);
	}

	_updateExportChannelSamples() {
		for (let i = 0; i < NES_EXPORT_CHANNEL_COUNT; i++) {
			const raw = this._readMixOut(i) * NES_APU_OUTPUT_SCALE;
			const filtered = raw - this._exportDcIn[i] + NES_OUTPUT_DC_POLE * this._exportDcOut[i];
			this._exportDcIn[i] = raw;
			this._exportDcOut[i] = filtered;
			this._exportChannelSamples[i] = filtered;
		}
	}

	getExportChannelSamples() {
		return this._exportChannelSamples.slice();
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
		if (this.sampleMemPtr) {
			this.wasmModule.free(this.sampleMemPtr);
			this.sampleMemPtr = 0;
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
	wasmModule.nes_dmc_SetOption(dmcPtr, NES_DMC_OPT_DPCM_ANTI_CLICK, 1);
	wasmModule.nes_apu_SetMask(apuPtr, 3);
	wasmModule.nes_dmc_SetMask(dmcPtr, 0);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 0, 128, 128);
	wasmModule.nes_apu_SetStereoMix(apuPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 0, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 1, 128, 128);
	wasmModule.nes_dmc_SetStereoMix(dmcPtr, 2, 128, 128);
	const engine = new NesApuEngine(wasmModule, apuPtr, dmcPtr);
	const sampleMemPtr = wasmModule.malloc(NES_DPCM_WINDOW_SIZE);
	wasmModule.nes_dmc_SetSampleMemory(dmcPtr, sampleMemPtr, NES_DPCM_WINDOW_SIZE);
	engine.sampleMemPtr = sampleMemPtr;
	engine.reset();
	return { engine, apuPtr, dmcPtr };
}
