import { describe, it, expect } from 'vitest';
import { AyTimerEffectsController } from '@/lib/chips/ay/ay-timer-effects-controller.svelte';
import {
	AY_TIMER_WAVEFORM_MIN_LENGTH,
	AY_TIMER_WAVEFORM_MAX_LENGTH,
	sampleTimerRowFromInstrument
} from '@/lib/chips/ay/instrument';
import { decodeTimerWaveform } from '@/lib/chips/ay/ay-timer-macros';
import { Instrument } from '@/lib/models/song';
import { HistoryClone } from '@/lib/services/history/history-clone';
import { legacyInstrument } from '../../../helpers/instrument-fixtures';

function createInstrument(
	timerRows: {
		sid?: boolean;
		syncbuzzer?: boolean;
		fm?: boolean;
		envFm?: boolean;
		fmOffsetMode?: 'semitone' | 'period';
		timerWaveform?: number[];
		fmWaveform?: number[];
		envFmWaveform?: number[];
	}[],
	pwm?: {
		timerPwmDuty?: number;
		timerPwmSweepMin?: number;
		timerPwmSweep?: number;
		timerPwmPreserveOnNewNote?: boolean;
	}
): Instrument {
	const instrument = legacyInstrument({
		rows: [{ tone: true, noise: false, envelope: false, volume: 15 }],
		timerRows,
		timerLoop: 0
	});
	if (pwm?.timerPwmDuty !== undefined) {
		(instrument as Instrument & { timerPwmDuty?: number }).timerPwmDuty = pwm.timerPwmDuty;
	}
	if (pwm?.timerPwmSweepMin !== undefined) {
		(instrument as Instrument & { timerPwmSweepMin?: number }).timerPwmSweepMin = pwm.timerPwmSweepMin;
	}
	if (pwm?.timerPwmSweep !== undefined) {
		(instrument as Instrument & { timerPwmSweep?: number }).timerPwmSweep = pwm.timerPwmSweep;
	}
	if (pwm?.timerPwmPreserveOnNewNote !== undefined) {
		(instrument as Instrument & { timerPwmPreserveOnNewNote?: boolean }).timerPwmPreserveOnNewNote =
			pwm.timerPwmPreserveOnNewNote;
	}
	return instrument;
}

