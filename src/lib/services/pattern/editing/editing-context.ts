import type { Pattern } from '../../../models/song';
import type { Instrument } from '../../../models/song';
import type { Chip } from '../../../chips/types';
import type { PatternConverter } from '../../../chips/base/adapter';
import type { PatternFormatter } from '../../../chips/base/formatter-interface';
import type { CellPosition, FieldSegment } from '../../../ui-rendering/pattern-editor-text-parser';

export interface EditingContext {
	pattern: Pattern;
	selectedRow: number;
	selectedColumn: number;
	cellPositions: CellPosition[];
	segments?: FieldSegment[];
	converter: PatternConverter;
	formatter: PatternFormatter;
	schema: Chip['schema'];
	instruments?: Instrument[];
	tuningTable?: number[];
}

export interface PatternEditingResult {
	updatedPattern: Pattern;
	shouldMoveNext: boolean;
	didChange?: boolean;
	shouldPreview?: boolean;
}

export interface FieldInfo {
	fieldKey: string;
	fieldType: string;
	isGlobal: boolean;
	channelIndex: number;
	charOffset: number;
}
