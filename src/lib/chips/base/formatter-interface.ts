import type { ChipSchema } from './schema';
import type { GenericRow, GenericPatternRow } from '../../models/song/generic';

export interface FormatRowOptions {
	debug?: boolean;
	virtualChannelMap?: Record<number, number>;
}

export interface PatternFormatter {
	virtualChannelMap?: Record<number, number>;
	formatRow(
		patternRow: GenericPatternRow,
		channels: GenericRow[],
		rowIndex: number,
		schema: ChipSchema,
		options?: FormatRowOptions
	): string;
	parseRow(
		rowString: string,
		schema: ChipSchema
	): {
		patternRow: GenericPatternRow;
		channels: GenericRow[];
	};
	getColorForField(fieldKey: string, schema: ChipSchema): string;
}
