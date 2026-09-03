import type { Instrument } from '../../models/song';
import {
	INSTRUMENT_MACRO_MIN_LENGTH,
	resolveTimerInstrumentMacros,
	sampleInstrumentRowFromMacros,
	type InstrumentMacros
} from '../base/instrument-macros';
import { AY_TIMER_MACRO_FIELDS } from './ay-timer-macros';
import { copyInstrumentSampleFields } from './sample-region';

export type AyFmOffsetMode = 'semitone' | 'period';

export type AyTimerRow = {
	sid: boolean;
	syncbuzzer?: boolean;
	fm?: boolean;
	envFm?: boolean;
	fmOffsetMode?: AyFmOffsetMode;
	envFmOffsetMode?: AyFmOffsetMode;
	detune?: number;
	semitone?: number;
	timerWaveform?: number[];
	timerWaveformLoop?: number;
	fmWaveform?: number[];
	fmWaveformLoop?: number;
	envFmWaveform?: number[];
	envFmWaveformLoop?: number;
};

export type AyInstrumentFields = {
	timerMacros: InstrumentMacros;
	timerPwmDuty: number;
	timerPwmSweepMin: number;
	timerPwmSweep: number;
	timerPwmPreserveOnNewNote: boolean;
	timerPwmSweepStartPhase: number;
	timerPwmSweepShape: AyTimerPwmSweepShape;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLength?: number;
	sampleLoopEnabled?: boolean;
	sampleLoop?: number;
};

export const DEFAULT_AY_SID_PERIOD_DETUNE = 1;
export const DEFAULT_AY_SID_PERIOD_SEMITONE_DETUNE = 0;
export const DEFAULT_AY_TIMER_WAVEFORM = [15, 0];
export const DEFAULT_AY_SYNCBUZZER_WAVEFORM = [8];
export const DEFAULT_AY_FM_WAVEFORM = [0, 7];
export const DEFAULT_AY_FM_PERIOD_WAVEFORM = [0, 16, 0, -16];
export const AY_FM_SEMITONE_MIN = -127;
export const AY_FM_SEMITONE_MAX = 128;
export const AY_FM_PERIOD_OFFSET_MIN = -4095;
export const AY_FM_PERIOD_OFFSET_MAX = 4095;
export const AY_TIMER_PWM_DUTY_MIN = 0;
export const AY_TIMER_PWM_DUTY_MAX = 100;
export const AY_TIMER_PWM_PERCENT_MAX_DIGITS = 3;
export const DEFAULT_AY_TIMER_PWM_DUTY = 50;
export const DEFAULT_AY_TIMER_PWM_SWEEP_MIN = 0;
export const DEFAULT_AY_TIMER_PWM_SWEEP = 0;
export const TIMER_PWM_SWEEP_UNINITIALIZED = -1;
export const AY_TIMER_PWM_SWEEP_START_PHASE_MAX = 1000;
export const DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE = 0;
export const AY_TIMER_PWM_SWEEP_START_PHASE_PEAK = AY_TIMER_PWM_SWEEP_START_PHASE_MAX / 2;
export const AY_TIMER_PWM_SWEEP_SHAPES = [
	'triangle',
	'sine',
	'sawUp',
	'sawDown',
	'square'
] as const;
export type AyTimerPwmSweepShape = (typeof AY_TIMER_PWM_SWEEP_SHAPES)[number];
export const DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE: AyTimerPwmSweepShape = 'triangle';
export const AY_TIMER_PWM_SWEEP_SHAPE_LABELS: Record<AyTimerPwmSweepShape, string> = {
	triangle: 'Triangle',
	sine: 'Sine',
	sawUp: 'Saw up',
	sawDown: 'Saw down',
	square: 'Square'
};
export const AY_TIMER_WAVEFORM_MIN_LENGTH = 1;
export const AY_TIMER_WAVEFORM_MAX_LENGTH = 32;
export const AY_TONE_REGISTER_PRESCALER = 16;
export const AY_AUTO_TIMER_TONE_MULTIPLIER = 16;

type ExtendedInstrument = Instrument & {
	timerMacros?: InstrumentMacros;
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
	timerPwmPreserveOnNewNote?: boolean;
	timerPwmReverseSweep?: boolean;
	timerPwmSweepStartPhase?: number;
	timerPwmSweepShape?: AyTimerPwmSweepShape;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLength?: number;
	sampleLoopEnabled?: boolean;
	sampleLoop?: number;
};

type LegacyTimerRow = AyTimerRow & {
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
};

export function createDefaultInstrumentTimerPwmFields(): Pick<
	AyInstrumentFields,
	'timerPwmDuty' | 'timerPwmSweepMin' | 'timerPwmSweep'
> {
	return {
		timerPwmDuty: DEFAULT_AY_TIMER_PWM_DUTY,
		timerPwmSweepMin: DEFAULT_AY_TIMER_PWM_SWEEP_MIN,
		timerPwmSweep: DEFAULT_AY_TIMER_PWM_SWEEP
	};
}

