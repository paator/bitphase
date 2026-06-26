export const DEFAULT_AY_SID_PERIOD = 100;
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
];
export const DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE = 'triangle';
export const AY_TONE_REGISTER_PRESCALER = 16;
export const AY_AUTO_TIMER_TONE_MULTIPLIER = 16;

export function resolveAyTimerRowSidPeriodMode(row) {
	return row?.sidPeriodMode === 'manual' ? 'manual' : 'auto';
}

export function effectiveRowToneDetune(row) {
	return row?.semitone ?? DEFAULT_AY_SID_PERIOD_SEMITONE_DETUNE;
}

export function effectiveRowDetune(row) {
	return row?.detune ?? DEFAULT_AY_SID_PERIOD_DETUNE;
}

export function effectiveRowPeriod(row) {
	return Math.max(1, (row?.period ?? DEFAULT_AY_SID_PERIOD) & 0xffff);
}

export function computeTimerEffectPeriod(tonePeriod, timerRow) {
	if (resolveAyTimerRowSidPeriodMode(timerRow) === 'manual') {
		return effectiveRowPeriod(timerRow);
	}
	if (tonePeriod > 0) {
		const detune = effectiveRowDetune(timerRow) | 0;
		const semitone = effectiveRowToneDetune(timerRow) | 0;
		const transposeFactor = Math.pow(2, -semitone / 12);
		return Math.max(1, (Math.round(tonePeriod * transposeFactor) + detune) & 0xffff || 1);
	}
	return effectiveRowPeriod(timerRow);
}

export function computeSidPeriod(tonePeriod, timerRow) {
	return computeTimerEffectPeriod(tonePeriod, timerRow);
}

export function computeFmTonePeriod(basePeriod, waveformStep, mode = 'semitone') {
	const base = Math.max(1, basePeriod);
	if (mode === 'period') {
		const period = (base + clampFmPeriodOffset(waveformStep)) & 0xfff;
		return period === 0 ? 1 : period;
	}
	const factor = Math.pow(2, -clampFmSemitone(waveformStep) / 12);
	const period = Math.round(base * factor) & 0xfff;
	return period === 0 ? 1 : period;
}

export function computeEnvFmEnvelopePeriod(basePeriod, waveformStep, mode = 'semitone') {
	const base = Math.max(1, basePeriod);
	if (mode === 'period') {
		const period = (base + clampFmPeriodOffset(waveformStep)) & 0xffff;
		return period === 0 ? 1 : period;
	}
	const factor = Math.pow(2, -clampFmSemitone(waveformStep) / 12);
	const period = Math.round(base * factor) & 0xffff;
	return period === 0 ? 1 : period;
}

export function clampTimerPwmDuty(duty) {
	return Math.max(AY_TIMER_PWM_DUTY_MIN, Math.min(AY_TIMER_PWM_DUTY_MAX, duty | 0));
}

export function clampTimerPwmSweep(sweep) {
	return Math.max(0, Math.min(AY_TIMER_PWM_DUTY_MAX, sweep | 0));
}

export function clampTimerPwmSweepStartPhase(phase) {
	return Math.max(
		0,
		Math.min(AY_TIMER_PWM_SWEEP_START_PHASE_MAX, Math.round(phase) | 0)
	);
}

export function resolveTimerPwmSweepStartPhase(source) {
	if (source.timerPwmSweepStartPhase !== undefined) {
		return clampTimerPwmSweepStartPhase(source.timerPwmSweepStartPhase);
	}
	if (source.timerPwmReverseSweep === true) {
		return AY_TIMER_PWM_SWEEP_START_PHASE_PEAK;
	}
	return DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE;
}

export function resolveTimerPwmSweepShape(shape) {
	if (typeof shape === 'string' && AY_TIMER_PWM_SWEEP_SHAPES.includes(shape)) {
		return shape;
	}
	return DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE;
}

