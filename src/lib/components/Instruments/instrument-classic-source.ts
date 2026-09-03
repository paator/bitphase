import type { Instrument } from '../../models/song';
import {
	instrumentMacroUpdates,
	instrumentRowsToMacros,
	macrosToInstrumentRows,
	type InstrumentMacroField,
	type InstrumentMacros
} from '../../chips/base/instrument-macros';

export type ClassicInstrumentTableSource = {
	id: string;
	name: string;
	rows: Record<string, unknown>[];
	loop: number;
};

export function classicTableFromMacros(
	instrument: Instrument,
	fields: readonly InstrumentMacroField[],
	macros: InstrumentMacros
): ClassicInstrumentTableSource {
	const rows = macrosToInstrumentRows(macros, fields);
	const loop = macros[fields[0]?.id ?? '']?.loop ?? 0;
	return {
		id: instrument.id,
		name: instrument.name,
		rows,
		loop
	};
}

export function commitClassicTableMacros(
	instrument: Instrument,
	fields: readonly InstrumentMacroField[],
	rows: Record<string, unknown>[],
	loop: number
): Instrument {
	const macros = instrumentMacroUpdates(instrumentRowsToMacros(rows, loop, fields), fields)
		.macros;
	return { ...instrument, macros };
}
