import { describe, it, expect } from 'vitest';
import * as ts from '@/lib/chips/ay/instrument';
import * as jsModule from '../../public/ay/ay-instrument-utils.js';

const js = jsModule as unknown as Record<string, (...args: never[]) => unknown> &
	Record<string, unknown>;

type InstrumentInput = Parameters<typeof ts.normalizeAyInstrumentFields>[0];

const DUTY_INPUTS = [-10, -1, 0, 1, 5, 10, 24, 25, 26, 49, 50, 51, 75, 99, 100, 101, 150, 3.7, 49.9];
const PERIOD_INPUTS = [0, 1, 2, 3, 10, 100, 249, 333, 1000, 4095, 65535];
const SWEEP_INPUTS = [-5, 0, 1, 2, 3, 7, 50, 100];
const SWEEP_SHAPES = ['triangle', 'sine', 'sawUp', 'sawDown', 'square'] as const;
const CURRENT_PHASES = [-1, 0, 1, 5, 250, 500, 750, 1000];

const SHARED_CONSTANTS = [
	'DEFAULT_AY_SID_PERIOD_DETUNE',
	'DEFAULT_AY_SID_PERIOD_SEMITONE_DETUNE',
	'DEFAULT_AY_TIMER_WAVEFORM',
	'DEFAULT_AY_SYNCBUZZER_WAVEFORM',
	'DEFAULT_AY_FM_WAVEFORM',
	'DEFAULT_AY_FM_PERIOD_WAVEFORM',
	'AY_FM_SEMITONE_MIN',
	'AY_FM_SEMITONE_MAX',
	'AY_FM_PERIOD_OFFSET_MIN',
	'AY_FM_PERIOD_OFFSET_MAX',
	'AY_TIMER_PWM_DUTY_MIN',
	'AY_TIMER_PWM_DUTY_MAX',
	'DEFAULT_AY_TIMER_PWM_DUTY',
	'DEFAULT_AY_TIMER_PWM_SWEEP_MIN',
	'DEFAULT_AY_TIMER_PWM_SWEEP',
	'TIMER_PWM_SWEEP_UNINITIALIZED',
	'AY_TIMER_PWM_SWEEP_START_PHASE_MAX',
	'DEFAULT_AY_TIMER_PWM_SWEEP_START_PHASE',
	'AY_TIMER_PWM_SWEEP_START_PHASE_PEAK',
	'DEFAULT_AY_TIMER_PWM_SWEEP_SHAPE',
	'AY_TONE_REGISTER_PRESCALER',
	'AY_AUTO_TIMER_TONE_MULTIPLIER'
] as const;

const ROW_CASES: Array<Record<string, unknown> | undefined> = [
	undefined,
	{},
	{ sid: true, timerWaveform: [15, 0] },
	{ sid: true, timerWaveform: [15, 8, 0] },
	{ sid: true, timerWaveform: [] },
	{ syncbuzzer: true, timerWaveform: [15, 0] },
	{ sid: true, syncbuzzer: true, timerWaveform: [15, 0] },
	{ sid: true, timerWaveform: [14, 0] },
	{ sid: true, timerWaveform: [15, 0, 0] },
	{ fm: true, timerWaveform: [0, 12] },
	{ fm: true, timerWaveform: [0, 1, 0, -1] },
	{ fm: true, fmOffsetMode: 'period', timerWaveform: [0, 16] },
	{ fm: true, fmOffsetMode: 'period', timerWaveform: [-100, 200] },
	{ envFm: true, timerWaveform: [0, 12] },
	{ envFm: true, timerWaveform: [0, 1, 0, -1] },
	{ envFm: true, fmOffsetMode: 'period', timerWaveform: [0, 16] },
	{ envFm: true, fmOffsetMode: 'period', timerWaveform: [-100, 200] },
	{ fm: true, envFm: true, timerWaveform: [0, 12] }
];

const FIELD_CASES = [
	{ timerPwmDuty: 50, timerPwmSweepMin: 0, timerPwmSweep: 0, timerRows: [] },
	{ timerPwmDuty: 25, timerPwmSweepMin: 5, timerPwmSweep: 3, timerRows: [] },
	{ timerPwmDuty: 75, timerPwmSweepMin: -3, timerPwmSweep: -1, timerRows: [] },
	{ timerPwmDuty: undefined, timerPwmSweepMin: undefined, timerPwmSweep: undefined, timerRows: [] }
];

