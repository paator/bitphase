import type { ChipSchema } from '../../chips/base/schema';
import { isChannelEffectFieldKey } from '../../chips/base/channel-effect-columns';
import { PatternTemplateParser } from '../pattern/editing/pattern-template-parsing';

const CHANNEL_EFFECT_COMMAND: Record<string, string> = {
	P: '3',
	S: 'B'
};

const ENVELOPE_EFFECT_COMMAND: Record<string, string> = {
	'1': '9',
	'2': 'A'
};

export function displayPt3Effects(
	row: string,
	schema: ChipSchema,
	effectColumnCounts: number[]
): string {
	if (!row) return row;
	const chars = Array.from(row);
	let changed = false;
	PatternTemplateParser.walkRow(row, schema, effectColumnCounts, {
		onGlobalField(key, _field, pos) {
			if (key !== 'envelopeEffect') return;
			const next = ENVELOPE_EFFECT_COMMAND[chars[pos] ?? ''];
			if (!next) return;
			chars[pos] = next;
			changed = true;
		},
		onChannelField(_index, key, _field, pos) {
			if (!isChannelEffectFieldKey(key)) return;
			const next = CHANNEL_EFFECT_COMMAND[chars[pos] ?? ''];
			if (!next) return;
			chars[pos] = next;
			changed = true;
		}
	});
	return changed ? chars.join('') : row;
}
