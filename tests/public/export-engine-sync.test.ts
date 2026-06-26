import { describe, it, expect, vi, beforeEach } from 'vitest';
import AyumiEngine from '../../public/ay/ayumi-engine.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';

describe('export engine register sync', () => {
	let mockWasm: {
		ayumi_set_tone: ReturnType<typeof vi.fn>;
		ayumi_set_volume: ReturnType<typeof vi.fn>;
		ayumi_set_mixer: ReturnType<typeof vi.fn>;
		ayumi_set_noise: ReturnType<typeof vi.fn>;
		ayumi_set_envelope: ReturnType<typeof vi.fn>;
		ayumi_set_envelope_shape: ReturnType<typeof vi.fn>;
		ayumi_set_timer_effect: ReturnType<typeof vi.fn>;
		ayumi_set_timer_effect_waveform: ReturnType<typeof vi.fn>;
		ayumi_timer_effect_reset: ReturnType<typeof vi.fn>;
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
			ayumi_set_timer_effect_waveform: vi.fn(),
			ayumi_timer_effect_reset: vi.fn(),
			memory: { buffer: new ArrayBuffer(4096) },
			malloc: vi.fn(() => 256)
		};
	});

	it('skips mixer sync when silent register state matches lastState without reset', () => {
		const engine = new AyumiEngine(mockWasm as any, mockPtr);
		const registerState = new AYChipRegisterState();

		engine.applyRegisterState(registerState);

		expect(mockWasm.ayumi_set_mixer).not.toHaveBeenCalled();
	});

	it('forces mixer off after reset before export render loop', () => {
		const engine = new AyumiEngine(mockWasm as any, mockPtr);
		const registerState = new AYChipRegisterState();

		engine.reset();
		engine.applyRegisterState(registerState);

		expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledTimes(3);
		expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledWith(mockPtr, 0, 1, 1, 0);
		expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledWith(mockPtr, 1, 1, 1, 0);
		expect(mockWasm.ayumi_set_mixer).toHaveBeenCalledWith(mockPtr, 2, 1, 1, 0);
	});
});
