import { describe, it, expect } from 'vitest';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';

describe('AYChipRegisterState', () => {
	describe('constructor', () => {
		it('creates 3 channels with tone, volume, mixer', () => {
			const state = new AYChipRegisterState();
			expect(state.channels).toHaveLength(3);
			for (let i = 0; i < 3; i++) {
				expect(state.channels[i]).toHaveProperty('tone', 0);
				expect(state.channels[i]).toHaveProperty('volume', 0);
				expect(state.channels[i].mixer).toEqual({
					tone: false,
					noise: false,
					envelope: false
				});
			}
		});

		it('noise, envelopePeriod, envelopeShape start at 0', () => {
			const state = new AYChipRegisterState();
			expect(state.noise).toBe(0);
			expect(state.envelopePeriod).toBe(0);
			expect(state.envelopeShape).toBe(0);
			expect(state.forceEnvelopeShapeWrite).toBe(false);
		});
	});

	describe('reset', () => {
		it('resets all channels to zero tone/volume and mixer off', () => {
			const state = new AYChipRegisterState();
			state.channels[0].tone = 100;
			state.channels[1].volume = 10;
			state.channels[2].mixer.tone = true;
			state.noise = 5;
			state.envelopePeriod = 1000;
			state.envelopeShape = 9;
			state.forceEnvelopeShapeWrite = true;

			state.reset();

			for (let i = 0; i < 3; i++) {
				expect(state.channels[i].tone).toBe(0);
				expect(state.channels[i].volume).toBe(0);
				expect(state.channels[i].mixer).toEqual({
					tone: false,
					noise: false,
					envelope: false
				});
			}
			expect(state.noise).toBe(0);
			expect(state.envelopePeriod).toBe(0);
			expect(state.envelopeShape).toBe(0);
			expect(state.forceEnvelopeShapeWrite).toBe(false);
		});
	});

	describe('copy', () => {
		it('returns a new instance with same channel values', () => {
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			state.channels[0].volume = 12;
			state.channels[0].mixer.tone = true;
			state.channels[1].mixer.noise = true;
			state.noise = 7;
			state.envelopePeriod = 2000;
			state.envelopeShape = 11;
			state.forceEnvelopeShapeWrite = true;

			const copy = state.copy();

			expect(copy).not.toBe(state);
			expect(copy.channels[0].tone).toBe(500);
			expect(copy.channels[0].volume).toBe(12);
			expect(copy.channels[0].mixer.tone).toBe(true);
			expect(copy.channels[1].mixer.noise).toBe(true);
			expect(copy.noise).toBe(7);
			expect(copy.envelopePeriod).toBe(2000);
			expect(copy.envelopeShape).toBe(11);
			expect(copy.forceEnvelopeShapeWrite).toBe(true);
		});

		it('copy is independent: mutating copy does not affect original', () => {
			const state = new AYChipRegisterState();
			state.channels[0].tone = 100;
			const copy = state.copy();
			copy.channels[0].tone = 999;
			expect(state.channels[0].tone).toBe(100);
		});
	});
});