export function pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty) {
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

export function resolveTimerPwmSweepStart(
	startPhase,
	minDuty,
	maxDuty,
	shape = DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE
) {
	const phase = clampTimerPwmSweepStartPhase(startPhase);
	return {
		phase,
		duty: pwmSweepDutyAtPhase(phase, shape, minDuty, maxDuty)
	};
}

export function computeTimerPwmPeriods(basePeriod, dutyPercent) {
	const duty = clampTimerPwmDuty(dutyPercent) / 100;
	const cyclePeriod = Math.max(2, basePeriod * 2);
	const highPeriod = Math.max(1, Math.round(cyclePeriod * duty));
	const lowPeriod = Math.max(1, Math.round(cyclePeriod * (1 - duty)));
	return { highPeriod, lowPeriod };
}

export function computeTimerPwmLowPeriod(basePeriod, dutyPercent) {
	return computeTimerPwmPeriods(basePeriod, dutyPercent).lowPeriod;
}

export function effectiveRowTimerWaveform(row) {
	return effectiveRowMixTimerWaveform(row);
}

export function effectiveRowMixTimerWaveform(row) {
	const waveform = row?.timerWaveform;
	if (waveform && waveform.length > 0) {
		return waveform.map((value) => value & 0xf).slice(0, 32);
	}
	if (row?.syncbuzzer) {
		return [...DEFAULT_AY_SYNCBUZZER_WAVEFORM];
	}
	return [...DEFAULT_AY_TIMER_WAVEFORM];
}

export function effectiveRowTimerWaveformLoop(row) {
	return row?.timerWaveformLoop ?? 0;
}

export function effectiveRowFmWaveformLoop(row) {
	if (row?.fmWaveformLoop !== undefined) {
		return row.fmWaveformLoop;
	}
	return row?.timerWaveformLoop ?? 0;
}

export function resolveAyFmOffsetMode(row) {
	return row?.fmOffsetMode === 'period' ? 'period' : 'semitone';
}

export function defaultAyFmWaveform(mode) {
	return mode === 'period' ? [...DEFAULT_AY_FM_PERIOD_WAVEFORM] : [...DEFAULT_AY_FM_WAVEFORM];
}

export function clampFmSemitone(value) {
	return Math.max(AY_FM_SEMITONE_MIN, Math.min(AY_FM_SEMITONE_MAX, value | 0));
}

export function clampFmPeriodOffset(value) {
	return Math.max(AY_FM_PERIOD_OFFSET_MIN, Math.min(AY_FM_PERIOD_OFFSET_MAX, value | 0));
}

export function clampFmWaveformValue(value, mode) {
	return mode === 'period' ? clampFmPeriodOffset(value) : clampFmSemitone(value);
}

export function normalizeFmWaveform(waveform, mode = 'semitone') {
	return waveform.map((value) => clampFmWaveformValue(value, mode)).slice(0, 32);
}

export function rowUsesFmWaveform(row) {
	return !!row?.fm;
}

export function rowUsesEnvFmWaveform(row) {
	return !!row?.envFm;
}

export function rowUsesOffsetWaveform(row) {
	return rowUsesFmWaveform(row) || rowUsesEnvFmWaveform(row);
}

export function effectiveRowFmWaveform(row) {
	if (!rowUsesFmWaveform(row)) {
		return [...DEFAULT_AY_FM_WAVEFORM];
	}
	const mode = resolveAyFmOffsetMode(row);
	const waveform = row?.fmWaveform?.length
		? row.fmWaveform
		: !row?.sid && !row?.syncbuzzer && row?.timerWaveform?.length
			? row.timerWaveform
			: undefined;
	if (waveform && waveform.length > 0) {
		return normalizeFmWaveform(waveform, mode);
	}
	return defaultAyFmWaveform(mode);
}

export function effectiveRowEnvFmWaveform(row) {
	if (!rowUsesEnvFmWaveform(row)) {
		return [...DEFAULT_AY_FM_WAVEFORM];
	}
	const mode = resolveAyFmOffsetMode(row);
	const waveform = row?.envFmWaveform?.length
		? row.envFmWaveform
		: !row?.sid && !row?.syncbuzzer && row?.timerWaveform?.length
			? row.timerWaveform
			: undefined;
	if (waveform && waveform.length > 0) {
		return normalizeFmWaveform(waveform, mode);
	}
	return defaultAyFmWaveform(mode);
}

export function effectiveRowEnvFmWaveformLoop(row) {
	if (row?.envFmWaveformLoop !== undefined) {
		return row.envFmWaveformLoop;
	}
	return row?.timerWaveformLoop ?? 0;
}

export function isDefaultFmTimerWaveform(waveform) {
	return (
		waveform.length === DEFAULT_AY_FM_WAVEFORM.length &&
		waveform.every(
			(value, index) => clampFmSemitone(value) === clampFmSemitone(DEFAULT_AY_FM_WAVEFORM[index])
		)
	);
}

export function isDefaultSidTimerWaveform(waveform) {
	return (
		waveform.length === DEFAULT_AY_TIMER_WAVEFORM.length &&
		waveform.every((value, index) => (value & 0xf) === (DEFAULT_AY_TIMER_WAVEFORM[index] & 0xf))
	);
}

export function isClassicSidTimerWaveform(waveform) {
	return waveform.length === 2 && (waveform[0] & 0xf) === 15 && (waveform[1] & 0xf) === 0;
}

export function isPatternEnvelopeShapeSet(envelopeShape) {
	return envelopeShape !== 0 && envelopeShape !== 15;
}

export function resolveSyncbuzzerWaveform(timerRow, patternEnvelopeShape) {
	const steps = effectiveRowTimerWaveform(timerRow).map((value) => value & 0xf);
	if (!isPatternEnvelopeShapeSet(patternEnvelopeShape)) {
		return steps;
	}
	const patternShape = patternEnvelopeShape & 0xf;
	return steps.map((step) => (step === 0 ? patternShape : step));
}

export function rowSupportsSidTimerPwm(row) {
	return !!row?.sid && effectiveRowMixTimerWaveform(row).length === 2;
}

export function rowSupportsSyncbuzzerTimerPwm(row) {
	return !!row?.syncbuzzer && effectiveRowMixTimerWaveform(row).length === 2;
}

export function rowSupportsFmTimerPwm(row) {
	return !!row?.fm && effectiveRowFmWaveform(row).length === 2;
}

export function rowSupportsEnvFmTimerPwm(row) {
	return !!row?.envFm && effectiveRowEnvFmWaveform(row).length === 2;
}

export function rowSupportsTimerPwm(row) {
	return (
		rowSupportsSidTimerPwm(row) ||
		rowSupportsSyncbuzzerTimerPwm(row) ||
		rowSupportsFmTimerPwm(row) ||
		rowSupportsEnvFmTimerPwm(row)
	);
}

export function rowUsesSyncbuzzerPwmDuty(row) {
	return rowSupportsSyncbuzzerTimerPwm(row);
}

export function effectiveRowTimerPwmDuty(fields, row) {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_DUTY;
	}
	return clampTimerPwmDuty(fields.timerPwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY);
}

