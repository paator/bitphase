import type { ChipSchema } from '../../chips/base/schema';
import { isChannelEffectFieldKey } from '../../chips/base/channel-effect-columns';
import { PatternTemplateParser } from '../pattern/editing/pattern-template-parsing';

const CHANNEL_EFFECT_COMMAND: Record<string, string> = {
	P: '3',
	S: 'B'
};

export function pt3RecorderSchema(schema: ChipSchema): ChipSchema {
	if (!schema.globalFields?.envelopeEffect) return schema;
	const globalFields = { ...schema.globalFields };
	delete globalFields.envelopeEffect;
	const globalColumnLabels = schema.globalColumnLabels
		? { ...schema.globalColumnLabels }
		: undefined;
	if (globalColumnLabels) delete globalColumnLabels.envelopeEffect;
	const globalTemplate = (schema.globalTemplate ?? '')
		.replace(/\{envelopeEffect\}/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
	return { ...schema, globalFields, globalColumnLabels, globalTemplate };
}

export function displayPt3Effects(
	row: string,
	schema: ChipSchema,
	effectColumnCounts: number[],
	channelCommands?: readonly (string | undefined)[]
): string {
	if (!row) return row;
	const chars = Array.from(row);
	let changed = false;
	PatternTemplateParser.walkRow(row, schema, effectColumnCounts, {
		onChannelField(index, key, field, pos) {
			if (!isChannelEffectFieldKey(key)) return;
			const command = key === 'effect' ? channelCommands?.[index] : undefined;
			if (command) {
				const text = command.padEnd(field.length, '.').slice(0, field.length);
				for (let i = 0; i < field.length; i++) chars[pos + i] = text[i] ?? '.';
				changed = true;
				return;
			}
			const next = CHANNEL_EFFECT_COMMAND[chars[pos] ?? ''];
			if (!next) return;
			chars[pos] = next;
			changed = true;
		}
	});
	return changed ? chars.join('') : row;
}
