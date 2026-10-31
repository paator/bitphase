import { SAA_LEVEL_MAX } from './saa-constants.js';

export const SAA_TONE_CODE_MAX = (7 << 8) | 0xff;

export function combineSaaLevel(patternLevel, instrumentLevel, slide) {
	const pattern = patternLevel > 0 ? Math.min(SAA_LEVEL_MAX, patternLevel | 0) : 0;
	let level = (instrumentLevel | 0) + (slide | 0);
	if (level < 0) level = 0;
	if (level > SAA_LEVEL_MAX) level = SAA_LEVEL_MAX;
	if (pattern <= 0) return 0;
	return Math.round((level * pattern) / SAA_LEVEL_MAX);
}

export function saaPeriodFromCode(code) {
	const packed = code | 0;
	if (packed <= 0) return SAA_TONE_CODE_MAX;
	if (packed >= SAA_TONE_CODE_MAX) return 0;
	return SAA_TONE_CODE_MAX - packed;
}

export function saaPitchCode(period, offset) {
	let value = (period | 0) + (offset | 0);
	if (value < 0) value = 0;
	if (value > SAA_TONE_CODE_MAX) value = SAA_TONE_CODE_MAX;
	return SAA_TONE_CODE_MAX - value;
}

export function saaNoiseClockByte(noise0, noise1) {
	return ((noise1 & 3) << 4) | (noise0 & 3);
}

export function saaEnvelopeControlByte({ shape, enabled, follow, coarse, mirror }) {
	if (!enabled) return 0;
	let byte = (shape & 7) << 1;
	if (mirror) byte |= 0x01;
	if (coarse) byte |= 0x10;
	if (!follow) byte |= 0x20;
	return byte | 0x80;
}

export function saaToneFrequency(clockHz, octave, freqByte) {
	const divisor = 511 - (freqByte & 0xff);
	if (divisor <= 0 || !(clockHz > 0)) return 0;
	return ((clockHz / 512) * 2 ** (octave & 7)) / divisor;
}
