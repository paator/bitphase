const NES_NOISE_PERIODS = {
	NTSC: [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068],
	PAL: [4, 8, 14, 30, 60, 88, 118, 148, 188, 236, 354, 472, 708, 944, 1890, 3778]
};

const NES_DPCM_PERIODS = {
	NTSC: [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54],
	PAL: [398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50]
};

function timerHz(cpuFrequency, periods, index) {
	if (!(cpuFrequency > 0)) return null;
	const period = periods[(index | 0) & 15];
	if (!(period > 0)) return null;
	return cpuFrequency / period;
}

export function nesNoiseRepeatHz(cpuFrequency, noisePeriod, isPal) {
	const periods = isPal ? NES_NOISE_PERIODS.PAL : NES_NOISE_PERIODS.NTSC;
	return timerHz(cpuFrequency, periods, noisePeriod);
}

export function nesDpcmSampleRateHz(cpuFrequency, pitch, isPal) {
	const periods = isPal ? NES_DPCM_PERIODS.PAL : NES_DPCM_PERIODS.NTSC;
	return timerHz(cpuFrequency, periods, pitch);
}
