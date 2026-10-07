import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	NES_NTSC_CPU_FREQUENCY,
	NES_RENDER_CLOCK_DIVIDER
} from '../../public/nes/nes-constants.js';

const RENDER_RATE = NES_NTSC_CPU_FREQUENCY / NES_RENDER_CLOCK_DIVIDER;
const SAMPLE_RATE = 44100;

async function loadResampler() {
	const wasmPath = path.join(process.cwd(), 'public/nes/nes_apu.wasm');
	const wasmBuffer = readFileSync(wasmPath);
	const { instance } = await WebAssembly.instantiate(wasmBuffer, {
		env: { emscripten_notify_memory_growth: () => {} }
	});
	const wasm = instance.exports;
	const ptr = wasm.chip_output_resampler_create(1);
	const maxSource = wasm.chip_output_resampler_max_source();
	wasm.chip_output_resampler_configure(ptr, RENDER_RATE, SAMPLE_RATE);
	return {
		wasm,
		ptr,
		source: new Float64Array(
			wasm.memory.buffer,
			wasm.chip_output_resampler_source(ptr),
			maxSource
		),
		output: new Float64Array(wasm.memory.buffer, wasm.chip_output_resampler_output(ptr), 1),
		destroy() {
			wasm.chip_output_resampler_destroy(ptr);
		}
	};
}

function renderFrame(resampler, fillSource) {
	const needed = resampler.wasm.chip_output_resampler_samples_for_frame(resampler.ptr);
	for (let i = 0; i < needed; i++) {
		resampler.source[i] = fillSource();
	}
	resampler.wasm.chip_output_resampler_process_frame(resampler.ptr);
	return resampler.output[0];
}

function rms(samples) {
	let sum = 0;
	for (let i = 0; i < samples.length; i++) {
		sum += samples[i] * samples[i];
	}
	return Math.sqrt(sum / samples.length);
}

describe('chip output resampler', () => {
	it('keeps a steady level after the filter fills', async () => {
		const resampler = await loadResampler();
		try {
			const output = [];
			for (let i = 0; i < 200; i++) {
				output.push(renderFrame(resampler, () => 0.5));
			}
			for (const sample of output.slice(64)) {
				expect(sample).toBeCloseTo(0.5, 3);
			}
		} finally {
			resampler.destroy();
		}
	});

	it('passes a low tone and rejects energy above the output Nyquist', async () => {
		const low = await loadResampler();
		const high = await loadResampler();
		try {
			let lowIndex = 0;
			let highIndex = 0;
			const lowSamples = [];
			const highSamples = [];
			for (let i = 0; i < 4000; i++) {
				lowSamples.push(
					renderFrame(low, () => {
						const sample = Math.sin((2 * Math.PI * 1000 * lowIndex) / RENDER_RATE);
						lowIndex += 1;
						return sample;
					})
				);
				highSamples.push(
					renderFrame(high, () => {
						const sample = Math.sin((2 * Math.PI * 70000 * highIndex) / RENDER_RATE);
						highIndex += 1;
						return sample;
					})
				);
			}
			const lowLevel = rms(lowSamples.slice(500));
			const highLevel = rms(highSamples.slice(500));
			expect(lowLevel).toBeGreaterThan(0.4);
			expect(highLevel).toBeLessThan(lowLevel * 0.02);
		} finally {
			low.destroy();
			high.destroy();
		}
	});

	it('pulls chip samples at the render rate', async () => {
		const resampler = await loadResampler();
		try {
			let pulls = 0;
			for (let i = 0; i < SAMPLE_RATE; i++) {
				const needed = resampler.wasm.chip_output_resampler_samples_for_frame(
					resampler.ptr
				);
				pulls += needed;
				for (let s = 0; s < needed; s++) {
					resampler.source[s] = 0;
				}
				resampler.wasm.chip_output_resampler_process_frame(resampler.ptr);
			}
			const expected = RENDER_RATE;
			expect(Math.abs(pulls - expected) / expected).toBeLessThan(0.001);
		} finally {
			resampler.destroy();
		}
	});
});
