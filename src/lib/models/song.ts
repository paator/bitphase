import type { ChipSchema, ChipField } from '../chips/base/schema';
import { getDefaultForFieldType } from '../chips/base/schema';
import {
	applySharedEffectColumnCounts,
	getSharedEffectColumnCounts
} from '../chips/base/channel-effect-columns';
import { computeEffectiveChannelLabels } from './virtual-channels';

enum NoteName {
	None = 0,
	Off,
	C,
	CSharp,
	D,
	DSharp,
	E,
	F,
	FSharp,
	G,
	GSharp,
	A,
	ASharp,
	B
}

enum EffectType {
	Arpeggio = 'A'.charCodeAt(0),
	SlideUp = 1,
	SlideDown = 2,
	Portamento = 'P'.charCodeAt(0),
	SamplePosition = 4,
	OrnamentPosition = 5,
	OnOff = 6,
	Speed = 'S'.charCodeAt(0),
	Vibrato = 'V'.charCodeAt(0),
	AutoEnvelope = 'E'.charCodeAt(0),
	Detune = 'D'.charCodeAt(0)
}

class Note {
	name: NoteName;
	octave: number;

	constructor(name: NoteName = NoteName.None, octave: number = 0) {
		this.name = name;
		this.octave = octave;
	}
}

class Instrument {
	id: string;
	chipType: string;
	name: string = '';
	macros?: Record<string, { values: (boolean | number | string)[]; loop: number }>;

	constructor(id: string, name: string = '', chipType: string = 'ay') {
		this.id = id;
		this.chipType = chipType;
		this.name = name || `Instrument ${id}`;
	}
}

class InstrumentRow {
	[key: string]: unknown;

	constructor(data: Record<string, unknown> = {}) {
		Object.assign(this, data);
	}
}

class Effect {
	effect: number;
	delay: number;
	parameter: number;
	tableIndex?: number;

	constructor(effect: number, delay: number = 0, parameter: number = 0, tableIndex?: number) {
		this.effect = effect;
		this.delay = delay;
		this.parameter = parameter;
		this.tableIndex = tableIndex;
	}
}

class Row {
	note: Note;
	effects: (Effect | null)[];
	[key: string]: unknown;

	constructor(fields?: Record<string, ChipField>, data: Partial<Row> = {}) {
		this.note = data.note || new Note();
		this.effects = data.effects || [null];

		if (fields) {
			for (const [key, field] of Object.entries(fields)) {
				if (key === 'note' || key === 'effect') continue;
				if (data[key as keyof Row] !== undefined) {
					this[key] = data[key as keyof Row];
				} else {
					this[key] = getDefaultForFieldType(field.type, key, field.allowZeroValue);
				}
			}
		}

		for (const key of Object.keys(data)) {
			if (key !== 'note' && key !== 'effects' && this[key] === undefined) {
				this[key] = data[key as keyof Row];
			}
		}
	}
}

class PatternRow {
	[key: string]: unknown;

	constructor(globalFields?: Record<string, ChipField>, data: Record<string, unknown> = {}) {
		if (globalFields) {
			for (const [key, field] of Object.entries(globalFields)) {
				if (data[key] !== undefined) {
					this[key] = data[key];
				} else {
					this[key] = getDefaultForFieldType(field.type, key, field.allowZeroValue);
				}
			}
		}
		Object.assign(this, data);
	}
}

class Channel {
	rows: Row[];
	label: string;
	effectColumnCount: number;

	constructor(rowCount: number, label: string, fields?: Record<string, ChipField>) {
		this.rows = Array.from({ length: rowCount }, () => new Row(fields));
		this.label = label;
		this.effectColumnCount = 1;
	}
}

export const DEFAULT_PATTERN_LENGTH = 64;

class Pattern {
	id: number;
	length: number;
	channels: Channel[];
	patternRows: PatternRow[];

	constructor(
		id: number,
		length: number = DEFAULT_PATTERN_LENGTH,
		schema?: ChipSchema,
		effectiveChannelLabels?: string[]
	) {
		this.id = id;
		this.length = length;

		const channelLabels = effectiveChannelLabels ?? schema?.channelLabels ?? ['A', 'B', 'C'];
		const fields = schema?.fields;
		const globalFields = schema?.globalFields;

		this.channels = channelLabels.map((label) => new Channel(length, label, fields));
		this.patternRows = Array.from({ length }, () => new PatternRow(globalFields));
	}
}

class Song {
	public patterns: Pattern[];
	public tuningTable: number[];
	public initialSpeed: number;
	public defaultPatternLength: number;
	public chipType?: string;
	public chipVariant?: string;
	public chipFrequency?: number;
	public interruptFrequency: number;
	public tuningTableIndex?: number;
	public a4TuningHz?: number;
	public virtualChannelMap: Record<number, number> = {};
	private schema?: ChipSchema;

	constructor(schema?: ChipSchema) {
		this.schema = schema;
		this.initialSpeed = 3;
		this.defaultPatternLength = DEFAULT_PATTERN_LENGTH;
		this.patterns = [new Pattern(0, this.defaultPatternLength, schema)];
		this.tuningTable = [];
		this.interruptFrequency = 50;
	}

	setSchema(schema: ChipSchema): void {
		this.schema = schema;
	}

	getSchema(): ChipSchema | undefined {
		return this.schema;
	}

	getEffectiveChannelLabels(): string[] {
		const hwLabels = this.schema?.channelLabels ?? ['A', 'B', 'C'];
		return computeEffectiveChannelLabels(hwLabels, this.virtualChannelMap);
	}

	addPattern(): Pattern {
		const newId = this.patterns.length;
		const effectiveLabels = this.getEffectiveChannelLabels();
		const pattern = new Pattern(newId, this.defaultPatternLength, this.schema, effectiveLabels);
		if (this.patterns.length > 0) {
			applySharedEffectColumnCounts(pattern, getSharedEffectColumnCounts(this.patterns));
		}
		this.patterns.push(pattern);
		return pattern;
	}
}

export {
	Song,
	Pattern,
	Channel,
	Row,
	Note,
	Effect,
	NoteName,
	EffectType,
	Instrument,
	InstrumentRow
};