export function createDefaultAyTimerRow(): AyTimerRow {
	return {
		sid: false,
		syncbuzzer: false,
		fm: false,
		envFm: false,
		timerWaveform: [...DEFAULT_AY_TIMER_WAVEFORM],
		timerWaveformLoop: 0,
		fmWaveform: [...DEFAULT_AY_FM_WAVEFORM],
		fmWaveformLoop: 0,
		envFmWaveform: [...DEFAULT_AY_FM_WAVEFORM],
		envFmWaveformLoop: 0
	};
}

export function rowUsesFmWaveform(row: AyTimerRow | undefined): boolean {
	return !!row?.fm;
}

export function rowUsesEnvFmWaveform(row: AyTimerRow | undefined): boolean {
	return !!row?.envFm;
}

export function rowUsesOffsetWaveform(row: AyTimerRow | undefined): boolean {
	return rowUsesFmWaveform(row) || rowUsesEnvFmWaveform(row);
}

export function resolveAyFmOffsetMode(row: AyTimerRow | undefined): AyFmOffsetMode {
	return row?.fmOffsetMode === 'period' ? 'period' : 'semitone';
}

export function resolveAyEnvFmOffsetMode(row: AyTimerRow | undefined): AyFmOffsetMode {
	if (row?.envFmOffsetMode === 'period' || row?.envFmOffsetMode === 'semitone') {
		return row.envFmOffsetMode;
	}
	return resolveAyFmOffsetMode(row);
}

export function defaultAyFmWaveform(mode: AyFmOffsetMode): number[] {
	return mode === 'period' ? [...DEFAULT_AY_FM_PERIOD_WAVEFORM] : [...DEFAULT_AY_FM_WAVEFORM];
}

export function clampFmSemitone(value: number): number {
	return Math.max(AY_FM_SEMITONE_MIN, Math.min(AY_FM_SEMITONE_MAX, value | 0));
}

export function clampFmPeriodOffset(value: number): number {
	return Math.max(AY_FM_PERIOD_OFFSET_MIN, Math.min(AY_FM_PERIOD_OFFSET_MAX, value | 0));
}

export function clampFmWaveformValue(value: number, mode: AyFmOffsetMode): number {
	return mode === 'period' ? clampFmPeriodOffset(value) : clampFmSemitone(value);
}

export function fmSemitoneToNormalized(value: number): number {
	const semitone = clampFmSemitone(value);
	return (semitone - AY_FM_SEMITONE_MIN) / (AY_FM_SEMITONE_MAX - AY_FM_SEMITONE_MIN);
}

export function normalizedToFmSemitone(normalized: number): number {
	const clamped = Math.max(0, Math.min(1, normalized));
	return clampFmSemitone(
		Math.round(clamped * (AY_FM_SEMITONE_MAX - AY_FM_SEMITONE_MIN) + AY_FM_SEMITONE_MIN)
	);
}

export function fmPeriodOffsetToNormalized(value: number): number {
	const offset = clampFmPeriodOffset(value);
	return (offset - AY_FM_PERIOD_OFFSET_MIN) / (AY_FM_PERIOD_OFFSET_MAX - AY_FM_PERIOD_OFFSET_MIN);
}

export function normalizedToFmPeriodOffset(normalized: number): number {
	const clamped = Math.max(0, Math.min(1, normalized));
	return clampFmPeriodOffset(
		Math.round(
			clamped * (AY_FM_PERIOD_OFFSET_MAX - AY_FM_PERIOD_OFFSET_MIN) + AY_FM_PERIOD_OFFSET_MIN
		)
	);
}

export function computeFmTonePeriod(
	basePeriod: number,
	waveformStep: number,
	mode: AyFmOffsetMode = 'semitone'
): number {
	const base = Math.max(1, basePeriod);
	if (mode === 'period') {
		const period = (base + clampFmPeriodOffset(waveformStep)) & 0xfff;
		return period === 0 ? 1 : period;
	}
	const factor = Math.pow(2, -clampFmSemitone(waveformStep) / 12);
	const period = Math.round(base * factor) & 0xfff;
	return period === 0 ? 1 : period;
}

export function computeEnvFmEnvelopePeriod(
	basePeriod: number,
	waveformStep: number,
	mode: AyFmOffsetMode = 'semitone'
): number {
	const base = Math.max(1, basePeriod);
	if (mode === 'period') {
		const period = (base + clampFmPeriodOffset(waveformStep)) & 0xffff;
		return period === 0 ? 1 : period;
	}
	const factor = Math.pow(2, -clampFmSemitone(waveformStep) / 12);
	const period = Math.round(base * factor) & 0xffff;
	return period === 0 ? 1 : period;
}

export function normalizeFmWaveform(
	waveform: readonly number[],
	mode: AyFmOffsetMode = 'semitone'
): number[] {
	return waveform
		.map((value) => clampFmWaveformValue(value, mode))
		.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH);
}

function resolvePanelOffsetWaveformSource(
	row: AyTimerRow | undefined,
	field: 'fmWaveform' | 'envFmWaveform'
): number[] | undefined {
	const dedicated = row?.[field];
	if (dedicated?.length) {
		return dedicated;
	}
	if (!row?.sid && !row?.syncbuzzer && row?.timerWaveform?.length) {
		return row.timerWaveform;
	}
	return undefined;
}

export function panelRowFmWaveform(row: AyTimerRow | undefined): number[] {
	const mode = resolveAyFmOffsetMode(row);
	const waveform = resolvePanelOffsetWaveformSource(row, 'fmWaveform');
	if (waveform?.length) {
		return normalizeFmWaveform(waveform, mode);
	}
	return defaultAyFmWaveform(mode);
}

