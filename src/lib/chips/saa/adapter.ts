import { Pattern as SAAPattern, Note } from '../../models/song';
import type { PatternConverter } from '../base/adapter';
import type { Pattern } from '../../models/song';
import type { GenericPattern, GenericPatternRow, GenericRow } from '../../models/song/generic';
import { formatNoteFromEnum, parseNoteFromString } from '../../utils/note-utils';
import { isString, toNumber } from '../../utils/type-guards';
import {
	assignEffectsToGenericRow,
	readEffectsFromGenericRow,
	resolveChannelEffectColumnCount
} from '../base/channel-effect-columns';
import { SAA_CHIP_SCHEMA } from './schema';

export class SAAConverter implements PatternConverter {
	toGeneric(chipPattern: Pattern): GenericPattern {
		const saaPattern = chipPattern as SAAPattern;
		const generic: GenericPattern = {
			id: saaPattern.id,
			length: saaPattern.length,
			channels: [],
			patternRows: []
		};

		for (let i = 0; i < saaPattern.channels.length; i++) {
			const channel = saaPattern.channels[i];
			generic.channels.push({
				rows: [],
				label: channel.label,
				effectColumnCount: resolveChannelEffectColumnCount(channel)
			});
		}

		for (let rowIndex = 0; rowIndex < saaPattern.length; rowIndex++) {
			const patternRow = saaPattern.patternRows[rowIndex];
			generic.patternRows.push({
				noise0: toNumber(patternRow.noise0),
				noise1: toNumber(patternRow.noise1),
				env0: toNumber(patternRow.env0),
				env1: toNumber(patternRow.env1)
			});

			for (let channelIndex = 0; channelIndex < saaPattern.channels.length; channelIndex++) {
				const channel = saaPattern.channels[channelIndex];
				const saaRow = channel.rows[rowIndex];
				const effectCount = resolveChannelEffectColumnCount(channel);
				const genericRow: GenericRow = {
					note: formatNoteFromEnum(saaRow.note.name, saaRow.note.octave),
					instrument: toNumber(saaRow.instrument),
					table: toNumber(saaRow.table),
					left: toNumber(saaRow.left),
					right: toNumber(saaRow.right)
				};
				assignEffectsToGenericRow(genericRow, saaRow.effects, effectCount);
				generic.channels[channelIndex].rows.push(genericRow);
			}
		}

		return generic;
	}

	fromGeneric(generic: GenericPattern): Pattern {
		const defaultLabels = SAA_CHIP_SCHEMA.channelLabels ?? ['A', 'B', 'C', 'D', 'E', 'F'];
		const channelLabels = generic.channels.map(
			(channel, index) => channel.label ?? defaultLabels[index] ?? `Ch${index + 1}`
		);
		const saaPattern = new SAAPattern(
			generic.id,
			generic.length,
			SAA_CHIP_SCHEMA,
			channelLabels
		);

		for (let rowIndex = 0; rowIndex < generic.length; rowIndex++) {
			const genericPatternRow = generic.patternRows[rowIndex] as GenericPatternRow;
			const patternRow = saaPattern.patternRows[rowIndex];
			if (patternRow && genericPatternRow) {
				patternRow.noise0 = toNumber(genericPatternRow.noise0);
				patternRow.noise1 = toNumber(genericPatternRow.noise1);
				patternRow.env0 = toNumber(genericPatternRow.env0);
				patternRow.env1 = toNumber(genericPatternRow.env1);
			}

			for (let channelIndex = 0; channelIndex < generic.channels.length; channelIndex++) {
				const genericChannel = generic.channels[channelIndex];
				const genericRow = genericChannel.rows[rowIndex];
				const saaRow = saaPattern.channels[channelIndex]?.rows[rowIndex];
				if (!genericRow || !saaRow) continue;

				if (genericRow.note && isString(genericRow.note)) {
					const { noteName, octave } = parseNoteFromString(genericRow.note);
					saaRow.note = new Note(noteName, octave);
				}

				saaRow.instrument = toNumber(genericRow.instrument);
				saaRow.table = toNumber(genericRow.table);
				saaRow.left = toNumber(genericRow.left);
				saaRow.right = toNumber(genericRow.right);

				const effectCount = resolveChannelEffectColumnCount({
					effectColumnCount: genericChannel.effectColumnCount,
					rows: genericChannel.rows
				});
				saaPattern.channels[channelIndex].effectColumnCount = effectCount;
				saaRow.effects = readEffectsFromGenericRow(genericRow, effectCount);
			}
		}

		return saaPattern;
	}
}