export function effectiveRowTimerPwmSweep(fields, row) {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_SWEEP;
	}
	return clampTimerPwmSweep(fields.timerPwmSweep ?? DEFAULT_AY_TIMER_PWM_SWEEP);
}

export function effectiveRowTimerPwmSweepMin(fields, row) {
	if (!rowSupportsTimerPwm(row)) {
		return DEFAULT_AY_TIMER_PWM_SWEEP_MIN;
	}
	return clampTimerPwmSweepMin(
		fields.timerPwmSweepMin ?? DEFAULT_AY_TIMER_PWM_SWEEP_MIN,
		fields.timerPwmDuty ?? DEFAULT_AY_TIMER_PWM_DUTY
	);
}

export function clampTimerPwmSweepMin(min, maxDuty) {
	const clampedMax = clampTimerPwmDuty(maxDuty);
	return Math.max(AY_TIMER_PWM_DUTY_MIN, Math.min(clampedMax, min | 0));
}

export function advanceTimerPwmSweep(
	currentPhase,
	sweepSpeed,
	minDuty,
	maxDuty,
	startPhase = DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE,
	shape = DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE
) {
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

function createDefaultInstrumentTimerPwmFields() {
	return {
		timerPwmDuty: DEFAULT_AY_TIMER_PWM_DUTY,
		timerPwmSweepMin: DEFAULT_AY_TIMER_PWM_SWEEP_MIN,
		timerPwmSweep: DEFAULT_AY_TIMER_PWM_SWEEP
	};
}

function normalizeInstrumentTimerPwmFields(source) {
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

function createDefaultAyTimerRow() {
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

function resolveSidSyncbuzzerExclusive(row) {
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

function normalizeTimerRow(row) {
	const defaults = createDefaultAyTimerRow();
	const fm = row?.fm ?? defaults.fm;
	const envFm = row?.envFm ?? defaults.envFm;
	const fmOffsetMode = resolveAyFmOffsetMode(row);
	const sid = row?.sid ?? defaults.sid;
	const syncbuzzer = row?.syncbuzzer ?? defaults.syncbuzzer;
	const legacySharedWaveform = row?.timerWaveform?.length ? [...row.timerWaveform] : undefined;
	const hasDedicatedFmWaveform = !!(row?.fmWaveform && row.fmWaveform.length > 0);
	const hasDedicatedEnvFmWaveform = !!(row?.envFmWaveform && row.envFmWaveform.length > 0);
	const legacyForOffsetEffects =
		legacySharedWaveform && !sid && !syncbuzzer ? legacySharedWaveform : undefined;
	const fmWaveform = hasDedicatedFmWaveform
		? normalizeFmWaveform(row.fmWaveform, fmOffsetMode)
		: fm && legacyForOffsetEffects
			? normalizeFmWaveform(legacyForOffsetEffects, fmOffsetMode)
			: defaultAyFmWaveform(fmOffsetMode);
	const envFmWaveform = hasDedicatedEnvFmWaveform
		? normalizeFmWaveform(row.envFmWaveform, fmOffsetMode)
		: envFm && legacyForOffsetEffects
			? normalizeFmWaveform(legacyForOffsetEffects, fmOffsetMode)
			: defaultAyFmWaveform(fmOffsetMode);
	const timerWaveform =
		legacySharedWaveform && (sid || syncbuzzer || (!fm && !envFm))
			? legacySharedWaveform.map((value) => value & 0xf).slice(0, 32)
			: sid || syncbuzzer
				? legacySharedWaveform?.map((value) => value & 0xf).slice(0, 32) ??
					(syncbuzzer ? [...DEFAULT_AY_SYNCBUZZER_WAVEFORM] : [...DEFAULT_AY_TIMER_WAVEFORM])
				: [...DEFAULT_AY_TIMER_WAVEFORM];
	const normalized = {
		sid,
		syncbuzzer,
		fm,
		envFm,
		fmOffsetMode,
		sidPeriodMode:
			row?.sidPeriodMode === 'auto' || row?.sidPeriodMode === 'manual'
				? row.sidPeriodMode
				: 'auto',
		timerWaveform,
		timerWaveformLoop: row?.timerWaveformLoop ?? defaults.timerWaveformLoop,
		fmWaveform,
		fmWaveformLoop: row?.fmWaveformLoop ?? row?.timerWaveformLoop ?? defaults.fmWaveformLoop,
		envFmWaveform,
		envFmWaveformLoop:
			row?.envFmWaveformLoop ?? row?.fmWaveformLoop ?? row?.timerWaveformLoop ?? defaults.envFmWaveformLoop
	};
	if (row?.detune !== undefined) {
		normalized.detune = row.detune;
	}
	if (row?.semitone !== undefined) {
		normalized.semitone = row.semitone;
	}
	if (row?.period !== undefined) {
		normalized.period = Math.max(1, row.period & 0xffff);
	}
	if (fmOffsetMode === 'period') {
		normalized.fmOffsetMode = 'period';
	}
	return resolveSidSyncbuzzerExclusive(normalized);
}

function applyExclusiveTimerEffects(row) {
	return resolveSidSyncbuzzerExclusive(row);
}

function resolveInstrumentTimerPwmFields(instrument, sourceRows) {
	if (
		instrument.timerPwmDuty !== undefined ||
		instrument.timerPwmSweepMin !== undefined ||
		instrument.timerPwmSweep !== undefined
	) {
		return normalizeInstrumentTimerPwmFields(instrument);
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

export function normalizeAyInstrumentFields(instrument) {
	const rowCount =
		instrument.timerRows?.length > 0
			? instrument.timerRows.length
			: Math.max(instrument.rows?.length ?? 0, 1);
	const sourceRows = instrument.timerRows ?? [];
	const timerRows = Array.from({ length: rowCount }, (_, index) =>
		normalizeTimerRow(sourceRows[index])
	);
	const timerLoop =
		instrument.timerLoop !== undefined ? instrument.timerLoop : (instrument.loop ?? 0);

	return {
		timerRows,
		timerLoop,
		...resolveInstrumentTimerPwmFields(instrument, sourceRows),
		timerPwmPreserveOnNewNote: instrument.timerPwmPreserveOnNewNote === true,
		timerPwmSweepStartPhase: resolveTimerPwmSweepStartPhase(instrument),
		timerPwmSweepShape: resolveTimerPwmSweepShape(instrument.timerPwmSweepShape)
	};
}

export function getAySidBaseVolume(finalVolume) {
	return finalVolume & 0x0f;
}