export function panelRowEnvFmWaveform(row: AyTimerRow | undefined): number[] {
	const mode = resolveAyEnvFmOffsetMode(row);
	const waveform = resolvePanelOffsetWaveformSource(row, 'envFmWaveform');
	if (waveform?.length) {
		return normalizeFmWaveform(waveform, mode);
	}
	return defaultAyFmWaveform(mode);
}

export function effectiveRowFmWaveform(row: AyTimerRow | undefined): number[] {
	if (!rowUsesFmWaveform(row)) {
		return [...DEFAULT_AY_FM_WAVEFORM];
	}
	return panelRowFmWaveform(row);
}

export function effectiveRowEnvFmWaveform(row: AyTimerRow | undefined): number[] {
	if (!rowUsesEnvFmWaveform(row)) {
		return [...DEFAULT_AY_FM_WAVEFORM];
	}
	return panelRowEnvFmWaveform(row);
}

export function effectiveRowFmWaveformLoop(row: AyTimerRow | undefined): number {
	if (row?.fmWaveformLoop !== undefined) {
		return row.fmWaveformLoop;
	}
	return row?.timerWaveformLoop ?? 0;
}

export function effectiveRowEnvFmWaveformLoop(row: AyTimerRow | undefined): number {
	if (row?.envFmWaveformLoop !== undefined) {
		return row.envFmWaveformLoop;
	}
	return row?.timerWaveformLoop ?? 0;
}

export function effectiveRowMixTimerWaveform(row: AyTimerRow | undefined): number[] {
	const waveform = row?.timerWaveform;
	if (waveform && waveform.length > 0) {
		return waveform.map((value) => value & 0xf).slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH);
	}
	if (row?.syncbuzzer) {
		return [...DEFAULT_AY_SYNCBUZZER_WAVEFORM];
	}
	return [...DEFAULT_AY_TIMER_WAVEFORM];
}

export function isDefaultFmTimerWaveform(waveform: readonly number[]): boolean {
	return (
		waveform.length === DEFAULT_AY_FM_WAVEFORM.length &&
		waveform.every(
			(value, index) => clampFmSemitone(value) === clampFmSemitone(DEFAULT_AY_FM_WAVEFORM[index]!)
		)
	);
}

export function effectiveRowTimerWaveform(row: AyTimerRow | undefined): number[] {
	return effectiveRowMixTimerWaveform(row);
}

export function effectiveRowTimerWaveformLoop(row: AyTimerRow | undefined): number {
	return row?.timerWaveformLoop ?? 0;
}

export function isClassicSidTimerWaveform(waveform: readonly number[]): boolean {
	return waveform.length === 2 && (waveform[0] & 0xf) === 15 && (waveform[1] & 0xf) === 0;
}

export function isPatternEnvelopeShapeSet(envelopeShape: number): boolean {
	return envelopeShape !== 0 && envelopeShape !== 15;
}

export function isDefaultSidTimerWaveform(waveform: readonly number[]): boolean {
	return (
		waveform.length === DEFAULT_AY_TIMER_WAVEFORM.length &&
		waveform.every((value, index) => (value & 0xf) === (DEFAULT_AY_TIMER_WAVEFORM[index]! & 0xf))
	);
}

export function resolveSyncbuzzerWaveform(
	timerRow: AyTimerRow | undefined,
	patternEnvelopeShape: number
): number[] {
	const steps = effectiveRowTimerWaveform(timerRow).map((value) => value & 0xf);
	if (!isPatternEnvelopeShapeSet(patternEnvelopeShape)) {
		return steps;
	}
	const patternShape = patternEnvelopeShape & 0xf;
	return steps.map((step) => (step === 0 ? patternShape : step));
}

export function rowSupportsSidTimerPwm(row: AyTimerRow | undefined): boolean {
	return !!row?.sid && effectiveRowMixTimerWaveform(row).length === 2;
}

export function rowSupportsSyncbuzzerTimerPwm(row: AyTimerRow | undefined): boolean {
	return !!row?.syncbuzzer && effectiveRowMixTimerWaveform(row).length === 2;
}

export function rowSupportsFmTimerPwm(row: AyTimerRow | undefined): boolean {
	return !!row?.fm && effectiveRowFmWaveform(row).length === 2;
}

export function rowSupportsEnvFmTimerPwm(row: AyTimerRow | undefined): boolean {
	return !!row?.envFm && effectiveRowEnvFmWaveform(row).length === 2;
}

export function rowSupportsTimerPwm(row: AyTimerRow | undefined): boolean {
	return (
		rowSupportsSidTimerPwm(row) ||
		rowSupportsSyncbuzzerTimerPwm(row) ||
		rowSupportsFmTimerPwm(row) ||
		rowSupportsEnvFmTimerPwm(row)
	);
}

export function rowUsesSyncbuzzerPwmDuty(row: AyTimerRow | undefined): boolean {
	return rowSupportsSyncbuzzerTimerPwm(row);
}

