export interface GenericRow {
	[key: string]: string | number | null | undefined | Record<string, unknown>;
}

export interface GenericPatternRow {
	[key: string]: string | number | null | undefined | Record<string, unknown>;
}

export interface GenericChannel {
	rows: GenericRow[];
	label?: string;
	effectColumnCount?: number;
}

export interface GenericPattern {
	id: number;
	length: number;
	channels: GenericChannel[];
	patternRows: GenericPatternRow[];
}
