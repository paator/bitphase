import { describe, it, expect, vi, beforeEach } from 'vitest';
import AyumiEngine from '../../public/ay/ayumi-engine.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import {
	TIMER_EFFECT_KIND_VOLUME,
	TIMER_EFFECT_KIND_ENVELOPE_SHAPE,
	TIMER_EFFECT_KIND_ENVELOPE_PERIOD,
	TIMER_PWM_MODE_OFF,
	TIMER_PWM_MODE_BY_DUTY_INDEX,
	TIMER_FM_OFFSET_PERIOD,
	TIMER_EFFECT_SLOT_SID,
	TIMER_EFFECT_SLOT_SYNCBUZZER,
	TIMER_EFFECT_SLOT_FM,
	TIMER_EFFECT_SLOT_ENV_FM,
	createVolumeTimerEffect,
	createEnvelopeShapeTimerEffect,
	createEnvelopePeriodTimerEffect
} from '../../public/ay/ay-timer-effect-constants.js';

describe('AyumiEngine', () => {
	let mockWasm: {
		ayumi_set_tone: ReturnType<typeof vi.fn>;
		ayumi_set_volume: ReturnType<typeof vi.fn>;
		ayumi_set_mixer: ReturnType<typeof vi.fn>;
		ayumi_set_noise: ReturnType<typeof vi.fn>;
		ayumi_set_envelope: ReturnType<typeof vi.fn>;
		ayumi_set_envelope_shape: ReturnType<typeof vi.fn>;
		ayumi_set_timer_effect: ReturnType<typeof vi.fn>;
		ayumi_set_timer_effect_slot: ReturnType<typeof vi.fn>;
		ayumi_set_timer_effect_waveform: ReturnType<typeof vi.fn>;
		ayumi_timer_effect_reset: ReturnType<typeof vi.fn>;
		ayumi_process: ReturnType<typeof vi.fn>;
		ayumi_remove_dc: ReturnType<typeof vi.fn>;
		memory: { buffer: ArrayBuffer };
		malloc: ReturnType<typeof vi.fn>;
	};
	let mockPtr: number;

	beforeEach(() => {
		mockPtr = 12345;
		mockWasm = {
			ayumi_set_tone: vi.fn(),
			ayumi_set_volume: vi.fn(),
			ayumi_set_mixer: vi.fn(),
			ayumi_set_noise: vi.fn(),
			ayumi_set_envelope: vi.fn(),
			ayumi_set_envelope_shape: vi.fn(),
			ayumi_set_timer_effect: vi.fn(),
			ayumi_set_timer_effect_slot: vi.fn(),
			ayumi_set_timer_effect_waveform: vi.fn(),
			ayumi_timer_effect_reset: vi.fn(),
			ayumi_process: vi.fn(),
			ayumi_remove_dc: vi.fn(),
			memory: { buffer: new ArrayBuffer(4096) },
			malloc: vi.fn(() => 256)
		};
	});

	describe('constructor', () => {
		it('stores wasmModule and ayumiPtr', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			expect(engine.wasmModule).toBe(mockWasm);
			expect(engine.ayumiPtr).toBe(mockPtr);
		});

		it('has lastState as AYChipRegisterState', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			expect(engine.lastState).toBeInstanceOf(AYChipRegisterState);
		});
	});

	describe('applyRegisterState', () => {
		it('does nothing when wasmModule is null', () => {
			const engine = new AyumiEngine(null as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_tone).not.toHaveBeenCalled();
		});

		it('does nothing when ayumiPtr is null', () => {
			const engine = new AyumiEngine(mockWasm as any, null);
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_tone).not.toHaveBeenCalled();
		});

		it('calls ayumi_set_tone when channel tone differs from lastState', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_tone).toHaveBeenCalledWith(mockPtr, 0, 500);
		});

		it('calls ayumi_set_volume when channel volume differs', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[1].volume = 10;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_volume).toHaveBeenCalledWith(mockPtr, 1, 10);
		});

		it('calls ayumi_set_mixer when mixer differs', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].mixer.tone = true;
			state.channels[0].mixer.noise = true;
			state.channels[0].mixer.envelope = false;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledWith(mockPtr, 0, 0, 0, 0);
		});

		it('forces a full mixer apply after reset even when state matches lastState', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			engine.applyRegisterState(state);
			mockWasm.ayumi_set_mixer.mockClear();
			engine.reset();
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledTimes(3);
			expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledWith(mockPtr, 0, 1, 1, 0);
		});

		it('calls ayumi_set_noise when state.noise differs', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.noise = 5;
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_noise).toHaveBeenCalledWith(mockPtr, 5);
		});

		it('does not call set_tone again for same tone (lastState updated)', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			engine.applyRegisterState(state);
			mockWasm.ayumi_set_tone.mockClear();
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_tone).not.toHaveBeenCalled();
		});

		it('uploads volume timer effect waveform when first enabled with default waveform', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].mixer.tone = true;
			state.channels[0].tone = 500;
			state.channels[0].volume = 15;
			state.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				pwm: false,
				period: 503,
				baseVolume: 15,
				waveform: [15, 0],
				waveformLoop: 0,
				resetPhase: false
			});
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_timer_effect_slot).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_SID,
				1,
				TIMER_PWM_MODE_OFF,
				503,
				503,
				15,
				1,
				0
			);
			expect(mockWasm.ayumi_set_timer_effect_waveform).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_SID,
				256,
				2,
				0
			);
		});

		it('uploads envelope-shape timer effect waveform and pwm when enabled', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].mixer.tone = true;
			state.channels[0].mixer.envelope = true;
			state.channels[0].tone = 500;
			state.channels[0].volume = 15;
			state.channels[0].timerEffects.syncbuzzer = createEnvelopeShapeTimerEffect({
				enabled: true,
				pwm: true,
				period: 40,
				periodLow: 60,
				waveform: [13, 9],
				waveformLoop: 0,
				resetPhase: false
			});
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_timer_effect_slot).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_SYNCBUZZER,
				1,
				TIMER_PWM_MODE_BY_DUTY_INDEX,
				40,
				60,
				0,
				1,
				0
			);
			expect(mockWasm.ayumi_set_timer_effect_waveform).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_SYNCBUZZER,
				256,
				2,
				0
			);
		});

		it('uploads envelope-period timer effect with signed waveform and 16-bit base', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].mixer.tone = true;
			state.channels[0].mixer.envelope = true;
			state.channels[0].tone = 500;
			state.channels[0].volume = 15;
			state.channels[0].timerEffects.envFm = createEnvelopePeriodTimerEffect({
				enabled: true,
				pwm: false,
				period: 80,
				baseEnvelopePeriod: 0x1234,
				fmOffsetMode: TIMER_FM_OFFSET_PERIOD,
				waveform: [0, -16, 16, 9999],
				waveformLoop: 0,
				resetPhase: false
			});
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_timer_effect_slot).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_ENV_FM,
				1,
				TIMER_PWM_MODE_OFF,
				80,
				80,
				0,
				0x1234,
				TIMER_FM_OFFSET_PERIOD
			);
			expect(mockWasm.ayumi_set_timer_effect_waveform).toHaveBeenCalledWith(
				mockPtr,
				0,
				TIMER_EFFECT_SLOT_ENV_FM,
				256,
				4,
				0
			);
			const uploaded = Array.from(new Int32Array(mockWasm.memory.buffer, 256, 4));
			expect(uploaded).toEqual([0, -16, 16, 4095]);
		});

		it('does not re-upload unchanged volume timer effect waveform while enabled', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].mixer.tone = true;
			state.channels[0].tone = 500;
			state.channels[0].volume = 15;
			state.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				pwm: true,
				period: 503,
				baseVolume: 15,
				waveform: [15, 0],
				waveformLoop: 0,
				resetPhase: false
			});
			engine.applyRegisterState(state);
			mockWasm.ayumi_set_timer_effect_waveform.mockClear();
			engine.applyRegisterState(state);
			expect(mockWasm.ayumi_set_timer_effect_waveform).not.toHaveBeenCalled();
		});
	});

	describe('process', () => {
		it('calls ayumi_process when wasm and ptr set', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			engine.process();
			expect(mockWasm.ayumi_process).toHaveBeenCalledWith(mockPtr);
		});

		it('does nothing when wasmModule null', () => {
			const engine = new AyumiEngine(null as any, mockPtr);
			engine.process();
			expect(mockWasm.ayumi_process).not.toHaveBeenCalled();
		});
	});

	describe('removeDC', () => {
		it('calls ayumi_remove_dc when wasm and ptr set', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			engine.removeDC();
			expect(mockWasm.ayumi_remove_dc).toHaveBeenCalledWith(mockPtr);
		});
	});

	describe('reset', () => {
		it('resets lastState', () => {
			const engine = new AyumiEngine(mockWasm as any, mockPtr);
			const state = new AYChipRegisterState();
			state.channels[0].tone = 500;
			engine.applyRegisterState(state);
			engine.reset();
			expect(engine.lastState.channels[0].tone).toBe(0);
		});
	});
});
