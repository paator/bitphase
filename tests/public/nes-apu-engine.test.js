import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import NesApuEngine, { createNesApuEngine } from '../../public/nes/nes-apu-engine.js';
import NesChipRegisterState from '../../public/nes/nes-chip-register-state.js';

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

function createMockWasmModule() {
	const dmcWrites = [];
	const memory = new ArrayBuffer(64);
	return {
		dmcWrites,
		malloc: () => 0,
		free: () => {},
		nes_apu_Init: () => {},
		nes_dmc_Init: () => {},
		nes_apu_Reset: () => {},
		nes_dmc_Reset: () => {},
		nes_dmc_SetAPU: () => {},
		nes_dmc_SetPal: () => {},
		nes_apu_Write: () => {},
		nes_dmc_Write: (_ptr, addr, val) => {
			dmcWrites.push({ addr, val });
		},
		nes_apu_SetMask: () => {},
		nes_dmc_SetMask: () => {},
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

		expect(renderSquarePeak(engine)).toBeLessThan(0.001);
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
});
