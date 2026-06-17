import type { Instrument } from '../../models/song';

export function resolveInstrumentChipType(instrument: Instrument): string {
	return instrument.chipType ?? 'ay';
}

export function filterInstrumentsForChip(
	instruments: Instrument[],
	chipType: string
): Instrument[] {
	return instruments.filter((instrument) => resolveInstrumentChipType(instrument) === chipType);
}
