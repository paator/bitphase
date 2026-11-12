import { describe, it, expect, beforeEach } from 'vitest';
import VirtualChannelMixer from '../../public/ay/virtual-channel-mixer.js';
import AYChipRegisterState from '../../public/ay/ay-chip-register-state.js';
import {
	createToneTimerEffect,
	createVolumeTimerEffect
} from '../../public/ay/ay-timer-effect-constants.js';

function createState(channelCount: number) {
	return {
		channelSoundEnabled: Array(channelCount).fill(true)
	};
}

describe('VirtualChannelMixer', () => {
	let mixer: InstanceType<typeof VirtualChannelMixer>;

	beforeEach(() => {
		mixer = new VirtualChannelMixer();
	});

	describe('configuration', () => {
		it('should report no virtual channels by default', () => {
			expect(mixer.hasVirtualChannels()).toBe(false);
		});

		it('should report virtual channels after configuration', () => {
			mixer.configure({ 1: 2 }, 3);
			expect(mixer.hasVirtualChannels()).toBe(true);
		});

		it('should report no virtual channels when all counts are 1', () => {
			mixer.configure({ 0: 1, 1: 1, 2: 1 }, 3);
			expect(mixer.hasVirtualChannels()).toBe(false);
		});

		it('should compute total virtual channel count', () => {
			mixer.configure({ 0: 2, 1: 3, 2: 1 }, 3);
			expect(mixer.getTotalVirtualChannelCount()).toBe(6);
		});

		it('should map virtual channel indices to hardware channel indices', () => {
			mixer.configure({ 0: 2 }, 3);
			expect(mixer.getHardwareChannelIndex(0)).toBe(0);
			expect(mixer.getHardwareChannelIndex(1)).toBe(0);
			expect(mixer.getHardwareChannelIndex(2)).toBe(1);
			expect(mixer.getHardwareChannelIndex(3)).toBe(2);
		});
	});

	describe('merge', () => {
		it('should pass through when each hardware channel has 1 virtual channel', () => {
			mixer.configure({}, 3);
			const registerState = new AYChipRegisterState(3);
			registerState.channels[0].tone = 100;
			registerState.channels[1].tone = 200;
			registerState.channels[2].tone = 300;
			registerState.noise = 5;
			registerState.envelopePeriod = 1000;

			const state = createState(3);
			const result = mixer.merge(registerState, state);

			expect(result.channels[0].tone).toBe(100);
			expect(result.channels[1].tone).toBe(200);
			expect(result.channels[2].tone).toBe(300);
			expect(result.noise).toBe(5);
			expect(result.envelopePeriod).toBe(1000);
		});

		it('should select highest-priority active virtual channel', () => {
			mixer.configure({ 1: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 100;
			registerState.channels[1].tone = 200;
			registerState.channels[1].volume = 15;
			registerState.channels[2].tone = 300;
			registerState.channels[2].volume = 10;
			registerState.channels[3].tone = 400;

			const state = createState(4);
			const result = mixer.merge(registerState, state);

			expect(result.channels[0].tone).toBe(100);
			expect(result.channels[1].tone).toBe(200);
			expect(result.channels[2].tone).toBe(400);
		});

		it('should select lower-priority channel when higher-priority is silent', () => {
			mixer.configure({ 1: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[1].tone = 200;
			registerState.channels[1].volume = 0;
			registerState.channels[2].tone = 300;
			registerState.channels[2].volume = 8;
			registerState.channels[3].tone = 400;

			const state = createState(4);
			const result = mixer.merge(registerState, state);

			expect(result.channels[1].tone).toBe(300);
		});

		it('should fall back to last virtual channel when all are inactive', () => {
			mixer.configure({ 1: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[1].tone = 200;
			registerState.channels[1].volume = 0;
			registerState.channels[2].tone = 300;
			registerState.channels[2].volume = 0;
			registerState.channels[3].tone = 400;

			const state = createState(4);
			state.channelSoundEnabled[1] = false;
			state.channelSoundEnabled[2] = false;
			const result = mixer.merge(registerState, state);

			expect(result.channels[1].tone).toBe(300);
		});

		it('should treat envelope volume flag as active', () => {
			mixer.configure({ 0: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].volume = 0x10;
			registerState.channels[0].tone = 100;
			registerState.channels[1].volume = 5;
			registerState.channels[1].tone = 200;

			const state = createState(4);
			const result = mixer.merge(registerState, state);

			expect(result.channels[0].tone).toBe(100);
		});

		it('should copy mixer flags (tone, noise, envelope)', () => {
			mixer.configure({ 1: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[1].volume = 10;
			registerState.channels[1].mixer.tone = true;
			registerState.channels[1].mixer.noise = false;
			registerState.channels[1].mixer.envelope = true;

			const state = createState(4);
			const result = mixer.merge(registerState, state);

			expect(result.channels[1].mixer.tone).toBe(true);
			expect(result.channels[1].mixer.noise).toBe(false);
			expect(result.channels[1].mixer.envelope).toBe(true);
		});

		it('should copy global state (envelope, noise)', () => {
			mixer.configure({ 1: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.noise = 15;
			registerState.envelopePeriod = 2000;
			registerState.envelopeShape = 8;
			registerState.forceEnvelopeShapeWrite = true;

			const state = createState(4);
			const result = mixer.merge(registerState, state);

			expect(result.noise).toBe(15);
			expect(result.envelopePeriod).toBe(2000);
			expect(result.envelopeShape).toBe(8);
			expect(result.forceEnvelopeShapeWrite).toBe(true);
		});
	});

	describe('getAudibleVirtualChannelIndices', () => {
		it('returns only the leftmost active virtual channel per hardware group', () => {
			mixer.configure({ 0: 2, 1: 2 }, 3);
			const registerState = new AYChipRegisterState(5);
			registerState.channels[0].volume = 15;
			registerState.channels[1].volume = 10;
			registerState.channels[2].volume = 0;
			registerState.channels[3].volume = 12;
			registerState.channels[4].volume = 8;

			expect(mixer.getAudibleVirtualChannelIndices(registerState)).toEqual([0, 3, 4]);
		});

		it('returns empty when no virtual channel in a group is active', () => {
			mixer.configure({ 0: 2 }, 3);
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].volume = 0;
			registerState.channels[1].volume = 0;

			expect(mixer.getAudibleVirtualChannelIndices(registerState)).toEqual([]);
		});

		it('skips a column whose role feeds the timer', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 1: 'timer' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].volume = 15;
			registerState.channels[1].volume = 15;
			registerState.channels[2].volume = 8;

			expect(mixer.getAudibleVirtualChannelIndices(registerState)).toEqual([0, 2]);
		});
	});

	describe('timer note role', () => {
		it('keeps the voice on the audible column and steps its timer from the role column', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 1: 'timer' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 100;
			registerState.channels[0].volume = 15;
			registerState.channels[0].timerPeriodDetune = { semitone: 0, detune: 1 };
			registerState.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				period: 50,
				periodLow: 50
			});
			registerState.channels[1].tone = 400;
			registerState.channels[1].volume = 12;

			const result = mixer.merge(registerState, createState(4));

			expect(result.channels[0].tone).toBe(100);
			expect(result.channels[0].volume).toBe(15);
			expect(result.channels[0].timerEffects.sid.period).toBe(401);
			expect(result.channels[0].timerEffects.sid.periodLow).toBe(401);
		});

		it('lets a left-hand timer column supply the period while the voice stays on the right', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 0: 'timer' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 111;
			registerState.channels[0].volume = 15;
			registerState.channels[1].tone = 222;
			registerState.channels[1].volume = 10;
			registerState.channels[1].timerPeriodDetune = { semitone: 12, detune: 0 };
			registerState.channels[1].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				period: 10,
				periodLow: 10
			});
			registerState.channels[1].timerEffects.fm = createToneTimerEffect({
				enabled: true,
				period: 10,
				periodLow: 10,
				baseTonePeriod: 222
			});

			const result = mixer.merge(registerState, createState(4));

			expect(result.channels[0].tone).toBe(222);
			expect(result.channels[0].timerEffects.sid.period).toBe(56);
			expect(result.channels[0].timerEffects.fm.period).toBe(56);
			expect(result.channels[0].timerEffects.fm.baseTonePeriod).toBe(222);
		});

		it('rebuilds pwm periods from the timer note', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 1: 'timer' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 100;
			registerState.channels[0].volume = 15;
			registerState.channels[0].timerPeriodDetune = { semitone: 0, detune: 0 };
			registerState.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				pwm: true,
				pwmByDutyIndex: true,
				period: 80,
				periodLow: 20
			});
			registerState.channels[1].tone = 200;
			registerState.channels[1].volume = 15;

			const result = mixer.merge(registerState, createState(4));
			const sid = result.channels[0].timerEffects.sid;

			expect(sid.period).toBe(320);
			expect(sid.periodLow).toBe(80);
		});

		it('leaves the timer on the voice note when the role column is silent', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 1: 'timer' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 100;
			registerState.channels[0].volume = 15;
			registerState.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				period: 55,
				periodLow: 55
			});
			registerState.channels[1].tone = 400;
			registerState.channels[1].volume = 0;

			const result = mixer.merge(registerState, createState(4));

			expect(result.channels[0].tone).toBe(100);
			expect(result.channels[0].timerEffects.sid.period).toBe(55);
		});

		it('treats a role the chip does not claim as a normal voice', () => {
			mixer.configure({ 0: 2 }, 3, { 0: { 1: 'drone' } });
			const registerState = new AYChipRegisterState(4);
			registerState.channels[0].tone = 100;
			registerState.channels[0].volume = 15;
			registerState.channels[0].timerEffects.sid = createVolumeTimerEffect({
				enabled: true,
				period: 40,
				periodLow: 40
			});
			registerState.channels[1].tone = 300;
			registerState.channels[1].volume = 15;

			const result = mixer.merge(registerState, createState(4));

			expect(result.channels[0].tone).toBe(100);
			expect(result.channels[0].timerEffects.sid.period).toBe(40);
		});
	});
});
