import {
	SAA_CHANNEL_COUNT,
	SAA_ENABLE_OUTPUT,
	SAA_OUTPUT_GAIN,
	SAA_SCOPE_SCALE,
	SAA_REG_ENABLE,
	SAA_REG_ENVELOPE_0,
	SAA_REG_ENVELOPE_1,
	SAA_REG_NOISE_CLOCK,
	SAA_REG_NOISE_MIXER,
	SAA_REG_TONE_MIXER
} from './saa-constants.js';
import { saaNoiseClockByte } from './saa-levels.js';

function bindExport(wasmModule, name) {
	const fn = wasmModule[name] ?? wasmModule[`_${name}`];
	if (typeof fn !== 'function') {
		throw new Error(`SAA wasm is missing ${name}`);
	}
	return fn;
}

class SaaSoundEngine {
	constructor(wasmModule, chipPtr) {
		this.wasmModule = wasmModule;
		this.chipPtr = chipPtr;
		this.writeAddressData = bindExport(wasmModule, 'SAASNDWriteAddressData');
		this.generateManySeparate = bindExport(wasmModule, 'SAASNDGenerateManySeparate');
		this.clearChip = bindExport(wasmModule, 'SAASNDClear');
		this.setClock = bindExport(wasmModule, 'SAASNDSetClockRate');
		this.setRate = bindExport(wasmModule, 'SAASNDSetSampleRate');
		this.malloc = bindExport(wasmModule, 'malloc');
		this.channelPtrs = [];
		for (let channel = 0; channel < SAA_CHANNEL_COUNT; channel++) {
			const ptr = this.malloc(4);
			if (!ptr) throw new Error('SAA wasm did not allocate a channel buffer');
			this.channelPtrs.push(ptr);
		}
		this.pointerTable = this.malloc(SAA_CHANNEL_COUNT * 4);
		if (!this.pointerTable) throw new Error('SAA wasm did not allocate the channel pointer table');
		const pointers = new DataView(wasmModule.memory.buffer, this.pointerTable, SAA_CHANNEL_COUNT * 4);
		for (let channel = 0; channel < SAA_CHANNEL_COUNT; channel++) {
			pointers.setUint32(channel * 4, this.channelPtrs[channel], true);
		}
		this.channelSamples = new Float32Array(SAA_CHANNEL_COUNT);
		this.shadow = new Int16Array(32);
		this.shadow.fill(-1);
		this.clockRate = 0;
		this.sampleRate = 0;
		this.fixedEnvelopePhase0 = 0;
		this.fixedEnvelopePhase1 = 0;
		this.envelopeExternal0 = false;
		this.envelopeExternal1 = false;
		const writeAddress = wasmModule.SAASNDWriteAddress ?? wasmModule._SAASNDWriteAddress;
		this.writeAddress = typeof writeAddress === 'function' ? writeAddress : null;
	}

	setClockRate(clockRate) {
		if (clockRate > 0) {
			this.clockRate = clockRate;
			this.setClock(this.chipPtr, clockRate >>> 0);
		}
	}

	setSampleRate(sampleRate) {
		if (sampleRate > 0) {
			this.sampleRate = sampleRate;
			this.setRate(this.chipPtr, sampleRate >>> 0);
		}
	}

	write(register, value) {
		const reg = register & 31;
		const byte = value & 255;
		if (this.shadow[reg] === byte) return;
		this.shadow[reg] = byte;
		this.writeAddressData(this.chipPtr, reg, byte);
	}

	forceWrite(register, value) {
		const reg = register & 31;
		const byte = value & 255;
		this.shadow[reg] = byte;
		this.writeAddressData(this.chipPtr, reg, byte);
	}

	writeEnvelope(register, byte, retrigger) {
		if (retrigger && byte & 0x80) {
			this.forceWrite(register, byte & 0x7f);
			this.forceWrite(register, byte);
			return;
		}
		this.write(register, byte);
	}

	reset() {
		this.clearChip(this.chipPtr);
		this.shadow.fill(-1);
		this.write(SAA_REG_NOISE_MIXER, 0);
		this.write(SAA_REG_NOISE_CLOCK, 0);
		this.write(SAA_REG_ENVELOPE_0, 0);
		this.write(SAA_REG_ENVELOPE_1, 0);
		this.write(SAA_REG_TONE_MIXER, 0);
		for (let channel = 0; channel < SAA_CHANNEL_COUNT; channel++) {
			this.write(channel, 0);
		}
		this.write(SAA_REG_ENABLE, SAA_ENABLE_OUTPUT);
		this.envelopeExternal0 = false;
		this.envelopeExternal1 = false;
		this.fixedEnvelopePhase0 = 0;
		this.fixedEnvelopePhase1 = 0;
	}

