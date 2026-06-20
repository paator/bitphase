export const NES_PULSE_WIDTHS = [0, 1, 2, 3] as const;

export type NesPulseWidth = (typeof NES_PULSE_WIDTHS)[number];

export const NES_PULSE_WIDTH_LABELS: Record<NesPulseWidth, string> = {
	0: '⅛',
	1: '¼',
	2: '½',
	3: '¾'
};

const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;
const SWEEP_RATE_MIN = 0;
const SWEEP_RATE_MAX = 7;
const SWEEP_SHIFT_MIN = -7;
const SWEEP_SHIFT_MAX = 7;
export const NES_SQUARE_SWEEP_DISABLED = 0x08;

export const NES_ENVELOPE_MODES = ['infinite', 'decay', 'loop', 'hold', 'unchanged'] as const;

export type NesEnvelopeMode = (typeof NES_ENVELOPE_MODES)[number];

export const NES_ENVELOPE_MODE_LABELS: Record<NesEnvelopeMode, string> = {
	infinite: 'Infinite',
	decay: 'Decay',
	loop: 'Loop',
	hold: 'Hold',
	unchanged: 'Unchanged'
};

export const NES_LENGTH_COUNTER_LENGTHS = [
	10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22,
	192, 24, 72, 26, 16, 28, 32, 30
] as const;

const SOUND_LENGTH_MIN = 0;
const SOUND_LENGTH_MAX = 511;
const VOLUME_OR_RATE_MIN = 0;
const VOLUME_OR_RATE_MAX = 15;

export type NesInstrumentRow = {
	pulseWidth: NesPulseWidth;
	retrigger: boolean;
	soundLength: number;
	envelopeMode: NesEnvelopeMode;
	volumeOrRate: number;
	toneAdd: number;
	toneAccumulation: boolean;
	sweep: boolean;
	sweepRate: number;
	sweepShift: number;
};

export function isNesEnvelopeInfinite(mode: NesEnvelopeMode): boolean {
	return mode === 'infinite';
}

export function isNesEnvelopeUnchanged(mode: NesEnvelopeMode): boolean {
	return mode === 'unchanged';
}

export function isNesSoundLengthEnabled(mode: NesEnvelopeMode): boolean {
	return !isNesEnvelopeInfinite(mode) && !isNesEnvelopeUnchanged(mode);
}

export function isNesVolumeOrRateEnabled(mode: NesEnvelopeMode): boolean {
	return !isNesEnvelopeUnchanged(mode);
}

export function isNesVolumeField(mode: NesEnvelopeMode): boolean {
	return mode === 'infinite';
}

export function cycleNesEnvelopeMode(current: NesEnvelopeMode): NesEnvelopeMode {
	const index = NES_ENVELOPE_MODES.indexOf(current);
	const nextIndex = index < 0 ? 0 : (index + 1) % NES_ENVELOPE_MODES.length;
	return NES_ENVELOPE_MODES[nextIndex];
}

export function createDefaultNesInstrumentRow(): NesInstrumentRow {
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

function normalizeToneAdd(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, Math.round(parsed)));
}

function normalizeSweepRate(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_RATE_MIN, Math.min(SWEEP_RATE_MAX, Math.round(parsed)));
}

function normalizeSweepShift(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SWEEP_SHIFT_MIN, Math.min(SWEEP_SHIFT_MAX, Math.round(parsed)));
}

function normalizeEnvelopeMode(value: unknown): NesEnvelopeMode {
	return NES_ENVELOPE_MODES.includes(value as NesEnvelopeMode)
		? (value as NesEnvelopeMode)
		: 'infinite';
}

function normalizeSoundLength(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(SOUND_LENGTH_MIN, Math.min(SOUND_LENGTH_MAX, Math.round(parsed)));
}

function normalizeVolumeOrRate(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(VOLUME_OR_RATE_MIN, Math.min(VOLUME_OR_RATE_MAX, Math.round(parsed)));
}

export function buildSquareSweepReg(enabled: boolean, rate: number, shift: number): number {
	if (!enabled || shift === 0) {
		return NES_SQUARE_SWEEP_DISABLED;
	}
	const amount = Math.abs(shift);
	const packed = ((rate & 7) << 4) | (amount & 7);
	return shift < 0 ? 0x88 | packed : 0x80 | packed;
}

export const NES_REGISTER_UNCHANGED = -1;

export function resolveLengthCounterIndex(soundLength: number): number {
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

function resolveEnvelopeLoopBit(soundLength: number): number {
	return soundLength === 0 ? 1 << 5 : 0;
}

export function buildSquareEnvelopeVolumeReg(
	duty: NesPulseWidth,
	envelopeMode: NesEnvelopeMode,
	volumeOrRate: number,
	soundLength: number
): number {
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

export function buildNoiseEnvelopeVolumeReg(
	envelopeMode: NesEnvelopeMode,
	volumeOrRate: number,
	soundLength: number
): number {
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

export function buildLengthCounterNibble(
	envelopeMode: NesEnvelopeMode,
	soundLength: number
): number {
	if (
		envelopeMode === 'unchanged' ||
		envelopeMode === 'infinite' ||
		soundLength === 0
	) {
		return NES_REGISTER_UNCHANGED;
	}
	return resolveLengthCounterIndex(soundLength) & 31;
}

export function buildTriangleLinearReg(
	envelopeMode: NesEnvelopeMode,
	soundLength: number
): number {
	if (envelopeMode === 'unchanged') return NES_REGISTER_UNCHANGED;
	if (soundLength === 0) {
		return (1 << 7) | 0x7f;
	}
	if (soundLength > 0 && soundLength < 128) {
		return soundLength & 0x7f;
	}
	return 0x7f;
}

export function usesTriangleLinearCounter(
	envelopeMode: NesEnvelopeMode,
	soundLength: number
): boolean {
	return (
		isNesSoundLengthEnabled(envelopeMode) && soundLength > 0 && soundLength < 128
	);
}

export function normalizeNesInstrumentRow(row: Record<string, unknown>): NesInstrumentRow {
	const defaults = createDefaultNesInstrumentRow();
	const pulseWidth = NES_PULSE_WIDTHS.includes(row.pulseWidth as NesPulseWidth)
		? (row.pulseWidth as NesPulseWidth)
		: defaults.pulseWidth;
	const envelopeMode = normalizeEnvelopeMode(row.envelopeMode);
	const soundLength = isNesEnvelopeInfinite(envelopeMode)
		? 0
		: normalizeSoundLength(row.soundLength);
	return {
		pulseWidth,
		retrigger: Boolean(row.retrigger),
		soundLength,
		envelopeMode,
		volumeOrRate: normalizeVolumeOrRate(row.volumeOrRate),
		toneAdd: normalizeToneAdd(row.toneAdd),
		toneAccumulation: Boolean(row.toneAccumulation),
		sweep: Boolean(row.sweep),
		sweepRate: normalizeSweepRate(row.sweepRate),
		sweepShift: normalizeSweepShift(row.sweepShift)
	};
}

export function ensureNesInstrumentRows(rows: Record<string, unknown>[]): NesInstrumentRow[] {
	if (rows.length === 0) {
		return [createDefaultNesInstrumentRow()];
	}
	return rows.map((row) => normalizeNesInstrumentRow(row));
}

export function cyclePulseWidth(current: NesPulseWidth): NesPulseWidth {
	const index = NES_PULSE_WIDTHS.indexOf(current);
	const nextIndex = index < 0 ? 0 : (index + 1) % NES_PULSE_WIDTHS.length;
	return NES_PULSE_WIDTHS[nextIndex];
}
