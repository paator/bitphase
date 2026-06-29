import type { PatternConverter } from '../../chips/base/adapter';
import type { ChipSchema } from '../../chips/base/schema';
import { getDefaultForFieldType } from '../../chips/base/schema';
import type { PreviewNoteSupport } from '../../chips/base/processor';
import type { Pattern } from '../../models/song';
import type { GenericRow } from '../../models/song/generic';

export interface PreviewFromContextOptions {
	previewFullRow: boolean;
	isGlobalField?: boolean;
}

export class PreviewService {
	playFromContext(
		processor: PreviewNoteSupport,
		pattern: Pattern,
		channelIndex: number,
		currentRow: number,
		schema: ChipSchema,
		converter: PatternConverter,
		options: PreviewFromContextOptions
	): number | undefined {
		const useFullRow =
			options.previewFullRow || options.isGlobalField === true || channelIndex < 0;
		const previewPattern = useFullRow
			? pattern
			: this.isolateChannelPattern(pattern, channelIndex, schema, converter);
		const previewChannelIndex = useFullRow ? undefined : channelIndex;
		processor.playPreviewRow(previewPattern, currentRow, undefined, previewChannelIndex);
		return useFullRow ? -1 : channelIndex;
	}

	stopNote(processor: PreviewNoteSupport, channel: number | undefined): void {
		processor.stopPreviewNote(channel);
	}

	isolateChannelPattern(
		pattern: Pattern,
		channelIndex: number,
		schema: ChipSchema,
		converter: PatternConverter
	): Pattern {
		const generic = converter.toGeneric(pattern);
		const emptyRow = this.createEmptyChannelRow(schema.fields);
		for (let ch = 0; ch < generic.channels.length; ch++) {
			if (ch === channelIndex) continue;
			for (let row = 0; row < generic.length; row++) {
				generic.channels[ch].rows[row] = structuredClone(emptyRow);
			}
		}
		return converter.fromGeneric(generic);
	}

	private createEmptyChannelRow(fields: ChipSchema['fields']): GenericRow {
		const row: GenericRow = {};
		for (const [key, field] of Object.entries(fields)) {
			if (key === 'note') {
				row.note = '---';
			} else if (key === 'effect') {
				row.effect = null;
			} else {
				row[key] = getDefaultForFieldType(field.type, key, field.allowZeroValue) as
					| string
					| number
					| null;
			}
		}
		return row;
	}
}