export function instrumentSupportsTimerPwm(fields: AyInstrumentFields): boolean {
	const maxTick = Math.max(
		INSTRUMENT_MACRO_MIN_LENGTH,
		...AY_TIMER_MACRO_FIELDS.map((field) => fields.timerMacros[field.id]?.values.length ?? 0)
	);
	for (let tick = 0; tick < maxTick; tick++) {
		const row = sampleTimerRowFromMacros(fields.timerMacros, tick);
		if (
			(row.sid || row.syncbuzzer || rowUsesOffsetWaveform(row)) &&
			rowSupportsTimerPwm(row)
		) {
			return true;
		}
	}
	return false;
}

export function normalizeInstrumentTimerPwmFields(
	source: Partial<Pick<AyInstrumentFields, 'timerPwmDuty' | 'timerPwmSweepMin' | 'timerPwmSweep'>>
): Pick<AyInstrumentFields, 'timerPwmDuty' | 'timerPwmSweepMin' | 'timerPwmSweep'> {
	const timerPwmDuty = clampTimerPwmDuty(source.timerPwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY);
	const timerPwmSweep = clampTimerPwmSweep(source.timerPwmSweep ?? DEFAULT_AY_TIMER_PWM_SWEEP);
	return {
		timerPwmDuty,
		timerPwmSweepMin:
			timerPwmSweep <= 0
				? DEFAULT_AY_TIMER_PWM_SWEEP_MIN
				: clampTimerPwmSweepMin(
						source.timerPwmSweepMin ?? DEFAULT_AY_TIMER_PWM_SWEEP_MIN,
						timerPwmDuty
					),
		timerPwmSweep
	};
}

export function effectiveInstrumentTimerPwmDuty(fields: AyInstrumentFields): number {
	return fields.timerPwmDuty;
}

export function effectiveInstrumentTimerPwmSweep(fields: AyInstrumentFields): number {
	return fields.timerPwmSweep;
}

export function effectiveInstrumentTimerPwmSweepMin(fields: AyInstrumentFields): number {
	return fields.timerPwmSweepMin;
}

export function effectiveRowTimerPwmDuty(
	fields: AyInstrumentFields,
	row: AyTimerRow | undefined
): number {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_DUTY;
	}
	return clampTimerPwmDuty(fields.timerPwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY);
}

export function effectiveRowTimerPwmSweep(
	fields: AyInstrumentFields,
	row: AyTimerRow | undefined
): number {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_SWEEP;
	}
	return clampTimerPwmSweep(fields.timerPwmSweep ?? DEFAULT_AY_TIMER_PWM_SWEEP);
}

export function effectiveRowTimerPwmSweepMin(
	fields: AyInstrumentFields,
	row: AyTimerRow | undefined
): number {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_SWEEP_MIN;
	}
	return clampTimerPwmSweepMin(
		fields.timerPwmSweepMin ?? DEFAULT_AY_TIMER_PWM_SWEEP_MIN,
		fields.timerPwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY
	);
}

export function clampTimerPwmSweepMin(min: number, maxDuty: number): number {
	const clampedMax = clampTimerPwmDuty(maxDuty);
	return Math.max(AY_TIMER_PWM_DUTY_MIN, Math.min(clampedMax, min | 0));
}

export function resolveTimerPwmSweepShape(shape: unknown): AyTimerPwmSweepShape {
	if (typeof shape === 'string' && AY_TIMER_PWM_SWEEP_SHAPES.includes(shape as AyTimerPwmSweepShape)) {
		return shape as AyTimerPwmSweepShape;
	}
	return DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE;
}

export function pwmSweepDutyAtPhase(
	phase: number,
	shape: AyTimerPwmSweepShape,
	minDuty: number,
	maxDuty: number
): number {
	const min = clampTimerPwmSweepMin(minDuty, maxDuty);
	const max = clampTimerPwmDuty(maxDuty);
	if (min >= max) {
		return max;
	}
	const p = clampTimerPwmSweepStartPhase(phase);
	const span = max - min;
	const t = p / AY_TIMER_PWM_SWEEP_START_PHASE_MAX;
	const half = AY_TIMER_PWM_SWEEP_START_PHASE_MAX / 2;

	switch (shape) {
		case 'sine':
			return Math.round(
				min + span * (1 - Math.cos((2 * Math.PI * p) / AY_TIMER_PWM_SWEEP_START_PHASE_MAX)) / 2
			);
		case 'sawUp':
			return Math.round(min + span * t);
		case 'sawDown':
			return Math.round(max - span * t);
		case 'square':
			return p < half ? max : min;
		case 'triangle':
		default:
			if (p <= half) {
				return Math.round(min + span * (p / half));
			}
			return Math.round(max - span * ((p - half) / half));
	}
}

export function advanceTimerPwmSweep(
	currentPhase: number,
	sweepSpeed: number,
	minDuty: number,
	maxDuty: number,
	startPhase = DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE,
	shape: AyTimerPwmSweepShape = DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE
): { phase: number; duty: number } {
	const min = clampTimerPwmSweepMin(minDuty, maxDuty);
	const max = clampTimerPwmDuty(maxDuty);

	if (sweepSpeed <= 0 || min >= max) {
		return { phase: 0, duty: max };
	}

	if (currentPhase < 0) {
		const phase = clampTimerPwmSweepStartPhase(startPhase);
		return {
			phase,
			duty: pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty)
		};
	}

	const modulus = AY_TIMER_PWM_SWEEP_START_PHASE_MAX + 1;
	const nextPhase = (currentPhase + sweepSpeed) % modulus;

	return {
		phase: nextPhase,
		duty: pwmSweepDutyAtPhase(nextPhase, shape, minDuty, maxDuty)
	};
}

