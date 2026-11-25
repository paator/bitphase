// @ts-nocheck
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

export const SAA_LEGACY_ENVELOPE_BYTES = [
	0x00, 0x96, 0x9e, 0x9a, 0x86, 0x8e, 0x8a, 0x97, 0x9f, 0x9b, 0x87, 0x8f, 0x8b
];

const ENVELOPE_HARDWARE_WAVE = [0, 1, 2, 3, 6, 7, 4, 5, 0];

export const SAA_ENVELOPE_SHAPE_VALUES = [0];
for (let waveform = 1; waveform <= 8; waveform++) {
	for (let variant = 0; variant <= 3; variant++) {
		SAA_ENVELOPE_SHAPE_VALUES.push((waveform << 4) | variant);
	}
}

export function saaEnvelopeByteFromCode(code) {
	const waveform = (code >> 4) & 0xf;
	const variant = code & 0xf;
	if (waveform < 1 || waveform > 8 || variant > 3) return null;
	return saaEnvelopeControlByte({
		shape: ENVELOPE_HARDWARE_WAVE[waveform],
		enabled: true,
		follow: true,
		coarse: (variant & 2) !== 0,
		mirror: (variant & 1) !== 0
	});
}

export function saaMigrateLegacyEnvelope(value) {
	const index = value | 0;
	if (index < 1 || index > 12) return value;
	const byte = SAA_LEGACY_ENVELOPE_BYTES[index];
	const hardware = (byte >> 1) & 7;
	const waveform = [8, 1, 2, 3, 6, 7, 4, 5][hardware];
	const variant = ((byte & 0x10) !== 0 ? 2 : 0) | ((byte & 0x01) !== 0 ? 1 : 0);
	return (waveform << 4) | variant;
}

export function saaToneFrequency(clockHz, octave, freqByte) {
	const divisor = 511 - (freqByte & 0xff);
	if (divisor <= 0 || !(clockHz > 0)) return 0;
	return ((clockHz / 512) * 2 ** (octave & 7)) / divisor;
}
