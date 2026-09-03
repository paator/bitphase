import { Project, Table } from '../../models/project';
import { copyAyInstrumentFields } from '../../chips/ay/instrument';
import { copyNesInstrumentFields } from '../../chips/nes/instrument';
import {
	Channel,
	Effect,
	Instrument,
	InstrumentRow,
	Note,
	Pattern,
	Row,
	Song
} from '../../models/song';

export class HistoryClone {
	static value<T>(value: T): T {
		if (value instanceof Project) return this.project(value) as T;
		if (value instanceof Song) return this.song(value) as T;
		if (value instanceof Pattern) return this.pattern(value) as T;
		if (value instanceof Channel) return this.channel(value) as T;
		if (value instanceof Row) return this.row(value) as T;
		if (value instanceof Effect) return this.effect(value) as T;
		if (value instanceof Note) return this.note(value) as T;
		if (value instanceof Table) return this.table(value) as T;
		if (value instanceof Instrument) return this.instrument(value) as T;
		if (value instanceof InstrumentRow) return this.instrumentRow(value) as T;
		if (Array.isArray(value)) return value.map((item) => this.value(item)) as T;
		if (value && typeof value === 'object') return this.object(value) as T;
		return value;
	}

	static project(project: Project): Project {
		return new Project(
			project.name,
			project.author,
			project.songs.map((song) => this.song(song)),
			project.loopPointId,
			[...project.patternOrder],
			project.tables.map((table) => this.table(table)),
			{ ...project.patternOrderColors },
			project.instruments.map((instrument) => this.instrument(instrument))
		);
	}

	static song(song: Song): Song {
		const cloned = new Song(song.getSchema());
		cloned.patterns = song.patterns.map((pattern) => this.pattern(pattern));
		cloned.tuningTable = [...song.tuningTable];
		cloned.initialSpeed = song.initialSpeed;
		cloned.defaultPatternLength = song.defaultPatternLength;
		cloned.chipType = song.chipType;
		cloned.chipVariant = song.chipVariant;
		cloned.chipFrequency = song.chipFrequency;
		cloned.interruptFrequency = song.interruptFrequency;
		cloned.tuningTableIndex = song.tuningTableIndex;
		cloned.a4TuningHz = song.a4TuningHz;
		cloned.virtualChannelMap = { ...song.virtualChannelMap };

		for (const [key, value] of Object.entries(song as unknown as Record<string, unknown>)) {
			if (key in cloned) continue;
			(cloned as unknown as Record<string, unknown>)[key] = this.value(value);
		}

		return cloned;
	}

	static pattern(pattern: Pattern): Pattern {
		const cloned = Object.create(Pattern.prototype) as Pattern;
		cloned.id = pattern.id;
		cloned.length = pattern.length;
		cloned.channels = pattern.channels.map((channel) => this.channel(channel));
		cloned.patternRows = pattern.patternRows.map((row) => this.patternRow(row));
		return cloned;
	}

	static channel(channel: Channel): Channel {
		const cloned = Object.create(Channel.prototype) as Channel;
		cloned.label = channel.label;
		cloned.effectColumnCount = channel.effectColumnCount ?? 1;
		cloned.rows = channel.rows.map((row) => this.row(row));
		return cloned;
	}

	static row(row: Row): Row {
		const cloned = Object.create(Row.prototype) as Row;
		for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
			if (key === 'note') cloned.note = this.note(value as Note);
			else if (key === 'effects') cloned.effects = (value as (Effect | null)[]).map((effect) =>
				effect ? this.effect(effect) : null
			);
			else cloned[key] = this.value(value);
		}
		if (!cloned.note) cloned.note = new Note();
		if (!cloned.effects) cloned.effects = [null];
		return cloned;
	}

	static patternRow(row: Pattern['patternRows'][number]): Pattern['patternRows'][number] {
		const cloned = Object.create(Object.getPrototypeOf(row)) as Pattern['patternRows'][number];
		for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
			cloned[key] = this.value(value);
		}
		return cloned;
	}

	static note(note: Note): Note {
		return new Note(note.name, note.octave);
	}

	static effect(effect: Effect): Effect {
		return new Effect(effect.effect, effect.delay, effect.parameter, effect.tableIndex);
	}

	static table(table: Table): Table {
		return new Table(table.id, [...table.rows], table.loop, table.name, table.additive);
	}

	static instrument(instrument: Instrument): Instrument {
		const cloned = new Instrument(
			instrument.id,
			instrument.name,
			instrument.chipType ?? 'ay'
		);
		if ((instrument.chipType ?? 'ay') === 'nes') {
			copyNesInstrumentFields(instrument, cloned);
		} else {
			copyAyInstrumentFields(instrument, cloned);
		}
		return cloned;
	}

	static instrumentRow(row: InstrumentRow): InstrumentRow {
		return new InstrumentRow(this.object(row as Record<string, unknown>));
	}

	private static object(value: object): Record<string, unknown> {
		const cloned: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			cloned[key] = this.value(nestedValue);
		}
		return cloned;
	}
}
