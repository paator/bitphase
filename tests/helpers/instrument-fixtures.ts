import { Instrument } from '@/lib/models/song';
import {
	migrateLegacyInstrument,
	type LegacyInstrument
} from '@/lib/services/instrument/instrument-legacy-migration';

type LegacyInstrumentSpec = Record<string, unknown> & {
	id?: string;
	chipType?: string;
	rows?: Record<string, unknown>[];
	loop?: number;
};

export function legacyInstrument(spec: LegacyInstrumentSpec): Instrument {
	const chipType = typeof spec.chipType === 'string' ? spec.chipType : 'ay';
	const instrument = new Instrument(String(spec.id ?? '01'), '', chipType);
	return migrateLegacyInstrument({
		...instrument,
		...spec,
		rows: spec.rows ?? [],
		loop: spec.loop ?? 0
	} as LegacyInstrument);
}

export function legacyInstruments(specs: LegacyInstrumentSpec[]): Instrument[] {
	return specs.map((spec) => legacyInstrument(spec));
}