	apply(registerState) {
		const octaves = [0, 0, 0, 0, 0, 0];
		let toneMask = 0;
		let noiseMask = 0;
		const count = Math.min(SAA_CHANNEL_COUNT, registerState.channelCount);
		for (let channel = 0; channel < count; channel++) {
			const source = registerState.channels[channel];
			const left = source ? source.left & 15 : 0;
			const right = source ? source.right & 15 : 0;
			this.write(channel, (right << 4) | left);
			this.write(8 + channel, source?.freq ?? 0);
			octaves[channel] = (source?.octave ?? 0) & 7;
			if (source?.tone) toneMask |= 1 << channel;
			if (source?.noise) noiseMask |= 1 << channel;
		}
		this.write(16, octaves[0] | (octaves[1] << 4));
		this.write(17, octaves[2] | (octaves[3] << 4));
		this.write(18, octaves[4] | (octaves[5] << 4));
		this.write(SAA_REG_TONE_MIXER, toneMask);
		this.write(SAA_REG_NOISE_MIXER, noiseMask);
		this.write(
			SAA_REG_NOISE_CLOCK,
			saaNoiseClockByte(registerState.noise0 ?? 0, registerState.noise1 ?? 0)
		);
		const envelope0 = registerState.envelope0 ?? 0;
		const envelope1 = registerState.envelope1 ?? 0;
		this.envelopeExternal0 = (envelope0 & 0x20) !== 0;
		this.envelopeExternal1 = (envelope1 & 0x20) !== 0;
		this.writeEnvelope(SAA_REG_ENVELOPE_0, envelope0, registerState.envelopeRetrigger0);
		this.writeEnvelope(SAA_REG_ENVELOPE_1, envelope1, registerState.envelopeRetrigger1);
		registerState.envelopeRetrigger0 = false;
		registerState.envelopeRetrigger1 = false;
		this.write(SAA_REG_ENABLE, SAA_ENABLE_OUTPUT);
	}

	advanceFixedEnvelope(phaseKey, register) {
		if (!this.writeAddress || !(this.clockRate > 0) || !(this.sampleRate > 0)) return;
		this[phaseKey] += this.clockRate / 512 / this.sampleRate;
		let pulses = 0;
		while (this[phaseKey] >= 1 && pulses < 8) {
			this[phaseKey] -= 1;
			pulses++;
		}
		for (let pulse = 0; pulse < pulses; pulse++) {
			this.writeAddress(this.chipPtr, register);
		}
	}

	generate() {
		if (this.envelopeExternal0) this.advanceFixedEnvelope('fixedEnvelopePhase0', SAA_REG_ENVELOPE_0);
		if (this.envelopeExternal1) this.advanceFixedEnvelope('fixedEnvelopePhase1', SAA_REG_ENVELOPE_1);
		this.generateManySeparate(this.chipPtr, this.pointerTable, 1);
		const memory = this.wasmModule.memory.buffer;
		let left = 0;
		let right = 0;
		for (let channel = 0; channel < SAA_CHANNEL_COUNT; channel++) {
			const view = new DataView(memory, this.channelPtrs[channel], 4);
			const channelLeft = view.getInt16(0, true) / 32768;
			const channelRight = view.getInt16(2, true) / 32768;
			left += channelLeft * SAA_OUTPUT_GAIN;
			right += channelRight * SAA_OUTPUT_GAIN;
			this.channelSamples[channel] = (channelLeft + channelRight) * SAA_SCOPE_SCALE;
		}
		return {
			left,
			right,
			channels: this.channelSamples
		};
	}
}

export function createSaaSoundEngine(wasmModule, clockRate, sampleRate) {
	const create = bindExport(wasmModule, 'newSAASND');
	const chipPtr = create();
	if (!chipPtr) throw new Error('SAA wasm did not create a chip');
	const engine = new SaaSoundEngine(wasmModule, chipPtr);
	engine.setClockRate(clockRate);
	engine.setSampleRate(sampleRate);
	engine.reset();
	return engine;
}

export default SaaSoundEngine;