describe('AyTimerEffectsController', () => {
	it('re-syncs timer fields when instrument is replaced externally', () => {
		let current = createInstrument([{ sid: false, syncbuzzer: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		current = createInstrument([{ sid: true, syncbuzzer: false, timerWaveform: [15, 0] }]);
		controller.handleInstrumentChange(current);
		expect(controller.rowSidEnabled(0)).toBe(true);

		const restored = HistoryClone.instrument(
			createInstrument([{ sid: false, syncbuzzer: false }])
		);
		controller.handleInstrumentChange(restored);
		expect(controller.rowSidEnabled(0)).toBe(false);
	});

	it('removes waveform steps for a row down to the minimum length', () => {
		let current = createInstrument([{ sid: false, timerWaveform: [15, 0, 1] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.removeRowWaveformStep(0)).toBe(true);
		expect(controller.rowTimerWaveform(0)).toEqual([15, 0]);

		controller.setRowTimerWaveform(0, Array.from({ length: AY_TIMER_WAVEFORM_MIN_LENGTH }, () => 1));
		expect(controller.removeRowWaveformStep(0)).toBe(false);
		expect(controller.rowTimerWaveform(0)).toHaveLength(AY_TIMER_WAVEFORM_MIN_LENGTH);
	});

	it('appends waveform steps for a row up to the maximum length', () => {
		let current = createInstrument([{ sid: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.appendRowWaveformStep(0)).toBe(true);
		expect(controller.rowTimerWaveform(0)).toEqual([15, 0, 0]);

		controller.setRowTimerWaveform(0, Array.from({ length: AY_TIMER_WAVEFORM_MAX_LENGTH }, () => 1));
		expect(controller.appendRowWaveformStep(0)).toBe(false);
		expect(controller.rowTimerWaveform(0)).toHaveLength(AY_TIMER_WAVEFORM_MAX_LENGTH);
	});

	it('re-syncs timer waveform when instrument is replaced externally', () => {
		let current = createInstrument([{ sid: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		controller.setRowTimerWaveform(0, [15, 14, 13]);
		expect(controller.rowTimerWaveform(0)).toEqual([15, 14, 13]);

		const restored = HistoryClone.instrument(createInstrument([{ sid: false }]));
		controller.handleInstrumentChange(restored);
		expect(controller.rowTimerWaveform(0)).toEqual([15, 0]);
	});

	it('tracks instrument-level pwm duty globally', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }], { timerPwmDuty: 50 });
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(10);
		expect((current as Instrument & { timerPwmDuty?: number }).timerPwmDuty).toBe(10);
	});

	it('updates pwm sweep speed globally with non-negative values only', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		controller.updateTimerPwmSweep('3');
		expect(controller.timerPwmSweep()).toBe(3);
		controller.updateTimerPwmSweep('-12');
		expect(controller.timerPwmSweep()).toBe(3);
		controller.setTimerPwmSweepMin(8);
		expect(controller.timerPwmSweepMin()).toBe(8);
		controller.updateTimerPwmSweep('0');
		expect(controller.timerPwmSweep()).toBe(0);
		expect(controller.timerPwmSweepMin()).toBe(0);
		controller.updateTimerPwmSweep('99');
		expect(controller.timerPwmSweep()).toBe(99);
		controller.updateTimerPwmSweep('150');
		expect(controller.timerPwmSweep()).toBe(100);
	});

	it('tracks instrument sweep min globally', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }], {
			timerPwmDuty: 25,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		controller.setTimerPwmSweepMin(5);
		expect(controller.timerPwmSweepMin()).toBe(5);
		controller.setTimerPwmSweepMin(40);
		expect(controller.timerPwmSweepMin()).toBe(25);
	});

	it('disables pwm editing when no row has a two-step pwm-eligible waveform', () => {
		let current = createInstrument([{ sid: false, timerWaveform: [15, 14] }], {
			timerPwmDuty: 20,
			timerPwmSweepMin: 5,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.instrumentSupportsTimerPwm()).toBe(false);
		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(20);
	});

	it('disables pwm editing when syncbuzzer rows use more than two envelope shapes', () => {
		let current = createInstrument([{ syncbuzzer: true, timerWaveform: [8, 12, 8] }], {
			timerPwmDuty: 20,
			timerPwmSweepMin: 5,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.instrumentSupportsTimerPwm()).toBe(false);
		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(20);
	});

	it('enables pwm editing when sid rows use exactly two steps', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 14] }], {
			timerPwmDuty: 20,
			timerPwmSweepMin: 5,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.instrumentSupportsTimerPwm()).toBe(true);
		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(10);
	});

	it('enables pwm editing when fm rows use exactly two semitone steps', () => {
		let current = createInstrument([{ fm: true, timerWaveform: [0, 12] }], {
			timerPwmDuty: 20,
			timerPwmSweepMin: 5,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.instrumentSupportsTimerPwm()).toBe(true);
		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(10);
	});

	it('enables pwm editing when syncbuzzer rows use exactly two envelope shapes', () => {
		let current = createInstrument([{ syncbuzzer: true, timerWaveform: [13, 9] }], {
			timerPwmDuty: 20,
			timerPwmSweepMin: 5,
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.instrumentSupportsTimerPwm()).toBe(true);
		controller.setTimerPwmDuty(10);
		expect(controller.timerPwmDuty()).toBe(10);
	});

	it('tracks instrument-level pwm preserve on new note', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.timerPwmPreserveOnNewNote()).toBe(false);
		controller.setTimerPwmPreserveOnNewNote(true);
		expect(controller.timerPwmPreserveOnNewNote()).toBe(true);
		expect(
			(current as Instrument & { timerPwmPreserveOnNewNote?: boolean }).timerPwmPreserveOnNewNote
		).toBe(true);
	});

	it('tracks instrument-level pwm sweep start phase', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }], {
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.timerPwmSweepStartPhase()).toBe(0);
		controller.setTimerPwmSweepStartPhase(750);
		expect(controller.timerPwmSweepStartPhase()).toBe(750);
		expect(
			(current as Instrument & { timerPwmSweepStartPhase?: number }).timerPwmSweepStartPhase
		).toBe(750);
	});

	it('tracks instrument-level pwm sweep shape', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }], {
			timerPwmSweep: 4
		});
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.timerPwmSweepShape()).toBe('triangle');
		controller.setTimerPwmSweepShape('sine');
		expect(controller.timerPwmSweepShape()).toBe('sine');
		expect(
			(current as Instrument & { timerPwmSweepShape?: string }).timerPwmSweepShape
		).toBe('sine');
	});

	it('opens and closes the waveform editor for a row', () => {
		let current = createInstrument([{ sid: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.waveformEditorRowIndex).toBeNull();
		controller.openWaveformEditor(0);
		expect(controller.waveformEditorRowIndex).toBe(0);
		controller.openWaveformEditor(0);
		expect(controller.waveformEditorRowIndex).toBeNull();
		controller.closeWaveformEditor();
		expect(controller.waveformEditorRowIndex).toBeNull();
	});

	it('reads fm waveform from timer macros on the fm panel', () => {
		let current = createInstrument([{ fm: true, fmWaveform: [0, 8, -4] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);
		controller.setTimerEditPanel('fm');

		expect(controller.rowFmOffsetMode(0)).toBe('semitone');
		expect(controller.formatRowTimerWaveform(0)).toBe('0 8 -4');
	});

	it('setRowWaveformStep updates fm waveform when fm is enabled', () => {
		let current = createInstrument([
			{ fm: true, fmWaveform: [0, 16, 0, -16], fmOffsetMode: 'period' }
		]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);
		controller.setTimerEditPanel('fm');
		expect(controller.rowFmOffsetMode(0)).toBe('period');
		controller.setRowWaveformStep(0, 0, 100);
		expect(controller.rowTimerWaveform(0)[0]).toBe(100);
	});

	it('toggles fm offset mode between semitone and period', () => {
		let current = createInstrument([{ fm: true, fmWaveform: [0, 7] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);
		controller.setTimerEditPanel('fm');
		expect(controller.rowFmOffsetMode(0)).toBe('semitone');
		controller.toggleFmOffsetMode(0);
		expect(controller.rowFmOffsetMode(0)).toBe('period');
		expect(controller.rowTimerWaveform(0)).toEqual([0, 16, 0, -16]);
	});

	it('rowTimerWaveform reads dedicated fmWaveform on fm panel even when fm is disabled', () => {
		let current = createInstrument([{ fm: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);
		controller.setTimerEditPanel('fm');
		controller.setRowWaveformStep(0, 0, 8);
		const extended = current as Instrument & { timerMacros?: Record<string, { values: string[] }> };
		expect(decodeTimerWaveform(extended.timerMacros?.fmWaveform?.values[0] ?? '')).toEqual([8, 7]);
		expect(controller.rowTimerWaveform(0)[0]).toBe(8);
	});

	it('samples sid state from timer macros', () => {
		const instrument = createInstrument([{ sid: true, timerWaveform: [15, 0] }]);
		expect(sampleTimerRowFromInstrument(instrument, 0).sid).toBe(true);
	});

	it('adds, loops, and removes timer rows while writing later steps', () => {
		let current = createInstrument([{ sid: false }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.timerRowCount()).toBe(1);
		controller.addTimerRow();
		expect(controller.timerRowCount()).toBe(2);
		controller.updateRowToneDetune(1, '3');
		controller.updateRowDetune(1, '12');
		expect(controller.rowToneDetune(1)).toBe(3);
		expect(controller.rowDetune(1)).toBe(12);
		controller.setTimerLoop(1);
		expect(controller.timerLoop()).toBe(1);
		controller.removeTimerRow(0);
		expect(controller.timerRowCount()).toBe(1);
		expect(controller.rowToneDetune(0)).toBe(3);
		expect(controller.rowDetune(0)).toBe(12);
	});

	it('keeps sid and syncbuzzer exclusive when toggling rows', () => {
		let current = createInstrument([{ sid: true, timerWaveform: [15, 0] }]);
		const controller = new AyTimerEffectsController(
			() => current,
			(instrument) => {
				current = instrument;
			},
			() => false
		);

		expect(controller.rowSidEnabled(0)).toBe(true);
		expect(controller.rowSyncbuzzerEnabled(0)).toBe(false);
		controller.updateSyncbuzzerRow(0, true);
		expect(controller.rowSidEnabled(0)).toBe(false);
		expect(controller.rowSyncbuzzerEnabled(0)).toBe(true);
		controller.updateSidRow(0, true);
		expect(controller.rowSidEnabled(0)).toBe(true);
		expect(controller.rowSyncbuzzerEnabled(0)).toBe(false);
	});
});
