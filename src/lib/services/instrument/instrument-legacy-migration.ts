import type { InstrumentMacroField, InstrumentMacros } from '../../chips/base/instrument-macros';
import {
	hasKnownInstrumentMacros,
	instrumentMacroUpdates,
	instrumentRowsToMacros
} from '../../chips/base/instrument-macros';
import { AY_MIXER_MACRO_FIELDS } from '../../chips/ay/mixer-macros';
import { AY_TIMER_MACRO_FIELDS } from '../../chips/ay/ay-timer-macros';
import { normalizeLegacyTimerRow } from '../../chips/ay/instrument';
import { NES_APU_MACRO_FIELDS } from '../../chips/nes/apu-macros';
import { Instrument } from '../../models/song';

export type LegacyInstrument = Instrument & {
	rows?: Record<string, unknown>[];
	loop?: number;
	timerRows?: Record<string, unknown>[];
	timerLoop?: number;
	timerMacros?: InstrumentMacros;
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
};

function mixerFieldsForChip(chipType: string): readonly InstrumentMacroField[] {
	return chipType === 'nes' ? NES_APU_MACRO_FIELDS : AY_MIXER_MACRO_FIELDS;
}

function migrateMixerMacros(
	instrument: LegacyInstrument,
	chipType: string
): InstrumentMacros | undefined {
	const fields = mixerFieldsForChip(chipType);
	if (instrument.macros && hasKnownInstrumentMacros(instrument.macros, fields)) {
		return instrumentMacroUpdates(instrument.macros, fields).macros;
	}
	if (!instrument.rows?.length) {
		return undefined;
	}
	return instrumentRowsToMacros(instrument.rows, instrument.loop ?? 0, fields);
}

function migrateTimerMacros(instrument: LegacyInstrument): InstrumentMacros | undefined {
	if (instrument.timerMacros && hasKnownInstrumentMacros(instrument.timerMacros, AY_TIMER_MACRO_FIELDS)) {
		return instrumentMacroUpdates(instrument.timerMacros, AY_TIMER_MACRO_FIELDS).macros;
	}
	if (!instrument.timerRows?.length) {
		return undefined;
	}
	return instrumentRowsToMacros(
		instrument.timerRows.map((row) => normalizeLegacyTimerRow(row)),
		instrument.timerLoop ?? instrument.loop ?? 0,
		AY_TIMER_MACRO_FIELDS
	);
}

export function migrateLegacyInstrument(instrument: LegacyInstrument): Instrument {
	const chipType = instrument.chipType || 'ay';
	const mixerMacros = migrateMixerMacros(instrument, chipType);
	const migrated = Object.assign(new Instrument(instrument.id, instrument.name, chipType), {
		...instrument
	}) as LegacyInstrument;
	delete migrated.rows;
	delete migrated.loop;
	delete migrated.timerRows;
	delete migrated.timerLoop;

	if (mixerMacros) {
		migrated.macros = mixerMacros;
	}

	if (chipType === 'ay') {
		const timerMacros = migrateTimerMacros(instrument);
		if (timerMacros) {
			migrated.timerMacros = timerMacros;
		}
		const pwmRow = instrument.timerRows?.find(
			(row) =>
				row?.timerPwmDuty !== undefined ||
				row?.timerPwmSweepMin !== undefined ||
				row?.timerPwmSweep !== undefined
		) as
			| {
					timerPwmDuty?: number;
					timerPwmSweepMin?: number;
					timerPwmSweep?: number;
			  }
			| undefined;
		if (
			pwmRow &&
			migrated.timerPwmDuty === undefined &&
			migrated.timerPwmSweepMin === undefined &&
			migrated.timerPwmSweep === undefined
		) {
			if (pwmRow.timerPwmDuty !== undefined) {
				migrated.timerPwmDuty = Number(pwmRow.timerPwmDuty);
			}
			if (pwmRow.timerPwmSweepMin !== undefined) {
				migrated.timerPwmSweepMin = Number(pwmRow.timerPwmSweepMin);
			}
			if (pwmRow.timerPwmSweep !== undefined) {
				migrated.timerPwmSweep = Number(pwmRow.timerPwmSweep);
			}
		}
	}

	return migrated;
}

export function instrumentFromLegacy(
	id: string,
	name: string,
	chipType: string,
	legacy: Omit<LegacyInstrument, 'id' | 'name' | 'chipType'> = {}
): Instrument {
	return migrateLegacyInstrument({
		...new Instrument(id, name, chipType),
		...legacy
	});
}