const INSTRUMENT_CASES: InstrumentInput[] = [
	{ id: '01', rows: [{}] } as unknown as InstrumentInput,
	{
		id: '02',
		rows: [{}, {}],
		timerRows: [
			{ sid: true, timerWaveform: [15, 0] },
			{ syncbuzzer: true }
		],
		timerPwmDuty: 25,
		timerPwmSweepMin: 8,
		timerPwmSweep: 4,
		timerPwmPreserveOnNewNote: true,
		timerPwmSweepStartPhase: 500
	} as unknown as InstrumentInput,
	{
		id: '03',
		rows: [{}],
		timerRows: [{ sid: true, timerPwmDuty: 33, timerPwmSweepMin: 9, timerPwmSweep: 2 }]
	} as unknown as InstrumentInput,
	{
		id: '04',
		rows: [{}, {}, {}],
		timerRows: [{ sid: true, timerWaveform: [15, 0] }]
	} as unknown as InstrumentInput,
	{
		id: '05',
		rows: [{}],
		timerRows: [
			{
				sid: true,
				timerWaveform: Array.from({ length: 40 }, (_, i) => (i % 16) + (i < 20 ? 8 : 0)),
				timerWaveformLoop: 3,
				detune: 12,
				semitone: -3,
				period: 0x12345
			}
		],
		timerPwmDuty: 200,
		timerPwmSweep: 999,
		timerPwmSweepMin: 999
	} as unknown as InstrumentInput,
	{
		id: '06',
		rows: [{}, {}],
		timerRows: [{ sid: true, syncbuzzer: true, timerWaveform: [15, 0] }, {}]
	} as unknown as InstrumentInput
];

