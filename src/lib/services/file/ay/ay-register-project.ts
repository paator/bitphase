import { Project, Table } from '../../../models/project';
import { Instrument, InstrumentRow, type Song } from '../../../models/song';
import { numberToInstrumentId } from '../../../utils/instrument-id';
import { instrumentFromLegacy } from '../../instrument/instrument-legacy-migration';

export type AyProjectParts = {
	title: string;
	author: string;
	songs: Song[];
	instruments: Instrument[];
	patternOrder: number[];
	loopPatternIndex: number;
};

export function assembleAyProject(parts: AyProjectParts): Project {
	return new Project(
		parts.title,
		parts.author,
		parts.songs,
		parts.loopPatternIndex,
		parts.patternOrder.length > 0 ? parts.patternOrder : [0],
		[new Table(0, [], 0, 'Table 1')],
		{},
		parts.instruments.length > 0
			? parts.instruments
			: [createPlaceholderInstrument()]
	);
}

function createPlaceholderInstrument(): Instrument {
	const id = numberToInstrumentId(1);
	return instrumentFromLegacy(id, `Instrument ${id}`, 'ay', {
		rows: [
			new InstrumentRow({
				tone: true,
				noise: false,
				envelope: false,
				retriggerEnvelope: false,
				toneAdd: 0,
				noiseAdd: 0,
				envelopeAdd: 0,
				volume: 15,
				loop: true,
				amplitudeSliding: false,
				amplitudeSlideUp: false,
				toneAccumulation: false,
				noiseAccumulation: false,
				envelopeAccumulation: false
			})
		],
		loop: 0
	});
}
