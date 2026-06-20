export const NES_PULSE_WIDTHS = [0, 1, 2, 3];

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;
const SWEEP_RATE_MIN = 0;
const SWEEP_RATE_MAX = 7;
const SWEEP_SHIFT_MIN = -7;
const SWEEP_SHIFT_MAX = 7;
export const NES_SQUARE_SWEEP_DISABLED = 0x08;

export const NES_ENVELOPE_MODES = ['infinite', 'decay', 'loop', 'hold', 'unchanged'];

export const NES_LENGTH_COUNTER_LENGTHS = [
	10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22,
	192, 24, 72, 26, 16, 28, 32, 30
];

export const NES_REGISTER_UNCHANGED = -1;

export function buildSquareSilentVolumeReg(duty = 2) {
	return ((duty & 3) << 6) | (1 << 4);
}

export function buildNoiseSilentVolumeReg() {
	return 1 << 4;
}

export function buildTriangleSilentLinearReg() {
	return (1 << 7) | 0x7f;
}

const SOUND_LENGTH_MIN = 0;
const SOUND_LENGTH_MAX = 511;
const VOLUME_OR_RATE_MIN = 0;
const VOLUME_OR_RATE_MAX = 15;

function normalizeEnvelopeMode(value) {
	return NES_ENVELOPE_MODES.includes(value) ? value : 'infinite';
}

function normalizeSoundLength(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SOUND_LENGTH_MIN, Math.min(SOUND_LENGTH_MAX, Math.round(parsed)));
}

function normalizeVolumeOrRate(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(VOLUME_OR_RATE_MIN, Math.min(VOLUME_OR_RATE_MAX, Math.round(parsed)));
}

function normalizeToneAdd(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, Math.round(parsed)));
}

export function createDefaultNesInstrumentRow() {
	return {
		pulseWidth: 2,
		retrigger: false,
		soundLength: 0,
		envelopeMode: 'infinite',
		volumeOrRate: 15,
		toneAdd: 0,
		toneAccumulation: false,
		sweep: false,
		sweepRate: 0,
		sweepShift: 0
	};
}

function normalizeSweepRate(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_RATE_MIN, Math.min(SWEEP_RATE_MAX, Math.round(parsed)));
}

function normalizeSweepShift(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_SHIFT_MIN, Math.min(SWEEP_SHIFT_MAX, Math.round(parsed)));
}

export function buildSquareSweepReg(enabled, rate, shift) {
	if (!enabled || shift === 0) {
		return NES_SQUARE_SWEEP_DISABLED;
	}
	const amount = Math.abs(shift);
	const packed = ((rate & 7) << 4) | (amount & 7);
	return shift < 0 ? 0x88 | packed : 0x80 | packed;
}

function isSoundLengthEnabled(envelopeMode) {
	return envelopeMode !== 'infinite' && envelopeMode !== 'unchanged';
}

export function resolveLengthCounterIndex(soundLength) {
	if (soundLength <= 0) return 0;
	const target = soundLength;
	let bestIndex = 0;
	let bestDelta = Number.POSITIVE_INFINITY;
	for (let i = 0; i < NES_LENGTH_COUNTER_LENGTHS.length; i++) {
		const frames = NES_LENGTH_COUNTER_LENGTHS[i] * 2;
		const delta = Math.abs(frames - target);
		if (delta < bestDelta) {
			bestDelta = delta;
			bestIndex = i;
		}
	}
	return bestIndex;
}

function resolveEnvelopeLoopBit(soundLength) {
	return soundLength === 0 ? 1 << 5 : 0;
}

export function buildSquareEnvelopeVolumeReg(duty, envelopeMode, volumeOrRate, soundLength) {
	if (envelopeMode === 'unchanged') return NES_REGISTER_UNCHANGED;
	const volume = volumeOrRate & 15;
	const dutyBits = (duty & 3) << 6;
	const loopBit = resolveEnvelopeLoopBit(soundLength);
	switch (envelopeMode) {
		case 'infinite':
			return dutyBits | loopBit | (1 << 4) | volume;
		case 'decay':
		case 'loop':
			return dutyBits | loopBit | volume;
		case 'hold':
			return dutyBits | loopBit | (1 << 4) | volume;
		default:
			return dutyBits | loopBit | (1 << 4) | volume;
	}
}

