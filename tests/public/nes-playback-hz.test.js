import { describe, expect, it } from 'vitest';
import { NesWorkletSlot } from '../../public/nes/nes-worklet-slot.js';
import { nesDpcmSampleRateHz, nesNoiseRepeatHz } from '../../public/nes/nes-playback-hz.js';

const NTSC = 1_789_773;
const PAL = 1_662_607;
const DENDY = 1_773_448;

function playbackSlot(cpuFrequency, chipVariant = 'NTSC') {
	const slot = new NesWorkletSlot({ postMessage() {} }, 0);
	slot.state.setCpuFrequency(cpuFrequency);
	slot.state.setChipVariant(chipVariant);
	return slot;
}

describe('NES playback frequency', () => {
	it('uses the noise timer rate as the repeat frequency', () => {
		expect(nesNoiseRepeatHz(NTSC, 0, false)).toBeCloseTo(NTSC / 4);
		expect(nesNoiseRepeatHz(NTSC, 15, false)).toBeCloseTo(NTSC / 4068);
		expect(nesNoiseRepeatHz(PAL, 2, true)).toBeCloseTo(PAL / 14);
		expect(nesNoiseRepeatHz(PAL, 15, true)).toBeCloseTo(PAL / 3778);
		expect(nesNoiseRepeatHz(DENDY, 15, false)).toBeCloseTo(DENDY / 4068);
		expect(nesNoiseRepeatHz(0, 0, false)).toBeNull();
	});

	it('uses the DPCM bit clock as the sample rate', () => {
		expect(nesDpcmSampleRateHz(NTSC, 0, false)).toBeCloseTo(NTSC / 428);
		expect(nesDpcmSampleRateHz(NTSC, 15, false)).toBeCloseTo(NTSC / 54);
		expect(nesDpcmSampleRateHz(PAL, 0, true)).toBeCloseTo(PAL / 398);
		expect(nesDpcmSampleRateHz(PAL, 15, true)).toBeCloseTo(PAL / 50);
	});

	it('shows pulse and triangle pitch, noise repeat rate, and DPCM sample rate', () => {
		const slot = playbackSlot(NTSC);
		const channels = slot.registerState.channels;
		channels[0].enabled = true;
		channels[0].period = 253;
		channels[1].enabled = true;
		channels[1].period = 0;
		channels[2].enabled = true;
		channels[2].period = 426;
		channels[3].enabled = true;
		channels[3].period = 0;
		channels[3].noisePeriod = 15;
		channels[4].enabled = true;
		channels[4].dpcmPitch = 15;

		expect(slot._collectPlaybackHz().toneHz).toEqual([
			NTSC / (16 * 253),
			null,
			NTSC / (32 * 426),
			NTSC / 4068,
			NTSC / 54
		]);
	});

	it('hides noise and DPCM frequency while the channel is off', () => {
		const slot = playbackSlot(NTSC);
		const channels = slot.registerState.channels;
		channels[3].noisePeriod = 4;
		channels[4].dpcmPitch = 8;

		const hz = slot._collectPlaybackHz().toneHz;
		expect(hz[3]).toBeNull();
		expect(hz[4]).toBeNull();
	});

	it('uses PAL rate tables on PAL and NTSC tables on Dendy', () => {
		const pal = playbackSlot(PAL, 'PAL');
		pal.registerState.channels[3].enabled = true;
		pal.registerState.channels[3].noisePeriod = 15;
		pal.registerState.channels[4].enabled = true;
		pal.registerState.channels[4].dpcmPitch = 0;

		const palHz = pal._collectPlaybackHz().toneHz;
		expect(palHz[3]).toBeCloseTo(PAL / 3778);
		expect(palHz[4]).toBeCloseTo(PAL / 398);

		const dendy = playbackSlot(DENDY, 'Dendy');
		dendy.registerState.channels[3].enabled = true;
		dendy.registerState.channels[3].noisePeriod = 15;
		dendy.registerState.channels[4].enabled = true;
		dendy.registerState.channels[4].dpcmPitch = 15;

		const dendyHz = dendy._collectPlaybackHz().toneHz;
		expect(dendyHz[3]).toBeCloseTo(DENDY / 4068);
		expect(dendyHz[4]).toBeCloseTo(DENDY / 54);
	});
});
