import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import NesApuEngine, { createNesApuEngine } from '../../public/nes/nes-apu-engine.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';
import {
	NES_APU_STATUS_PULSE,
	NES_APU_STATUS_TRIANGLE_NOISE
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

		const linearWrites = wasmModule.dmcWrites.filter((write) => write.addr === 0x4008 && write.val === 64);
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
		expect(periodLowWrites.at(-1)?.val).toBe(428 & 0xff);
		expect(lengthWrites.at(-1)?.val).toBe((0xf << 3) | ((428 >> 8) & 7));
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
});