describe('ay-instrument-utils TS/JS parity', () => {
	it('exposes identical shared constants', () => {
		for (const key of SHARED_CONSTANTS) {
			expect(js[key], key).toEqual((ts as Record<string, unknown>)[key]);
		}
	});

	it('clampTimerPwmDuty matches', () => {
		for (const duty of DUTY_INPUTS) {
			expect(js.clampTimerPwmDuty(duty as never), `duty=${duty}`).toBe(
				ts.clampTimerPwmDuty(duty)
			);
		}
	});

	it('computeTimerPwmPeriods and computeTimerPwmLowPeriod match', () => {
		for (const basePeriod of PERIOD_INPUTS) {
			for (const duty of DUTY_INPUTS) {
				const label = `base=${basePeriod} duty=${duty}`;
				expect(js.computeTimerPwmPeriods(basePeriod as never, duty as never), label).toEqual(
					ts.computeTimerPwmPeriods(basePeriod, duty)
				);
				expect(js.computeTimerPwmLowPeriod(basePeriod as never, duty as never), label).toBe(
					ts.computeTimerPwmLowPeriod(basePeriod, duty)
				);
			}
		}
	});

	it('computeFmTonePeriod and computeEnvFmEnvelopePeriod match', () => {
		const steps = [0, 7, 12, -16, 16];
		for (const base of [100, 500, 1000]) {
			for (const step of steps) {
				for (const mode of ['semitone', 'period'] as const) {
					const label = `base=${base} step=${step} mode=${mode}`;
					expect(js.computeFmTonePeriod(base as never, step as never, mode as never), label).toBe(
						ts.computeFmTonePeriod(base, step, mode)
					);
					expect(
						js.computeEnvFmEnvelopePeriod(base as never, step as never, mode as never),
						label
					).toBe(ts.computeEnvFmEnvelopePeriod(base, step, mode));
				}
			}
		}
	});

	it('clampTimerPwmSweepMin matches', () => {
		for (const min of DUTY_INPUTS) {
			for (const max of DUTY_INPUTS) {
				expect(js.clampTimerPwmSweepMin(min as never, max as never), `min=${min} max=${max}`).toBe(
					ts.clampTimerPwmSweepMin(min, max)
				);
			}
		}
	});

	it('advanceTimerPwmSweep matches across all parameter combinations', () => {
		for (const shape of SWEEP_SHAPES) {
			for (const startPhase of [0, 250, 500, 750, 1000]) {
				for (const current of CURRENT_PHASES) {
					for (const sweep of SWEEP_INPUTS) {
						for (const min of [0, 5, 25, 50, 75]) {
							for (const max of [0, 10, 25, 50, 100]) {
								const label = `shape=${shape} phase=${startPhase} c=${current} s=${sweep} min=${min} max=${max}`;
								expect(
									js.advanceTimerPwmSweep(
										current as never,
										sweep as never,
										min as never,
										max as never,
										startPhase as never,
										shape as never
									),
									label
								).toEqual(
									ts.advanceTimerPwmSweep(current, sweep, min, max, startPhase, shape)
								);
							}
						}
					}
				}
			}
		}
	});

	it('pwmSweepDutyAtPhase matches', () => {
		for (const shape of SWEEP_SHAPES) {
			for (const phase of [0, 250, 500, 750, 1000]) {
				for (const min of [0, 25, 50]) {
					for (const max of [25, 50, 100]) {
						const label = `shape=${shape} phase=${phase} min=${min} max=${max}`;
						expect(
							js.pwmSweepDutyAtPhase(phase as never, shape as never, min as never, max as never),
							label
						).toBe(ts.pwmSweepDutyAtPhase(phase, shape, min, max));
					}
				}
			}
		}
	});

	it('resolveSyncbuzzerWaveform matches', () => {
		const cases = [
			{ timerRow: { syncbuzzer: true, timerWaveform: [0, 8, 0, 8] }, patternShape: 0 },
			{ timerRow: { syncbuzzer: true, timerWaveform: [0, 8, 0, 8] }, patternShape: 15 },
			{ timerRow: { syncbuzzer: true, timerWaveform: [0, 8, 0, 8] }, patternShape: 12 },
			{ timerRow: { syncbuzzer: true, timerWaveform: [8] }, patternShape: 12 },
			{ timerRow: undefined, patternShape: 12 }
		];
		for (const { timerRow, patternShape } of cases) {
			const label = `${JSON.stringify(timerRow)} / ${patternShape}`;
			expect(js.resolveSyncbuzzerWaveform(timerRow as never, patternShape as never), label).toEqual(
				ts.resolveSyncbuzzerWaveform(timerRow as ts.AyTimerRow | undefined, patternShape)
			);
		}
	});

	it('isClassicSidTimerWaveform matches', () => {
		const waveforms = [[15, 0], [15, 0, 0], [14, 0], [15, 1], [], [15], [0xf, 0x0]];
		for (const waveform of waveforms) {
			expect(js.isClassicSidTimerWaveform(waveform as never), JSON.stringify(waveform)).toBe(
				ts.isClassicSidTimerWaveform(waveform)
			);
		}
	});

	it('row waveform / pwm accessors match', () => {
		for (const row of ROW_CASES) {
			const label = JSON.stringify(row);
			expect(js.effectiveRowTimerWaveform(row as never), label).toEqual(
				ts.effectiveRowTimerWaveform(row as ts.AyTimerRow | undefined)
			);
			expect(js.effectiveRowTimerWaveformLoop(row as never), label).toBe(
				ts.effectiveRowTimerWaveformLoop(row as ts.AyTimerRow | undefined)
			);
			expect(js.rowSupportsTimerPwm(row as never), label).toBe(
				ts.rowSupportsTimerPwm(row as ts.AyTimerRow | undefined)
			);

			for (const fields of FIELD_CASES) {
				const fieldsLabel = `${label} / ${JSON.stringify(fields)}`;
				expect(
					js.effectiveRowTimerPwmDuty(fields as never, row as never),
					fieldsLabel
				).toBe(
					ts.effectiveRowTimerPwmDuty(fields as unknown as ts.AyInstrumentFields, row as ts.AyTimerRow | undefined)
				);
				expect(
					js.effectiveRowTimerPwmSweep(fields as never, row as never),
					fieldsLabel
				).toBe(
					ts.effectiveRowTimerPwmSweep(fields as unknown as ts.AyInstrumentFields, row as ts.AyTimerRow | undefined)
				);
				expect(
					js.effectiveRowTimerPwmSweepMin(fields as never, row as never),
					fieldsLabel
				).toBe(
					ts.effectiveRowTimerPwmSweepMin(fields as unknown as ts.AyInstrumentFields, row as ts.AyTimerRow | undefined)
				);
			}
		}
	});

	it('normalizeAyInstrumentFields matches (covers normalizeTimerRow and pwm field resolution)', () => {
		for (const instrument of INSTRUMENT_CASES) {
			const label = (instrument as { id?: string }).id ?? 'unknown';
			const tsResult = ts.normalizeAyInstrumentFields(
				structuredClone(instrument) as InstrumentInput
			);
			const jsResult = js.normalizeAyInstrumentFields(structuredClone(instrument) as never);
			expect(jsResult, `instrument ${label}`).toEqual(tsResult);
		}
	});
});