export function effectiveRowToneDetune(row: AyTimerRow | undefined): number {
	return row?.semitone ?? DEFAULT_AY_SID_PERIOD_SEMITONE_DETUNE;
}

export function effectiveRowDetune(row: AyTimerRow | undefined): number {
	return row?.detune ?? DEFAULT_AY_SID_PERIOD_DETUNE;
}

export function computeTimerEffectPeriod(tonePeriod: number, timerRow?: AyTimerRow): number {
	if (tonePeriod > 0) {
		const detune = effectiveRowDetune(timerRow) | 0;
		const semitone = effectiveRowToneDetune(timerRow) | 0;
		const transposeFactor = Math.pow(2, -semitone / 12);
		return Math.max(1, (Math.round(tonePeriod * transposeFactor) + detune) & 0xffff || 1);
	}
	return 1;
}

export function computeSidPeriod(tonePeriod: number, timerRow?: AyTimerRow): number {
	return computeTimerEffectPeriod(tonePeriod, timerRow);
}

export function clampTimerPwmDuty(duty: number): number {
	return Math.max(AY_TIMER_PWM_DUTY_MIN, Math.min(AY_TIMER_PWM_DUTY_MAX, duty | 0));
}

export function clampTimerPwmSweep(sweep: number): number {
	return Math.max(0, Math.min(AY_TIMER_PWM_DUTY_MAX, sweep | 0));
}

export function clampTimerPwmSweepStartPhase(phase: number): number {
	return Math.max(
		0,
		Math.min(AY_TIMER_PWM_SWEEP_START_PHASE_MAX, Math.round(phase) | 0)
	);
}

export function resolveTimerPwmSweepStartPhase(
	source: Partial<Pick<AyInstrumentFields, 'timerPwmSweepStartPhase'>> & {
		timerPwmReverseSweep?: boolean;
	}
): number {
	if (source.timerPwmSweepStartPhase !== undefined) {
		return clampTimerPwmSweepStartPhase(source.timerPwmSweepStartPhase);
	}
	if (source.timerPwmReverseSweep === true) {
		return AY_TIMER_PWM_SWEEP_START_PHASE_PEAK;
	}
	return DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE;
}

export function resolveTimerPwmSweepStart(
	startPhase: number,
	minDuty: number,
	maxDuty: number,
	shape: AyTimerPwmSweepShape = DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE
): { phase: number; duty: number } {
	const phase = clampTimerPwmSweepStartPhase(startPhase);
	return {
		phase,
		duty: pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty)
	};
}

export function timerPwmSweepPhaseToPoint(
	startPhase: number,
	minDuty: number,
	maxDuty: number,
	width: number,
	height: number,
	padding: number,
	shape: AyTimerPwmSweepShape = DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE
): { x: number; y: number; duty: number } {
	const min = clampTimerPwmSweepMin(minDuty, maxDuty);
	const max = clampTimerPwmDuty(maxDuty);
	const innerWidth = Math.max(1, width - padding * 2);
	const innerHeight = Math.max(1, height - padding * 2);
	const phase = clampTimerPwmSweepStartPhase(startPhase);
	const duty = pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty);
	const dutySpan = Math.max(1, max - min);
	const y = padding + innerHeight * (1 - (duty - min) / dutySpan);
	const x = padding + innerWidth * (phase / AY_TIMER_PWM_SWEEP_START_PHASE_MAX);
	return { x, y, duty };
}

export function timerPwmSweepPointToPhase(
	x: number,
	width: number,
	padding: number
): number {
	const innerWidth = Math.max(1, width - padding * 2);
	const relX = Math.max(0, Math.min(1, (x - padding) / innerWidth));
	return clampTimerPwmSweepStartPhase(
		Math.round(relX * AY_TIMER_PWM_SWEEP_START_PHASE_MAX)
	);
}

export function buildTimerPwmSweepShapePath(
	shape: AyTimerPwmSweepShape,
	minDuty: number,
	maxDuty: number,
	width: number,
	height: number,
	padding: number,
	segments = 64
): string {
	const min = clampTimerPwmSweepMin(minDuty, maxDuty);
	const max = clampTimerPwmDuty(maxDuty);
	const innerWidth = Math.max(1, width - padding * 2);
	const innerHeight = Math.max(1, height - padding * 2);
	const dutySpan = Math.max(1, max - min);
	const yForDuty = (duty: number) => padding + innerHeight * (1 - (duty - min) / dutySpan);

	const parts: string[] = [];
	for (let index = 0; index <= segments; index++) {
		const phase = Math.round((index / segments) * AY_TIMER_PWM_SWEEP_START_PHASE_MAX);
		const duty = pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty);
		const x = padding + innerWidth * (phase / AY_TIMER_PWM_SWEEP_START_PHASE_MAX);
		const y = yForDuty(duty);
		parts.push(`${index === 0 ? 'M' : 'L'} ${x} ${y}`);
	}
	return parts.join(' ');
}

