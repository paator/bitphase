import { Pattern as NesPattern, Note, Effect } from '../../models/song';
import type { PatternConverter } from '../base/adapter';
import type { Pattern } from '../../models/song';
import type { GenericPattern, GenericRow, GenericPatternRow } from '../../models/song/generic';
import { formatNoteFromEnum, parseNoteFromString } from '../../utils/note-utils';
import { isEffectLike, isString, toNumber } from '../../utils/type-guards';
import { PatternEffectHandling } from '../../services/pattern/editing/pattern-effect-handling';
import { NES_CHIP_SCHEMA } from './schema';

export class NESConverter implements PatternConverter {
	toGeneric(chipPattern: Pattern): GenericPattern {
		const nesPattern = chipPattern as NesPattern;
		const generic: GenericPattern = {
			id: nesPattern.id,
			length: nesPattern.length,
			channels: [],
			patternRows: []
		};

		for (let i = 0; i < nesPattern.channels.length; i++) {
			generic.channels.push({ rows: [] });
		}

		for (let rowIndex = 0; rowIndex < nesPattern.length; rowIndex++) {
			generic.patternRows.push({});

			for (let channelIndex = 0; channelIndex < nesPattern.channels.length; channelIndex++) {
				const nesRow = nesPattern.channels[channelIndex].rows[rowIndex];
				const effectValue = nesRow.effects[0];
				const effect = isEffectLike(effectValue) ? effectValue : null;
				const effectForGeneric =
					effect && !PatternEffectHandling.isEmptyEffect(effect)
						? ({
								effect: effect.effect,
								delay: effect.delay,
								parameter: effect.parameter,
								tableIndex: effect.tableIndex
							} as Record<string, unknown>)
						: null;
				const genericRow: GenericRow = {
					note: formatNoteFromEnum(nesRow.note.name, nesRow.note.octave),
					instrument: toNumber(nesRow.instrument),
					volume: toNumber(nesRow.volume),
					table: toNumber(nesRow.table),
					effect: effectForGeneric
				};
				generic.channels[channelIndex].rows.push(genericRow);
			}
		}

		return generic;
	}

	fromGeneric(generic: GenericPattern): Pattern {
		const channelLabels = NES_CHIP_SCHEMA.channelLabels ?? [
			'Square 1',
			'Square 2',
			'Triangle',
			'Noise',
			'DPCM'
		];
		const nesPattern = new NesPattern(
			generic.id,
			generic.length,
			NES_CHIP_SCHEMA,
			channelLabels.slice(0, generic.channels.length)
		);

		for (let rowIndex = 0; rowIndex < generic.length; rowIndex++) {
			const genericPatternRow = generic.patternRows[rowIndex] as GenericPatternRow;

			for (let channelIndex = 0; channelIndex < generic.channels.length; channelIndex++) {
				const genericChannel = generic.channels[channelIndex];
				const genericRow = genericChannel.rows[rowIndex];
				const nesRow = nesPattern.channels[channelIndex].rows[rowIndex];

				if (genericRow.note && isString(genericRow.note)) {
					const { noteName, octave } = parseNoteFromString(genericRow.note);
					nesRow.note = new Note(noteName, octave);
				}

				nesRow.instrument = toNumber(genericRow.instrument);
				nesRow.volume = toNumber(genericRow.volume);
				nesRow.table = toNumber(genericRow.table);

				if (
					genericRow.effect &&
					isEffectLike(genericRow.effect) &&
					!PatternEffectHandling.isEmptyEffect(genericRow.effect)
				) {
					nesRow.effects[0] = new Effect(
						genericRow.effect.effect,
						genericRow.effect.delay,
						genericRow.effect.parameter,
						genericRow.effect.tableIndex
					);
				} else {
					nesRow.effects[0] = null;
				}
			}

			if (genericPatternRow) {
				Object.assign(nesPattern.patternRows[rowIndex], genericPatternRow);
			}
		}

		return nesPattern;
	}
}
