import { describe, it, expect } from 'vitest';
import AyumiState from '../../public/ay/ayumi-state.js';

describe('AyumiState', () => {
	describe('constructor', () => {
		it('extends TrackerState with 3 channels', () => {
			const state = new AyumiState();
			expect(state.channelInstruments).toHaveLength(3);
			expect(state.instrumentPositions).toHaveLength(3);
			expect(state.channelMuted).toHaveLength(3);
		});

		it('channelInstruments filled with -1', () => {
			const state = new AyumiState();
			expect(state.channelInstruments).toEqual([-1, -1, -1]);
		});

		it('instruments array empty, instrumentIdToIndex is Map', () => {
			const state = new AyumiState();
			expect(state.instruments).toEqual([]);
			expect(state.instrumentIdToIndex).toBeInstanceOf(Map);
		});

		it('wasmModule, ayumiPtr, wasmBuffer start null', () => {
			const state = new AyumiState();
			expect(state.wasmModule).toBeNull();
			expect(state.ayumiPtr).toBeNull();
			expect(state.wasmBuffer).toBeNull();
		});

		it('aymFrequency is DEFAULT_AYM_FREQUENCY (1773400)', () => {
			const state = new AyumiState();
			expect(state.aymFrequency).toBe(1773400);
		});

		it('isYM starts at 0', () => {
			const state = new AyumiState();
			expect(state.isYM).toBe(0);
		});
	});

	describe('setWasmModule', () => {
		it('sets wasmModule, ayumiPtr, wasmBuffer', () => {
			const state = new AyumiState();
			const mod = {};
			const ptr = 12345;
			const buf = new ArrayBuffer(100);
			state.setWasmModule(mod, ptr, buf);
			expect(state.wasmModule).toBe(mod);
			expect(state.ayumiPtr).toBe(ptr);
			expect(state.wasmBuffer).toBe(buf);
		});
	});

	describe('setAymFrequency', () => {
		it('sets aymFrequency', () => {
			const state = new AyumiState();
			state.setAymFrequency(2000000);
			expect(state.aymFrequency).toBe(2000000);
		});
	});

	describe('setChipVariant', () => {
		it('sets isYM to 1 for YM', () => {
			const state = new AyumiState();
			state.setChipVariant('YM');
			expect(state.isYM).toBe(1);
		});

		it('sets isYM to 0 for non-YM', () => {
			const state = new AyumiState();
			state.setChipVariant('AY');
			expect(state.isYM).toBe(0);
		});
	});

	describe('setInstruments', () => {
		it('stores instruments and builds id-to-index map with string id', () => {
			const state = new AyumiState();
			const inst1 = { id: '01', rows: [], loop: 0, name: 'I1' };
			const inst2 = { id: '02', rows: [], loop: 0, name: 'I2' };
			state.setInstruments([inst1, inst2]);
			expect(state.instruments).toHaveLength(2);
			expect(state.instrumentIdToIndex.get(parseInt('01', 36))).toBe(0);
			expect(state.instrumentIdToIndex.get(parseInt('02', 36))).toBe(1);
		});

		it('skips instruments without id', () => {
			const state = new AyumiState();
			state.setInstruments([{ id: '01', rows: [], loop: 0, name: 'I1' }, { rows: [] }]);
			expect(state.instruments).toHaveLength(2);
			expect(state.instrumentIdToIndex.size).toBe(1);
		});

		it('numeric id is stored in map', () => {
			const state = new AyumiState();
			state.setInstruments([{ id: 1, rows: [], loop: 0, name: 'I1' }]);
			expect(state.instrumentIdToIndex.get(1)).toBe(0);
		});
	});

	describe('reset', () => {
		it('resets channel instruments and instrument-related state', () => {
			const state = new AyumiState();
			state.channelInstruments[0] = 1;
			state.instrumentPositions[1] = 5;
			state.channelSoundEnabled[0] = true;
			state.channelEnvelopeEnabled[1] = true;
			state.reset();
			expect(state.channelInstruments).toEqual([-1, -1, -1]);
			expect(state.instrumentPositions).toEqual([0, 0, 0]);
			expect(state.channelSoundEnabled).toEqual([false, false, false]);
			expect(state.channelEnvelopeEnabled).toEqual([false, false, false]);
		});

		it('resets envelope and noise add values', () => {
			const state = new AyumiState();
			state.envelopeAddValue = 100;
			state.noiseAddValue = 5;
			state.reset();
			expect(state.envelopeAddValue).toBe(0);
			expect(state.noiseAddValue).toBe(0);
		});
	});
});