export function buildTimerPwmSweepShapeFillPath(
	shape: AyTimerPwmSweepShape,
	minDuty: number,
	maxDuty: number,
	width: number,
	height: number,
	padding: number,
	segments = 64
): string {
	const linePath = buildTimerPwmSweepShapePath(shape, minDuty, maxDuty, width, height, padding, segments);
	if (!linePath) {
		return '';
	}
	const innerHeight = Math.max(1, height - padding * 2);
	const baseY = padding + innerHeight;
	const innerWidth = Math.max(1, width - padding * 2);
	const rightX = padding + innerWidth;
	const leftX = padding;
	return `${linePath} L ${rightX} ${baseY} L ${leftX} ${baseY} Z`;
}

export function buildTimerPwmSweepTrianglePath(
	minDuty: number,
	maxDuty: number,
	width: number,
	height: number,
	padding: number
): string {
	return buildTimerPwmSweepShapePath('triangle', minDuty, maxDuty, width, height, padding, 2);
}

export function buildTimerPwmSweepTriangleFillPath(
	minDuty: number,
	maxDuty: number,
	width: number,
	height: number,
	padding: number
): string {
	return buildTimerPwmSweepShapeFillPath('triangle', minDuty, maxDuty, width, height, padding, 2);
}

export function sanitizeTimerPwmPercentInput(
	raw: string,
	max: number,
	maxDigits = AY_TIMER_PWM_PERCENT_MAX_DIGITS
): string {
	const digits = raw.replace(/\D/g, '').slice(0, maxDigits);
	if (digits === '') {
		return '';
	}
	const parsed = Number.parseInt(digits, 10);
	if (!Number.isFinite(parsed)) {
		return '';
	}
	if (parsed > max) {
		return String(max);
	}
	return digits;
}

export function sanitizeTimerPwmSweepInput(
	raw: string,
	max: number,
	asHex: boolean,
	maxDigits = AY_TIMER_PWM_PERCENT_MAX_DIGITS
): string {
	const digits = asHex
		? raw.replace(/[^0-9a-fA-F]/g, '').slice(0, maxDigits)
		: raw.replace(/\D/g, '').slice(0, maxDigits);
	if (digits === '') {
		return '';
	}
	const parsed = asHex ? Number.parseInt(digits, 16) : Number.parseInt(digits, 10);
	if (!Number.isFinite(parsed)) {
		return '';
	}
	if (parsed > max) {
		return asHex ? max.toString(16).toUpperCase() : String(max);
	}
	return asHex ? digits.toUpperCase() : digits;
}

export function computeTimerPwmPeriods(
	basePeriod: number,
	dutyPercent: number
): { highPeriod: number; lowPeriod: number } {
	const duty = clampTimerPwmDuty(dutyPercent) / 100;
	const cyclePeriod = Math.max(2, basePeriod * 2);
	const highPeriod = Math.max(1, Math.round(cyclePeriod * duty));
	const lowPeriod = Math.max(1, Math.round(cyclePeriod * (1 - duty)));
	return { highPeriod, lowPeriod };
}

export function computeTimerPwmLowPeriod(basePeriod: number, dutyPercent: number): number {
	return computeTimerPwmPeriods(basePeriod, dutyPercent).lowPeriod;
}

export function isTimerWaveformLowPhase(stepValue: number): boolean {
	return (stepValue & 0xf) === 0;
}

export function timerPwmStepPeriod(
	stepValue: number,
	highPeriod: number,
	lowPeriod: number
): number {
	return isTimerWaveformLowPhase(stepValue) ? lowPeriod : highPeriod;
}

export function resolveSidSyncbuzzerExclusive(row: AyTimerRow): AyTimerRow {
	if (row.sid && row.syncbuzzer) {
		return { ...row, syncbuzzer: false };
	}
	if (row.sid) {
		return { ...row, syncbuzzer: false };
	}
	if (row.syncbuzzer) {
		return { ...row, sid: false };
	}
	return row;
}

export function resolveExclusiveTimerEffects(row: AyTimerRow): AyTimerRow {
	return resolveSidSyncbuzzerExclusive(row);
}

