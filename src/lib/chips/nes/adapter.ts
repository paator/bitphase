import { Pattern as NesPattern, Note } from '../../models/song';
import type { PatternConverter } from '../base/adapter';
import type { Pattern } from '../../models/song';
import type { GenericPattern, GenericRow, GenericPatternRow } from '../../models/song/generic';
import { formatNoteFromEnum, parseNoteFromString } from '../../utils/note-utils';
import { isString, toNumber } from '../../utils/type-guards';
import {
	assignEffectsToGenericRow,
	readEffectsFromGenericRow,
	resolveChannelEffectColumnCount
} from '../base/channel-effect-columns';
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
			const channel = nesPattern.channels[i];
			generic.channels.push({
				rows: [],
				label: channel.label,
				effectColumnCount: resolveChannelEffectColumnCount(channel)
			});
		}

		for (let rowIndex = 0; rowIndex < nesPattern.length; rowIndex++) {
			generic.patternRows.push({});

			for (let channelIndex = 0; channelIndex < nesPattern.channels.length; channelIndex++) {
				const channel = nesPattern.channels[channelIndex];
				const nesRow = channel.rows[rowIndex];
				const effectCount = resolveChannelEffectColumnCount(channel);
				const genericRow: GenericRow = {
					note: formatNoteFromEnum(nesRow.note.name, nesRow.note.octave),
					instrument: toNumber(nesRow.instrument),
					volume: toNumber(nesRow.volume),
					table: toNumber(nesRow.table)
				};
				assignEffectsToGenericRow(genericRow, nesRow.effects, effectCount);
				generic.channels[channelIndex].rows.push(genericRow);
			}
		}

		return generic;
	}

	fromGeneric(generic: GenericPattern): Pattern {
		const defaultLabels = NES_CHIP_SCHEMA.channelLabels ?? [
			'Pulse 1',
			'Pulse 2',
			'Triangle',
			'Noise',
			'DPCM'
		];
		const channelLabels = generic.channels.map(
			(channel, index) => channel.label ?? defaultLabels[index] ?? `Ch${index + 1}`
		);
		const nesPattern = new NesPattern(
			generic.id,
			generic.length,
			NES_CHIP_SCHEMA,
			channelLabels
		);

		for (let rowIndex = 0; rowIndex < generic.length; rowIndex++) {
			const genericPatternRow = generic.patternRows[rowIndex] as GenericPatternRow;

			for (let channelIndex = 0; channelIndex < generic.channels.length; channelIndex++) {
				const genericChannel = generic.channels[channelIndex];
				const genericRow = genericChannel.rows[rowIndex];
				const nesRow = nesPattern.channels[channelIndex]?.rows[rowIndex];
				if (!genericRow || !nesRow) continue;

				if (genericRow.note && isString(genericRow.note)) {
					const { noteName, octave } = parseNoteFromString(genericRow.note);
					nesRow.note = new Note(noteName, octave);
				}

				nesRow.instrument = toNumber(genericRow.instrument);
				nesRow.volume = toNumber(genericRow.volume);
				nesRow.table = toNumber(genericRow.table);

				const effectCount = resolveChannelEffectColumnCount({
					effectColumnCount: genericChannel.effectColumnCount,
					rows: genericChannel.rows
				});
				nesPattern.channels[channelIndex].effectColumnCount = effectCount;
				nesRow.effects = readEffectsFromGenericRow(genericRow, effectCount);
			}

			if (genericPatternRow) {
				Object.assign(nesPattern.patternRows[rowIndex], genericPatternRow);
			}
		}

		return nesPattern;
	}
}