export function buildNoiseEnvelopeVolumeReg(envelopeMode, volumeOrRate, soundLength) {
	if (envelopeMode === 'unchanged') return NES_REGISTER_UNCHANGED;
	const volume = volumeOrRate & 15;
	const loopBit = resolveEnvelopeLoopBit(soundLength);
	switch (envelopeMode) {
		case 'infinite':
			return loopBit | (1 << 4) | volume;
		case 'decay':
		case 'loop':
			return loopBit | volume;
		case 'hold':
			return loopBit | (1 << 4) | volume;
		default:
			return loopBit | (1 << 4) | volume;
	}
}

export function buildLengthCounterNibble(envelopeMode, soundLength) {
	if (envelopeMode === 'unchanged' || envelopeMode === 'infinite' || soundLength === 0) {
		return NES_REGISTER_UNCHANGED;
	}
	return resolveLengthCounterIndex(soundLength) & 31;
}

export function buildTriangleLinearReg(envelopeMode, soundLength) {
	if (envelopeMode === 'unchanged') return NES_REGISTER_UNCHANGED;
	if (soundLength === 0) {
		return (1 << 7) | 0x7f;
	}
	if (soundLength > 0 && soundLength < 128) {
		return soundLength & 0x7f;
	}
	return 0x7f;
}

export function usesTriangleLinearCounter(envelopeMode, soundLength) {
	return isSoundLengthEnabled(envelopeMode) && soundLength > 0 && soundLength < 128;
}

export function resolveEnvelopeVolumeOrRate(envelopeMode, patternVolume, instrumentVolumeOrRate, combinedVolume) {
	if (envelopeMode === 'unchanged') return 0;
	if (envelopeMode === 'infinite' || envelopeMode === 'hold') {
		return combinedVolume;
	}
	return instrumentVolumeOrRate;
}

export function isChannelAudible(envelopeMode, patternVolume, volumeOrRate, combinedVolume) {
	if (envelopeMode === 'unchanged') return patternVolume > 0;
	if (envelopeMode === 'infinite' || envelopeMode === 'hold') {
		return combinedVolume > 0;
	}
	return patternVolume > 0 && volumeOrRate > 0;
}

export function normalizeNesInstrumentRow(row) {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row?.pulseWidth) ? row.pulseWidth : defaults.pulseWidth;
	const envelopeMode = normalizeEnvelopeMode(row?.envelopeMode);
	const soundLength =
		envelopeMode === 'infinite' ? 0 : normalizeSoundLength(row?.soundLength);
	return {
		pulseWidth,
		retrigger: Boolean(row?.retrigger),
		soundLength,
		envelopeMode,
		volumeOrRate: normalizeVolumeOrRate(row?.volumeOrRate),
		toneAdd: normalizeToneAdd(row?.toneAdd),
		toneAccumulation: Boolean(row?.toneAccumulation),
		sweep: Boolean(row?.sweep),
		sweepRate: normalizeSweepRate(row?.sweepRate),
		sweepShift: normalizeSweepShift(row?.sweepShift)
	};
}

export function ensureNesInstrumentRows(rows) {
	if (!rows || rows.length === 0) {
		return [createDefaultNesInstrumentRow()];
	}
	return rows.map((row) => normalizeNesInstrumentRow(row));
}

export function normalizeNesInstrument(instrument) {
	if (!instrument) {
		return { rows: [createDefaultNesInstrumentRow()], loop: 0 };
	}
	return {
		...instrument,
		rows: ensureNesInstrumentRows(instrument.rows),
		loop: instrument.loop ?? 0
	};
}
