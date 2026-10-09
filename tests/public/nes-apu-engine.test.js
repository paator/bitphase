import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import NesApuEngine, { createNesApuEngine } from '../../public/nes/nes-apu-engine.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import {
	NES_APU_STATUS_PULSE,
	NES_APU_STATUS_TRIANGLE_NOISE,
	NES_NTSC_CPU_FREQUENCY,
	NES_RENDER_CLOCK_DIVIDER
} from '../../public/nes/nes-constants.js';

async function loadWasm() {
	const wasmPath = path.join(process.cwd(), 'public/nes/nes_apu.wasm');
	const wasmBuffer = readFileSync(wasmPath);
	const result = await WebAssembly.instantiate(wasmBuffer, {
		env: { emscripten_notify_memory_growth: () => {} }
	});
	return result.instance.exports;
}

function renderSquarePeak(engine, sampleRate = 44100) {
	let peak = 0;
	for (let i = 0; i < 400; i++) {
		const { left } = engine.process(sampleRate);
		peak = Math.max(peak, Math.abs(left));
	}
	return peak;
}

function goertzelPower(samples, frequency, sampleRate) {
	const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
	let s1 = 0;
	let s2 = 0;
	for (let i = 0; i < samples.length; i++) {
		const s0 = samples[i] + coeff * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function renderChannelPeak(engine, channelIndex, sampleRate = 44100) {
	let peak = 0;
	for (let i = 0; i < 400; i++) {
		engine.process(sampleRate);
		peak = Math.max(peak, Math.abs(engine.getChannelRawOut(channelIndex)));
	}
	return peak;
}

function createMockWasmModule() {
	const apuWrites = [];
	const dmcWrites = [];
	const dmcMasks = [];
	const memory = new ArrayBuffer(64);
	return {
		apuWrites,
		dmcWrites,
		dmcMasks,
		malloc: () => 0,
		free: () => {},
		nes_apu_Init: () => {},
		nes_dmc_Init: () => {},
		nes_apu_Reset: () => {},
		nes_dmc_Reset: () => {},
		nes_dmc_SetAPU: () => {},
		nes_dmc_SetPal: () => {},
		nes_apu_Write: (_ptr, addr, val) => {
			apuWrites.push({ addr, val });
		},
		nes_dmc_Write: (_ptr, addr, val) => {
			dmcWrites.push({ addr, val });
		},
		nes_apu_SetMask: () => {},
		nes_dmc_SetMask: (_ptr, mask) => {
			dmcMasks.push(mask);
		},
		nes_apu_SetStereoMix: () => {},
		nes_dmc_SetStereoMix: () => {},
		nes_dmc_TickFrameSequence: () => {},
		nes_apu_Tick: () => {},
		nes_dmc_Tick: () => {},
		nes_apu_Render: () => {},
		nes_dmc_Render: () => {},
		memory: { buffer: memory }
	};
}

function createTestEngine(wasmModule) {
	const engine = new NesApuEngine(wasmModule, 0, 0);
	engine.reset();
	return engine;
}

describe('NesApuEngine', () => {
	it('stays silent when no channels are active', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		engine.applyRegisterState(registerState);

		expect(renderChannelPeak(engine, 0)).toBe(0);
		expect(renderChannelPeak(engine, 1)).toBe(0);
		expect(renderChannelPeak(engine, 3)).toBe(0);
	});

	it('is quiet after reset because the triangle DAC is parked at 0', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		let peak = 0;
		for (let i = 0; i < 200; i++) {
			const { left } = engine.process(44100);
			peak = Math.max(peak, Math.abs(left));
		}
		expect(engine.getChannelRawOut(2)).toBe(0);
		expect(peak).toBeLessThan(0.001);
	});

	it('keeps high pulse harmonics from folding into the audible band', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();
		const sampleRate = 44100;
		const period = 16;
		const fundamental = NES_NTSC_CPU_FREQUENCY / (16 * period);
		const alias = sampleRate - fundamental * 5;

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = period;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;
		engine.applyRegisterState(registerState);

		const samples = [];
		let stemPeak = 0;
		for (let i = 0; i < 8192; i++) {
			samples.push(engine.process(sampleRate).left);
			stemPeak = Math.max(stemPeak, Math.abs(engine.getExportChannelSamples()[0]));
		}
		const steady = samples.slice(1024);
		const fundamentalPower = goertzelPower(steady, fundamental, sampleRate);
		const aliasPower = goertzelPower(steady, alias, sampleRate);

		expect(fundamentalPower).toBeGreaterThan(1);
		expect(aliasPower / fundamentalPower).toBeLessThan(0.002);
		expect(stemPeak).toBeGreaterThan(0.01);
	});

	it('plays square waves after channel enable and register writes', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;

		engine.applyRegisterState(registerState);

		expect(renderSquarePeak(engine)).toBeGreaterThan(0.01);
	});

	it('keeps the last written APU registers for the debug view', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;

		engine.applyRegisterState(registerState);

		const registers = engine.getApuRegisters();
		expect(registers).toHaveLength(0x18);
		expect(registers[0]).toBe(0xbf);
		expect(registers[1]).toBe(0x08);
		expect(registers[2]).toBe(0xab);
		expect(registers[0x15]).toBe(NES_APU_STATUS_PULSE | NES_APU_STATUS_TRIANGLE_NOISE);
	});

	it('writes sweep disable for pulse channels by default', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;

		engine.applyRegisterState(registerState);

		expect(engine.lastState.channels[0].sweepReg).toBe(0x08);
	});

	it('keeps a DPCM delta change and a stopped sample from clicking', async () => {
		const wasmModule = await loadWasm();
		const { engine, dmcPtr } = createNesApuEngine(wasmModule);
		for (let i = 0; i < 20; i++) engine.process(44100);
		const before = engine._readMixOut(4);

		wasmModule.nes_dmc_Write(dmcPtr, 0x4011, 80);
		engine.process(44100);

		expect(engine.getChannelRawOut(4)).toBe(80);
		const slicesPerSample = NES_NTSC_CPU_FREQUENCY / NES_RENDER_CLOCK_DIVIDER / 44100;
		expect(Math.abs(engine._readMixOut(4) - before)).toBeLessThan(slicesPerSample + 2);

		engine.applyRegisterState(new NesChipRegisterState());
		engine.process(44100);
		expect(engine.getChannelRawOut(4)).toBe(80);
	});

	it('writes enabled hardware sweep register for pulse channels', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].sweepReg = 0x84;
		registerState.channels[0].retrigger = true;

		engine.applyRegisterState(registerState);

		expect(engine.lastState.channels[0].sweepReg).toBe(0x84);
	});

	it('keeps the swept period when the tracker period changes', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();
		const channel = registerState.channels[0];

		channel.enabled = true;
		channel.period = 240;
		channel.volume = 10;
		channel.duty = 2;
		channel.sweepReg = 0x92;
		channel.retrigger = true;
		engine.applyRegisterState(registerState);

		wasmModule.apuWrites.length = 0;
		channel.period = 320;
		channel.retrigger = false;
		engine.applyRegisterState(registerState);

		const periodWrites = wasmModule.apuWrites.filter(
			(write) => write.addr === 0x4002 || write.addr === 0x4003
		);
		expect(periodWrites).toEqual([]);

		channel.sweepReg = 0x08;
		engine.applyRegisterState(registerState);
		expect(wasmModule.apuWrites.some((write) => write.addr === 0x4002)).toBe(true);
	});

	it('rewrites triangle linear counter register on retrigger when linear value is unchanged', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[2].enabled = true;
		registerState.channels[2].period = 428;
		registerState.channels[2].linearReg = 64;
		registerState.channels[2].retrigger = true;
		engine.applyRegisterState(registerState);

		registerState.channels[2].retrigger = false;
		engine.applyRegisterState(registerState);

		registerState.channels[2].retrigger = true;
		engine.applyRegisterState(registerState);

		const linearWrites = wasmModule.dmcWrites.filter(
			(write) => write.addr === 0x4008 && write.val === 64
		);
		expect(linearWrites.length).toBeGreaterThanOrEqual(2);
	});

	it('triggers pulse channel when re-enabled without an explicit retrigger flag', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = false;
		engine.applyRegisterState(registerState);

		registerState.channels[0].enabled = false;
		registerState.channels[0].volume = 0;
		engine.applyRegisterState(registerState);

		registerState.channels[0].enabled = true;
		registerState.channels[0].volume = 15;
		registerState.channels[0].retrigger = false;
		engine.applyRegisterState(registerState);

		expect(renderSquarePeak(engine)).toBeGreaterThan(0.01);
	});

	it('keeps $4015 internal channels enabled when pulse, triangle, and noise go silent', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;
		registerState.channels[2].enabled = true;
		registerState.channels[2].period = 428;
		registerState.channels[2].linearReg = 64;
		registerState.channels[2].retrigger = true;
		registerState.channels[3].enabled = true;
		registerState.channels[3].volume = 12;
		registerState.channels[3].noisePeriod = 5;
		registerState.channels[3].retrigger = true;
		engine.applyRegisterState(registerState);

		registerState.channels[0].enabled = false;
		registerState.channels[0].volume = 0;
		registerState.channels[2].enabled = false;
		registerState.channels[3].enabled = false;
		engine.applyRegisterState(registerState);

		const apu4015Writes = wasmModule.apuWrites.filter((write) => write.addr === 0x4015);
		const dmc4015Writes = wasmModule.dmcWrites.filter((write) => write.addr === 0x4015);
		expect(apu4015Writes.length).toBeGreaterThan(0);
		expect(dmc4015Writes.length).toBeGreaterThan(0);
		expect(apu4015Writes.every((write) => write.val === NES_APU_STATUS_PULSE)).toBe(true);
		expect(dmc4015Writes.every((write) => write.val === NES_APU_STATUS_TRIANGLE_NOISE)).toBe(
			true
		);
	});

	it('reloads triangle linear counter to 0 when silencing without disabling $4015', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[2].enabled = true;
		registerState.channels[2].period = 428;
		registerState.channels[2].linearReg = 64;
		registerState.channels[2].retrigger = true;
		engine.applyRegisterState(registerState);

		registerState.channels[2].enabled = false;
		engine.applyRegisterState(registerState);

		const linearWrites = wasmModule.dmcWrites.filter((write) => write.addr === 0x4008);
		const periodLowWrites = wasmModule.dmcWrites.filter((write) => write.addr === 0x400a);
		const lengthWrites = wasmModule.dmcWrites.filter((write) => write.addr === 0x400b);
		expect(linearWrites.at(-1)?.val).toBe(0);
		expect(periodLowWrites.at(-1)?.val).toBe(427 & 0xff);
		expect(lengthWrites.at(-1)?.val).toBe((0xf << 3) | ((427 >> 8) & 7));
		expect(wasmModule.dmcMasks.at(-1) & 1).toBe(0);
	});

	it('silences a playing pulse by writing volume 0', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;
		engine.applyRegisterState(registerState);
		expect(renderSquarePeak(engine)).toBeGreaterThan(0.01);

		registerState.channels[0].enabled = false;
		registerState.channels[0].volume = 0;
		engine.applyRegisterState(registerState);

		expect(renderChannelPeak(engine, 0)).toBe(0);
	});

	it('exports each hardware channel from the mixer output', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;
		engine.applyRegisterState(registerState);

		let pulsePeak = 0;
		const otherPeaks = [0, 0, 0, 0];
		for (let i = 0; i < 800; i++) {
			engine.process(44100);
			const samples = engine.getExportChannelSamples();
			pulsePeak = Math.max(pulsePeak, Math.abs(samples[0]));
			for (let ch = 1; ch < 5; ch++) {
				otherPeaks[ch - 1] = Math.max(otherPeaks[ch - 1], Math.abs(samples[ch]));
			}
		}

		expect(pulsePeak).toBeGreaterThan(0.05);
		for (const peak of otherPeaks) {
			expect(peak).toBeLessThan(pulsePeak * 0.05);
		}
	});

	it('rewrites the pulse length register when the same E5 index is reloaded', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();
		const pulse = registerState.channels[0];
		pulse.enabled = true;
		pulse.period = 428;
		pulse.volume = 15;
		pulse.duty = 2;
		pulse.volumeReg = (2 << 6) | 6;
		pulse.lengthNibble = 1;
		pulse.retrigger = true;
		engine.applyRegisterState(registerState);

		wasmModule.apuWrites.length = 0;
		pulse.retrigger = false;
		pulse.lengthReload = true;
		engine.applyRegisterState(registerState);

		expect(wasmModule.apuWrites.filter((write) => write.addr === 0x4003)).toEqual([
			{ addr: 0x4003, val: (1 << 3) | ((427 >> 8) & 7) }
		]);
		expect(pulse.lengthReload).toBe(false);

		wasmModule.apuWrites.length = 0;
		engine.applyRegisterState(registerState);
		expect(wasmModule.apuWrites.filter((write) => write.addr === 0x4003)).toEqual([]);
	});

	it('writes $4011 for a delta counter without restarting DPCM', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		wasmModule.dmcWrites.length = 0;
		const registerState = new NesChipRegisterState();
		registerState.channels[4].enabled = false;
		registerState.channels[4].dpcmDelta = 0x40;
		registerState.channels[4].dpcmDeltaWrite = true;

		engine.applyRegisterState(registerState);

		expect(wasmModule.dmcWrites.filter((write) => write.addr === 0x4011)).toEqual([
			{ addr: 0x4011, val: 0x40 }
		]);
		expect(registerState.channels[4].dpcmDeltaWrite).toBe(false);

		wasmModule.dmcWrites.length = 0;
		engine.applyRegisterState(registerState);
		expect(wasmModule.dmcWrites.filter((write) => write.addr === 0x4011)).toEqual([]);
	});

	it('writes $4011 once when a sample retrigger carries the delta counter', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		wasmModule.dmcWrites.length = 0;
		const registerState = new NesChipRegisterState();
		const channel = registerState.channels[4];
		channel.enabled = true;
		channel.retrigger = true;
		channel.dpcmDelta = 0x22;
		channel.dpcmDeltaWrite = true;
		channel.dpcmBytes = [0xaa];
		channel.dpcmPitch = 15;

		engine.applyRegisterState(registerState);

		expect(wasmModule.dmcWrites.filter((write) => write.addr === 0x4011)).toEqual([
			{ addr: 0x4011, val: 0x22 }
		]);
	});

	it('rewrites $4010 when the DPCM rate changes without retriggering', () => {
		const wasmModule = createMockWasmModule();
		const engine = createTestEngine(wasmModule);
		const registerState = new NesChipRegisterState();
		const channel = registerState.channels[4];
		channel.enabled = true;
		channel.dpcmPitch = 15;
		channel.dpcmLoop = true;
		channel.dpcmBytes = [0xaa];
		engine.applyRegisterState(registerState);

		wasmModule.dmcWrites.length = 0;
		channel.retrigger = false;
		channel.dpcmPitch = 0x0a;
		channel.dpcmPitchWrite = true;
		engine.applyRegisterState(registerState);

		expect(wasmModule.dmcWrites.filter((write) => write.addr === 0x4010)).toEqual([
			{ addr: 0x4010, val: 0x4a }
		]);
		expect(wasmModule.dmcWrites.some((write) => write.addr === 0x4015)).toBe(false);
		expect(channel.dpcmPitchWrite).toBe(false);
	});
});
