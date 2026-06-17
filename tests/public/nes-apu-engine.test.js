import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNesApuEngine } from '../../public/nes/nes-apu-engine.js';
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

describe('NesApuEngine', () => {
	it('plays square waves after channel enable and register writes', async () => {
		const wasmModule = await loadWasm();
		const { engine } = createNesApuEngine(wasmModule);
		const registerState = new NesChipRegisterState();

		wasmModule.nes_apu_Write(engine.apuPtr, 0x4015, 0);

		registerState.channels[0].enabled = true;
		registerState.channels[0].period = 428;
		registerState.channels[0].volume = 15;
		registerState.channels[0].duty = 2;
		registerState.channels[0].retrigger = true;

		engine.applyRegisterState(registerState);

		expect(renderSquarePeak(engine)).toBeGreaterThan(0.01);
	});

	it('writes sweep disable for pulse channels', async () => {
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
		engine.applyRegisterState(registerState);

		wasmModule.nes_apu_Write(engine.apuPtr, 0x4015, 0);

		registerState.channels[0].enabled = true;
		registerState.channels[0].retrigger = false;
		engine.applyRegisterState(registerState);

		expect(renderSquarePeak(engine)).toBeGreaterThan(0.01);
	});
});
