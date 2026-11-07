export const SAA_CHANNEL_COUNT = 6;
export const SAA_SAM_CLOCK = 8_000_000;
export const SAA_LEVEL_MAX = 15;
export const SAA_OUTPUT_GAIN = 3;
export const SAA_FULL_SIDE_PEAK = (SAA_LEVEL_MAX * 2 * 16 * 11.35) / 32768;
export const SAA_SCOPE_SCALE = 1 / SAA_FULL_SIDE_PEAK;

export const SAA_REG_TONE_MIXER = 20;
export const SAA_REG_NOISE_MIXER = 21;
export const SAA_REG_NOISE_CLOCK = 22;
export const SAA_REG_ENVELOPE_0 = 24;
export const SAA_REG_ENVELOPE_1 = 25;
export const SAA_REG_ENABLE = 28;
export const SAA_ENABLE_OUTPUT = 0x01;