function normalizeTimerRow(row: LegacyTimerRow | undefined): AyTimerRow {
	const defaults = createDefaultAyTimerRow();
	const fm = row?.fm ?? defaults.fm ?? false;
	const envFm = row?.envFm ?? defaults.envFm ?? false;
	const fmOffsetMode = resolveAyFmOffsetMode(row);
	const envFmOffsetMode = resolveAyEnvFmOffsetMode(row);
	const sid = row?.sid ?? defaults.sid;
	const syncbuzzer = row?.syncbuzzer ?? defaults.syncbuzzer;
	const legacySharedWaveform = row?.timerWaveform?.length ? [...row.timerWaveform] : undefined;
	const hasDedicatedFmWaveform = !!(row?.fmWaveform && row.fmWaveform.length > 0);
	const hasDedicatedEnvFmWaveform = !!(row?.envFmWaveform && row.envFmWaveform.length > 0);
	const legacyForOffsetEffects =
		legacySharedWaveform && !sid && !syncbuzzer ? legacySharedWaveform : undefined;
	const fmWaveform = hasDedicatedFmWaveform
		? normalizeFmWaveform(row!.fmWaveform!, fmOffsetMode)
		: fm && legacyForOffsetEffects
			? normalizeFmWaveform(legacyForOffsetEffects, fmOffsetMode)
			: defaultAyFmWaveform(fmOffsetMode);
	const envFmWaveform = hasDedicatedEnvFmWaveform
		? normalizeFmWaveform(row!.envFmWaveform!, envFmOffsetMode)
		: envFm && legacyForOffsetEffects
			? normalizeFmWaveform(legacyForOffsetEffects, envFmOffsetMode)
			: defaultAyFmWaveform(envFmOffsetMode);
	const timerWaveform =
		legacySharedWaveform && (sid || syncbuzzer || (!fm && !envFm))
			? legacySharedWaveform.map((value) => value & 0xf).slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
			: sid || syncbuzzer
				? legacySharedWaveform?.map((value) => value & 0xf).slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH) ??
					(syncbuzzer ? [...DEFAULT_AY_SYNCBUZZER_WAVEFORM] : [...DEFAULT_AY_TIMER_WAVEFORM])
				: [...DEFAULT_AY_TIMER_WAVEFORM];
	const normalized: AyTimerRow = {
		sid,
		syncbuzzer,
		fm,
		envFm,
		fmOffsetMode,
		envFmOffsetMode,
		timerWaveform,
		timerWaveformLoop: row?.timerWaveformLoop ?? defaults.timerWaveformLoop!,
		fmWaveform,
		fmWaveformLoop: row?.fmWaveformLoop ?? row?.timerWaveformLoop ?? defaults.fmWaveformLoop!,
		envFmWaveform,
		envFmWaveformLoop:
			row?.envFmWaveformLoop ?? row?.fmWaveformLoop ?? row?.timerWaveformLoop ?? defaults.envFmWaveformLoop!
	};
	if (row?.detune !== undefined) {
		normalized.detune = row.detune;
	}
	if (row?.semitone !== undefined) {
		normalized.semitone = row.semitone;
	}
	if (fmOffsetMode === 'period') {
		normalized.fmOffsetMode = 'period';
	}
	return resolveExclusiveTimerEffects(normalized);
}

function resolveInstrumentTimerPwmFields(
	extended: ExtendedInstrument,
	sourceRows: LegacyTimerRow[]
): Pick<AyInstrumentFields, 'timerPwmDuty' | 'timerPwmSweepMin' | 'timerPwmSweep'> {
	if (
		extended.timerPwmDuty !== undefined ||
		extended.timerPwmSweepMin !== undefined ||
		extended.timerPwmSweep !== undefined
	) {
		return normalizeInstrumentTimerPwmFields(extended);
	}

	const legacyRow = sourceRows.find(
		(row) =>
			row?.timerPwmDuty !== undefined ||
			row?.timerPwmSweepMin !== undefined ||
			row?.timerPwmSweep !== undefined
	);
	if (legacyRow) {
		return normalizeInstrumentTimerPwmFields(legacyRow);
	}

	return createDefaultInstrumentTimerPwmFields();
}

export function sampleTimerRowFromMacros(
	timerMacros: InstrumentMacros,
	tick: number
): AyTimerRow {
	const row = sampleInstrumentRowFromMacros(timerMacros, tick, AY_TIMER_MACRO_FIELDS);
	return resolveExclusiveTimerEffects(normalizeTimerRow(row as LegacyTimerRow | undefined));
}

export function sampleTimerRowFromInstrument(instrument: Instrument, tick: number): AyTimerRow {
	const extended = instrument as ExtendedInstrument;
	return sampleTimerRowFromMacros(
		resolveTimerInstrumentMacros(extended, AY_TIMER_MACRO_FIELDS),
		tick
	);
}

export function normalizeLegacyTimerRow(row: Record<string, unknown> | undefined): AyTimerRow {
	return normalizeTimerRow(row as LegacyTimerRow | undefined);
}

export function normalizeAyInstrumentFields(instrument: Instrument): AyInstrumentFields {
	const extended = instrument as ExtendedInstrument;
	return {
		timerMacros: resolveTimerInstrumentMacros(extended, AY_TIMER_MACRO_FIELDS),
		...resolveInstrumentTimerPwmFields(extended, []),
		timerPwmPreserveOnNewNote: extended.timerPwmPreserveOnNewNote === true,
		timerPwmSweepStartPhase: resolveTimerPwmSweepStartPhase(extended),
		timerPwmSweepShape: resolveTimerPwmSweepShape(extended.timerPwmSweepShape)
	};
}

export function formatAyTimerWaveform(waveform: readonly number[], asHex: boolean): string {
	return waveform
		.map((value) => (asHex ? (value & 0xf).toString(16).toUpperCase() : String(value & 0xf)))
		.join(' ');
}

export function formatAyFmWaveform(
	waveform: readonly number[],
	asHex: boolean,
	mode: AyFmOffsetMode = 'semitone'
): string {
	return waveform
		.map((value) => {
			const clamped = clampFmWaveformValue(value, mode);
			if (asHex) {
				const sign = clamped < 0 ? '-' : '';
				return sign + Math.abs(clamped).toString(16).toUpperCase();
			}
			return String(clamped);
		})
		.join(' ');
}

