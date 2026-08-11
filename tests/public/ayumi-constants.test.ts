import { describe, it, expect } from 'vitest';
import {
	AYUMI_STRUCT_SIZE,
	AYUMI_STRUCT_LEFT_OFFSET,
	AYUMI_STRUCT_RIGHT_OFFSET,
	DEFAULT_SONG_HZ,
	DEFAULT_SPEED,
	DEFAULT_CHANNEL_VOLUMES,
	DEFAULT_AYM_FREQUENCY,
	getPanSettingsForLayout
} from '../../public/ay/ayumi-constants.js';

async function instantiateAyumiWasm() {
	const fs = await import('node:fs');
	const path = await import('node:path');
	const wasmPath = path.join(process.cwd(), 'public/ay/ayumi.wasm');
	const wasm = fs.readFileSync(wasmPath);
	return WebAssembly.instantiate(wasm, {
		env: { emscripten_notify_memory_growth: () => {} }
	});
}

describe('ayumi-constants', () => {
	describe('constants', () => {
		it('AYUMI_STRUCT_SIZE matches ayumi.wasm', async () => {
			const { instance } = await instantiateAyumiWasm();
			expect(instance.exports.ayumi_struct_size()).toBe(AYUMI_STRUCT_SIZE);
		});

		it('native SID timer volume uses DAC-space scaling', async () => {
			const { instance } = await instantiateAyumiWasm();
			const wasm = instance.exports as any;
			const ay = wasm.malloc(AYUMI_STRUCT_SIZE);
			const regs = wasm.malloc(14);
			const waveform = wasm.malloc(4);
			try {
				new Int32Array(wasm.memory.buffer, waveform, 1)[0] = 7;
				wasm.ayumi_configure(ay, 0, DEFAULT_AYM_FREQUENCY, 44100, 0);
				wasm.ayumi_set_timer_effect(ay, 0, 1, 1, 0, 1, 1, 10, 1, 0);
				wasm.ayumi_set_timer_effect_waveform(ay, 0, 0, waveform, 1, 0);
				wasm.ayumi_get_registers(ay, regs);

				const out = new Uint8Array(wasm.memory.buffer, regs, 14);
				expect(out[8]).toBe(4);
			} finally {
				wasm.free(waveform);
				wasm.free(regs);
				wasm.free(ay);
			}
		});

		it('AYUMI_STRUCT_LEFT_OFFSET is struct size minus 40', () => {
			expect(AYUMI_STRUCT_LEFT_OFFSET).toBe(AYUMI_STRUCT_SIZE - 40);
		});

		it('AYUMI_STRUCT_RIGHT_OFFSET is struct size minus 32', () => {
			expect(AYUMI_STRUCT_RIGHT_OFFSET).toBe(AYUMI_STRUCT_SIZE - 32);
		});

		it('DEFAULT_SONG_HZ is 50', () => {
			expect(DEFAULT_SONG_HZ).toBe(50);
		});

		it('DEFAULT_SPEED is 3', () => {
			expect(DEFAULT_SPEED).toBe(3);
		});

		it('DEFAULT_CHANNEL_VOLUMES is [15, 15, 15]', () => {
			expect(DEFAULT_CHANNEL_VOLUMES).toEqual([15, 15, 15]);
		});

		it('DEFAULT_AYM_FREQUENCY is 1773400', () => {
			expect(DEFAULT_AYM_FREQUENCY).toBe(1773400);
		});
	});

	describe('getPanSettingsForLayout', () => {
		it('returns 3 channel entries for ABC layout', () => {
			const result = getPanSettingsForLayout('ABC');
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ channel: 0, pan: expect.any(Number), isEqp: 1 });
			expect(result[1]).toEqual({ channel: 1, pan: expect.any(Number), isEqp: 1 });
			expect(result[2]).toEqual({ channel: 2, pan: expect.any(Number), isEqp: 1 });
		});

		it('ABC layout: channel 0 left of center, channel 1 center, channel 2 right of center', () => {
			const result = getPanSettingsForLayout('ABC');
			const center = 0.5;
			const sep = 60 / 200;
			expect(result[0].pan).toBe(center - sep);
			expect(result[1].pan).toBe(center);
			expect(result[2].pan).toBe(center + sep);
		});

		it('ACB layout: A left, B right, C center', () => {
			const result = getPanSettingsForLayout('ACB');
			const center = 0.5;
			const sep = 60 / 200;
			expect(result[0].pan).toBe(center - sep);
			expect(result[1].pan).toBe(center + sep);
			expect(result[2].pan).toBe(center);
		});

		it('CAB layout: A center, B right, C left', () => {
			const result = getPanSettingsForLayout('CAB');
			const center = 0.5;
			const sep = 60 / 200;
			expect(result[0].pan).toBe(center);
			expect(result[1].pan).toBe(center + sep);
			expect(result[2].pan).toBe(center - sep);
		});

		it('mono layout: all channels at center', () => {
			const result = getPanSettingsForLayout('mono');
			expect(result[0].pan).toBe(0.5);
			expect(result[1].pan).toBe(0.5);
			expect(result[2].pan).toBe(0.5);
		});

		it('unknown layout defaults to ABC', () => {
			const result = getPanSettingsForLayout('unknown');
			const abc = getPanSettingsForLayout('ABC');
			expect(result[0].pan).toBe(abc[0].pan);
			expect(result[1].pan).toBe(abc[1].pan);
			expect(result[2].pan).toBe(abc[2].pan);
		});
	});
});