export function isIncompleteSignedNumericToken(part: string): boolean {
	return part === '-' || part === '+' || /^-0+$/.test(part);
}

function parseFmWaveformToken(part: string, asHex: boolean): number | null {
	if (isIncompleteSignedNumericToken(part)) {
		return null;
	}
	if (asHex) {
		let sign = 1;
		let temp = part;
		if (temp.startsWith('-')) {
			sign = -1;
			temp = temp.substring(1);
		}
		if (temp.length === 0 || (sign < 0 && /^0+$/.test(temp))) {
			return null;
		}
		if (!/^[0-9a-fA-F]+$/.test(temp)) {
			return null;
		}
		return sign * parseInt(temp, 16);
	}
	if (!/^-?\d+$/.test(part)) {
		return null;
	}
	return parseInt(part, 10);
}

export function parseAyFmWaveformPartial(
	text: string,
	asHex: boolean,
	mode: AyFmOffsetMode = 'semitone'
): number[] | null {
	if (!text.trim()) {
		return null;
	}
	const min = mode === 'period' ? AY_FM_PERIOD_OFFSET_MIN : AY_FM_SEMITONE_MIN;
	const max = mode === 'period' ? AY_FM_PERIOD_OFFSET_MAX : AY_FM_SEMITONE_MAX;
	const parts = text.trimEnd().split(/\s+/).filter((part) => part.length > 0);
	const values: number[] = [];
	for (const part of parts) {
		const parsed = parseFmWaveformToken(part, asHex);
		if (parsed === null || parsed < min || parsed > max) {
			break;
		}
		values.push(parsed);
		if (values.length >= AY_TIMER_WAVEFORM_MAX_LENGTH) {
			break;
		}
	}
	return values.length > 0 ? values : null;
}

export function parseAyFmWaveform(
	text: string,
	asHex: boolean,
	mode: AyFmOffsetMode = 'semitone'
): number[] | null {
	const values = parseAyFmWaveformPartial(text, asHex, mode);
	if (!values) {
		return null;
	}
	const trimmed = text.trim();
	if (!trimmed) {
		return null;
	}
	const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
	if (parts.length !== values.length) {
		return null;
	}
	for (let index = 0; index < parts.length; index++) {
		const parsed = parseFmWaveformToken(parts[index], asHex);
		if (parsed === null || parsed !== values[index]) {
			return null;
		}
	}
	return values;
}

function parseWaveformToken(part: string, asHex: boolean): number | null {
	if (asHex) {
		if (!/^[0-9a-fA-F]+$/.test(part)) {
			return null;
		}
		return parseInt(part, 16);
	}
	if (!/^\d+$/.test(part)) {
		return null;
	}
	return parseInt(part, 10);
}

export function parseAyTimerWaveformPartial(text: string, asHex: boolean): number[] | null {
	if (!text.trim()) {
		return null;
	}
	const parts = text.trimEnd().split(/\s+/).filter((part) => part.length > 0);
	const values: number[] = [];
	for (const part of parts) {
		const parsed = parseWaveformToken(part, asHex);
		if (parsed === null || parsed < 0 || parsed > 15) {
			break;
		}
		values.push(parsed);
		if (values.length >= AY_TIMER_WAVEFORM_MAX_LENGTH) {
			break;
		}
	}
	return values.length > 0 ? values : null;
}

export function parseAyTimerWaveform(text: string, asHex: boolean): number[] | null {
	const values = parseAyTimerWaveformPartial(text, asHex);
	if (!values) {
		return null;
	}
	const trimmed = text.trim();
	if (!trimmed) {
		return null;
	}
	const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
	if (parts.length !== values.length) {
		return null;
	}
	for (let index = 0; index < parts.length; index++) {
		const parsed = parseWaveformToken(parts[index], asHex);
		if (parsed === null || parsed !== values[index]) {
			return null;
		}
	}
	return values;
}

export function copyAyInstrumentFields(
	source: Instrument & Partial<AyInstrumentFields>,
	target: Instrument & Partial<AyInstrumentFields>
): void {
	const normalized = normalizeAyInstrumentFields(source as Instrument);
	if (source.macros) {
		target.macros = Object.fromEntries(
			Object.entries(source.macros).map(([id, macro]) => [
				id,
				{ values: [...macro.values], loop: macro.loop }
			])
		);
	}
	const sourceExtended = source as ExtendedInstrument;
	if (sourceExtended.timerMacros) {
		(target as ExtendedInstrument).timerMacros = Object.fromEntries(
			Object.entries(sourceExtended.timerMacros).map(([id, macro]) => [
				id,
				{ values: [...macro.values], loop: macro.loop }
			])
		);
	}
	target.timerPwmDuty = normalized.timerPwmDuty;
	target.timerPwmSweepMin = normalized.timerPwmSweepMin;
	target.timerPwmSweep = normalized.timerPwmSweep;
	target.timerPwmPreserveOnNewNote = normalized.timerPwmPreserveOnNewNote;
	target.timerPwmSweepStartPhase = normalized.timerPwmSweepStartPhase;
	target.timerPwmSweepShape = normalized.timerPwmSweepShape;
	delete (target as unknown as Record<string, unknown>).timerPwmReverseSweep;
	copyInstrumentSampleFields(source, target);
}
