import { syncSharedEffectColumnLayout } from '../../../chips/base/channel-effect-columns';
import { applySchemaDefaults } from '../../../chips/base/schema';
import { SAA_CHIP_SCHEMA, SAA_SAM_CLOCK } from '../../../chips/saa/schema';
import { Project, Table } from '../../../models/project';
import { Effect, EffectType, Instrument, Note, NoteName, Pattern, Song } from '../../../models/song';
import { numberToInstrumentId } from '../../../utils/instrument-id';
import { MAX_TABLE_ID } from '../../../utils/table-id';

const SIGNATURE = 'ETracker (C) BY ESI.';
const EDITOR_SIZE = 78626;
const MAX_ROWS = 64;
const CHANNELS = 6;
const ETRACKER_A4_HZ = 415;
const ETRACKER_NOTE_PERIODS = [0x05, 0x21, 0x3c, 0x55, 0x6d, 0x84, 0x99, 0xad, 0xc0, 0xd2, 0xe3, 0xf3];

function ornamentSemitone(value: number): number {
	let offset = value & 255;
	if (offset >= 128) offset -= 256;
	if (offset >= 48) offset -= 96;
	else if (offset < -48) offset += 96;
	return offset;
}

function etrackerTuningTable(): number[] {
	const table: number[] = [];
	for (let note = 0; note < 96; note++) {
		const octave = Math.floor(note / 12);
		table.push((octave << 8) | ETRACKER_NOTE_PERIODS[note % 12]);
	}
	return table;
}

type Step = {
	left: number;
	right: number;
	tone: boolean;
	noise: boolean;
	noiseClock: number;
	pitch: number;
};

type SampleDef = {
	steps: Step[];
	loop: number;
	release?: number;
};

type Cell = {
	note: number | null;
	release: boolean;
	sample: number;
	ornament: number;
	attenuation: number | null;
	speed: number | null;
	noiseLock: number | null;
	envelope: number | null;
	invert: number | null;
};

type ParsedPattern = {
	channels: Cell[][];
	length: number;
	speed: number;
};

type OrderEntry = {
	pattern: number;
	transpose: number;
};

export class EtrackerFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'EtrackerFormatError';
	}
}

function pushEffect(
	pattern: Pattern,
	channelIndex: number,
	row: { effects: (Effect | null)[] },
	effect: Effect
) {
	const current = (row.effects ?? []).filter((entry): entry is Effect => entry != null);
	current.push(effect);
	row.effects = current;
	const channel = pattern.channels[channelIndex];
	if (channel && current.length > channel.effectColumnCount) {
		channel.effectColumnCount = Math.min(4, current.length);
	}
}

function blankCell(): Cell {
	return {
		note: null,
		release: false,
		sample: 0,
		ornament: 0,
		attenuation: null,
		speed: null,
		noiseLock: null,
		envelope: null,
		invert: null
	};
}

function silentStep(): Step {
	return { left: 0, right: 0, tone: false, noise: false, noiseClock: 0, pitch: 0 };
}

function readU16(data: Uint8Array, offset: number): number {
	if (offset < 0 || offset + 1 >= data.length) {
		throw new EtrackerFormatError('E-Tracker file ended early');
	}
	return data[offset] | (data[offset + 1] << 8);
}

function byteAt(data: Uint8Array, offset: number): number {
	if (offset < 0 || offset >= data.length) {
		throw new EtrackerFormatError('E-Tracker file ended early');
	}
	return data[offset];
}

export function isEtrackerBuffer(buffer: ArrayBuffer): boolean {
	const data = new Uint8Array(buffer);
	if (compiledOffset(data) >= 0) return true;
	return looksLikeEditorModule(data);
}

function compiledOffset(data: Uint8Array): number {
	const limit = Math.min(data.length - SIGNATURE.length, 4096);
	for (let offset = 0; offset <= limit; offset++) {
		if (offset + 10 + SIGNATURE.length > data.length) break;
		let match = true;
		for (let index = 0; index < SIGNATURE.length; index++) {
			if (data[offset + 10 + index] !== SIGNATURE.charCodeAt(index)) {
				match = false;
				break;
			}
		}
		if (match) return offset;
	}
	return -1;
}

function looksLikeEditorModule(data: Uint8Array): boolean {
	if (data.length !== EDITOR_SIZE) return false;
	for (let pattern = 0; pattern < 32; pattern++) {
		if (data[0x300 + pattern] > MAX_ROWS) return false;
	}
	const positions = data[0x320];
	return positions >= 1 && positions <= 128;
}

function noteFromSemitone(index: number): Note {
	let semitone = index | 0;
	while (semitone >= 256) semitone -= 0x60;
	if (semitone < 0) semitone = 0;
	if (semitone > 95) semitone = 95;
	return new Note((semitone % 12) + NoteName.C, Math.floor(semitone / 12) + 1);
}

function finishSample(steps: Step[], loop: number, end: number, releasable: boolean, tail: number): SampleDef {
	if (end <= 0) return { steps: [silentStep()], loop: 0 };
	if (releasable) {
		const length = Math.max(end, Math.min(256, tail));
		return { steps: steps.slice(0, length), loop, release: end };
	}
	const played = steps.slice(0, end);
	if (loop >= end) {
		played.push(silentStep());
		return { steps: played, loop: played.length - 1 };
	}
	return { steps: played, loop };
}

function macroValues<T>(values: T[], loop: number, release?: number) {
	const macro: { values: T[]; loop: number; release?: number } = { values, loop };
	if (release !== undefined && release >= 0 && release < values.length) macro.release = release;
	return macro;
}

function instrumentFromSample(index: number, sample: SampleDef): Instrument {
	const { steps, loop, release } = sample;
	const instrument = new Instrument(numberToInstrumentId(index), `Sample ${numberToInstrumentId(index)}`, 'saa');
	instrument.macros = {
		left: macroValues(steps.map((step) => step.left), loop, release),
		right: macroValues(steps.map((step) => step.right), loop, release),
		amplitudeSlide: macroValues(steps.map(() => 0), loop, release),
		tone: macroValues(steps.map((step) => step.tone), loop, release),
		toneAdd: macroValues(
			steps.map((step) => {
				const offset = Math.max(-2048, Math.min(2047, -step.pitch));
				return offset === 0 ? 0 : offset;
			}),
			loop,
			release
		),
		toneAccumulation: macroValues(steps.map(() => false), loop, release),
		noise: macroValues(steps.map((step) => step.noise), loop, release),
		noiseAdd: macroValues(
			steps.map((step) => Math.max(-3, Math.min(3, step.noiseClock))),
			loop,
			release
		),
		noiseAccumulation: macroValues(steps.map(() => false), loop, release)
	};
	return instrument;
}

function parseCompiledChannel(data: Uint8Array, start: number): {
	cells: Cell[];
	length: number;
	speed: number;
	speedSet: boolean;
} {
	const cells: Cell[] = [];
	let cell = blankCell();
	let line = 0;
	let speed = 6;
	let speedSet = false;
	let ptr = start;
	while (line < MAX_ROWS && ptr < data.length) {
		let value = byteAt(data, ptr++);
		if (value < 15) {
			const next = value + 1;
			if (line === 0) {
				speed = next;
				speedSet = true;
			} else {
				cell.speed = next;
			}
			continue;
		}
		value -= 15;
		if (value < 2) {
			cell.noiseLock = value;
			continue;
		}
		value -= 2;
		if (value < 16) {
			cell.attenuation = value;
			continue;
		}
		value -= 16;
		if (value < 13) {
			cell.envelope = value;
			continue;
		}
		value -= 13;
		if (value < 2) {
			cell.invert = value;
			continue;
		}
		value -= 2;
		if (value < 31) {
			cell.ornament = value + 1;
			continue;
		}
		if (value === 31) continue;
		if (value === 32) {
			cell.release = true;
			cell.note = null;
			cell.sample = 0;
			cell.ornament = 0;
			continue;
		}
		value -= 34;
		if (value < 0) return { cells, length: line, speed, speedSet };
		if (value < 31) {
			cell.sample = value + 1;
			continue;
		}
		if (value === 31) {
			cell.sample = 0;
			continue;
		}
		value -= 32;
		if (value < 96) {
			cell.note = value;
			continue;
		}
		cells[line] = cell;
		line += value - 95;
		cell = blankCell();
	}
	return { cells, length: Math.min(line, MAX_ROWS), speed, speedSet };
}

function parseCompiledPattern(data: Uint8Array, offset: number, index: number): ParsedPattern {
	let ptr = offset + index * 12;
	const channels: Cell[][] = [];
	let speed = 6;
	let length = 0;
	for (let channel = 0; channel < CHANNELS; channel++) {
		const stream = readU16(data, ptr);
		ptr += 2;
		const parsed = parseCompiledChannel(data, stream);
		channels.push(parsed.cells);
		if (parsed.speedSet) speed = parsed.speed;
		length = Math.max(length, parsed.length);
	}
	return { channels, length: Math.max(1, length), speed };
}

function parseCompiledSamples(data: Uint8Array, samplesOffset: number, ornamentsOffset: number, infoOffset: number): SampleDef[] {
	const repeats = new Map<number, number>();
	for (let cursor = infoOffset + 1; cursor < data.length && data[cursor]; cursor += 2) {
		repeats.set(data[cursor], data[cursor + 1] ?? 1);
	}
	const marker = byteAt(data, infoOffset);
	const samples: SampleDef[] = [];
	for (let ptr = samplesOffset; ptr + 1 < ornamentsOffset; ptr += 2) {
		let cursor = readU16(data, ptr);
		const steps: Step[] = [];
		let loopPos = -1;
		let pitchRepeats = 1;
		let volumeRepeats = 1;
		let pitch = 0;
		let left = 0;
		let right = 0;
		let tone = false;
		let noise = false;
		let noiseClock = 0;
		let finished = false;
		const pushStep = () => {
			if (!(--volumeRepeats)) {
				const mark = byteAt(data, cursor++);
				if (mark === marker) {
					volumeRepeats = byteAt(data, cursor++);
					const level = byteAt(data, cursor++);
					left = level & 15;
					right = level >> 4;
				} else if (repeats.has(mark)) {
					volumeRepeats = repeats.get(mark) ?? 1;
					const level = byteAt(data, cursor++);
					left = level & 15;
					right = level >> 4;
				} else {
					volumeRepeats = 1;
					left = mark & 15;
					right = mark >> 4;
				}
			}
			steps.push({ left, right, tone, noise, noiseClock, pitch });
		};
		const readPitch = (): boolean => {
			let packed = byteAt(data, cursor++);
			const hasPitch = (packed & 1) !== 0;
			packed >>= 1;
			if (!hasPitch) {
				if (packed === 0x7f) {
					loopPos = steps.length;
					return true;
				}
				if (packed === 0x7e) return false;
				pitchRepeats = packed + 2;
				return readPitch();
			}
			noiseClock = (packed & 0x60) >> 5;
			tone = (packed & 8) !== 0;
			noise = (packed & 16) !== 0;
			pitch = ((packed & 7) << 8) | byteAt(data, cursor++);
			if (pitch >= 1024) pitch -= 2048;
			pushStep();
			return true;
		};
		while (!finished) {
			if (--pitchRepeats) {
				pushStep();
			} else {
				pitchRepeats = 1;
				finished = !readPitch();
			}
		}
		const end = steps.length;
		samples.push(finishSample(steps, loopPos < 0 ? end : loopPos, end, false, end));
	}
	return samples;
}

function parseCompiledOrnaments(data: Uint8Array, ornamentsOffset: number, infoOffset: number): Map<number, number[]> {
	const ornaments = new Map<number, number[]>();
	let number = 1;
	for (let ptr = ornamentsOffset; ptr + 1 < infoOffset; ptr += 2, number++) {
		let cursor = readU16(data, ptr);
		const lines: number[] = [];
		let loopPos = -1;
		let repeats = 1;
		let finished = false;
		while (!finished && cursor < data.length) {
			const value = byteAt(data, cursor++);
			if (value === 0xff) {
				if (lines.length === 1 && loopPos < 0 && lines[0] === 0) break;
				finished = true;
				break;
			}
			if (value === 0xfe) {
				loopPos = lines.length;
				continue;
			}
			if (value >= 0x60) {
				repeats = value - (0x60 - 2);
				continue;
			}
			while (repeats-- > 0) lines.push(ornamentSemitone(value));
			repeats = 1;
		}
		if (lines.length === 0) continue;
		const loop = loopPos < 0 ? lines.length : loopPos;
		if (loop >= lines.length) lines.push(0);
		ornaments.set(number, lines);
	}
	return ornaments;
}

function parseCompiledOrder(data: Uint8Array, offset: number): { entries: OrderEntry[]; loop: number } {
	const entries: OrderEntry[] = [];
	let transpose = 0;
	let loop = 0;
	let cursor = offset;
	while (cursor < data.length) {
		const value = data[cursor++];
		if (value === 0xff) break;
		if (value === 0xfe) {
			loop = entries.length;
			continue;
		}
		if (value >= 0x60) {
			transpose = value - 0x60;
			continue;
		}
		if (value % 3 !== 0) {
			throw new EtrackerFormatError('E-Tracker order points at a pattern that is not on a 3-byte boundary');
		}
		entries.push({ pattern: value / 3, transpose });
	}
	if (entries.length === 0) throw new EtrackerFormatError('E-Tracker module has no order');
	return { entries, loop };
}

function parseCompiled(data: Uint8Array): {
	samples: SampleDef[];
	ornaments: Map<number, number[]>;
	patterns: Map<number, ParsedPattern>;
	order: OrderEntry[];
	loop: number;
} {
	const positions = readU16(data, 0);
	const patterns = readU16(data, 2);
	const samples = readU16(data, 4);
	const ornaments = readU16(data, 6);
	const info = readU16(data, 8);
	if (
		samples >= ornaments ||
		ornaments >= info ||
		info >= positions ||
		positions >= patterns ||
		patterns >= data.length
	) {
		throw new EtrackerFormatError('E-Tracker compilation pointers are out of order');
	}
	const order = parseCompiledOrder(data, positions);
	const patternMap = new Map<number, ParsedPattern>();
	for (const entry of order.entries) {
		if (!patternMap.has(entry.pattern)) {
			patternMap.set(entry.pattern, parseCompiledPattern(data, patterns, entry.pattern));
		}
	}
	return {
		samples: parseCompiledSamples(data, samples, ornaments, info),
		ornaments: parseCompiledOrnaments(data, ornaments, info),
		patterns: patternMap,
		order: order.entries,
		loop: order.loop
	};
}

function parseEditorSamples(data: Uint8Array): SampleDef[] {
	const samples: SampleDef[] = [];
	let cursor = 0xb322;
	for (let sample = 0; sample < 31; sample++) {
		const info = sample * 4;
		const loopEnd = data[info] ?? 0;
		const loopStart = data[info + 1] ?? 0;
		const fixedLen = data[info + 2] ?? 0;
		const steps: Step[] = [];
		for (let step = 0; step < 256; step++) {
			const volume = data[cursor] ?? 0;
			const flags = data[cursor + 1] ?? 0;
			const pitchLow = data[cursor + 2] ?? 0;
			const pitchHigh = data[cursor + 3] ?? 0;
			cursor += 4;
			let pitch = ((pitchHigh & 7) << 8) | pitchLow;
			if (pitchHigh & 0x80) pitch = -pitch;
			steps.push({
				left: volume & 15,
				right: volume >> 4,
				tone: (flags & 4) !== 0,
				noise: (flags & 8) !== 0,
				noiseClock: flags & 3,
				pitch
			});
		}
		let end = 0;
		let loop = 0;
		let releasable = false;
		if (loopEnd < fixedLen) {
			if (loopStart) {
				end = loopEnd + 1;
				loop = loopStart;
				releasable = true;
			} else {
				end = fixedLen + 1;
				loop = end;
			}
		} else if (loopStart || loopEnd) {
			end = loopEnd + 1;
			loop = loopStart;
		}
		samples.push(finishSample(steps, loop, end, releasable, fixedLen + 1));
	}
	return samples;
}

function parseEditorOrnaments(data: Uint8Array): Map<number, number[]> {
	const ornaments = new Map<number, number[]>();
	for (let ornament = 1; ornament < 32; ornament++) {
		const info = 128 + (ornament - 1) * 4;
		const raw = data.subarray(0x9322 + (ornament - 1) * 256, 0x9322 + ornament * 256);
		if (!raw.some((value) => value !== 0)) continue;
		const loopEnd = data[info] ?? 0;
		const loopStart = data[info + 1] ?? 0;
		const fixedLen = data[info + 2] ?? 0;
		const end = (loopEnd | fixedLen) + 1;
		let loop = fixedLen ? fixedLen + 1 : loopStart;
		const lines = Array.from(raw.subarray(0, Math.min(end, raw.length)), (value) =>
			ornamentSemitone(value)
		);
		if (lines.length === 0) continue;
		if (loop >= lines.length) {
			lines.push(0);
			loop = lines.length - 1;
		}
		ornaments.set(ornament, lines);
	}
	return ornaments;
}

function parseEditorCell(data: Uint8Array, pattern: number, line: number, channel: number, lastVolume: number): {
	cell: Cell;
	lastVolume: number;
} {
	const offset = 0x322 + ((pattern * MAX_ROWS + line) * CHANNELS + channel) * 3;
	const first = data[offset] ?? 0;
	const second = data[offset + 1] ?? 0;
	const third = data[offset + 2] ?? 0;
	const cell = blankCell();
	const tone = first & 0x0f;
	const octave = (first & 0x70) >> 4;
	if (tone < 12) cell.note = octave * 12 + tone;
	const sample = ((second & 0xf0) >> 4) | ((first & 0x80) >> 3);
	cell.sample = (sample + 1) % 32;
	const ornament = ((third & 0x80) >> 3) | (second & 0x0f);
	if (ornament === 31) cell.ornament = 0;
	else cell.ornament = ornament + 1;
	let volume = lastVolume;
	if (cell.note !== null && volume < 15) {
		cell.attenuation = 0;
		volume = 15;
	}
	const command = (third & 0x70) >> 4;
	let argument = third & 0x0f;
	if (command === 1 && argument > 0 && argument <= 12) cell.envelope = argument;
	else if (command === 1) cell.envelope = 0;
	else if (command === 2) cell.invert = argument & 1;
	else if (command === 3) {
		if (line === 0) cell.speed = Math.max(1, argument);
		else cell.speed = Math.max(1, argument);
	} else if (command === 4) {
		argument = (argument | (argument << 4)) ^ 0xff;
		const level = argument & 15;
		if (level === 0) {
			cell.release = true;
			cell.note = null;
			cell.sample = 0;
			cell.ornament = 0;
			cell.attenuation = null;
			volume = 0;
		} else {
			cell.attenuation = 15 - level;
			volume = level;
		}
	} else if (command === 5) cell.noiseLock = argument & 1;
	else if (command === 6) {
		cell.release = true;
		cell.note = null;
		cell.sample = 0;
		cell.ornament = 0;
	}
	return { cell, lastVolume: volume };
}

function parseEditor(data: Uint8Array): {
	samples: SampleDef[];
	ornaments: Map<number, number[]>;
	patterns: Map<number, ParsedPattern>;
	order: OrderEntry[];
	loop: number;
} {
	const count = data[0x320] ?? 0;
	const loop = data[0x321] ?? 0;
	const order: OrderEntry[] = [];
	for (let index = 0; index < count; index++) {
		order.push({ pattern: data[0x100 + index * 2] ?? 0, transpose: 0 });
	}
	if (order.length === 0) throw new EtrackerFormatError('E-Tracker module has no order');
	const volumes = Array.from({ length: CHANNELS }, () => -1);
	const patterns = new Map<number, ParsedPattern>();
	for (const entry of order) {
		if (patterns.has(entry.pattern) || entry.pattern > 31) continue;
		const length = data[0x300 + entry.pattern] ?? 0;
		const channels: Cell[][] = Array.from({ length: CHANNELS }, () => []);
		let speed = 6;
		const rows = Math.max(1, Math.min(MAX_ROWS, length || 1));
		for (let line = 0; line < rows; line++) {
			for (let channel = 0; channel < CHANNELS; channel++) {
				const parsed = parseEditorCell(data, entry.pattern, line, channel, volumes[channel] ?? -1);
				volumes[channel] = parsed.lastVolume;
				if (line === 0 && parsed.cell.speed) {
					speed = parsed.cell.speed;
					parsed.cell.speed = null;
				}
				channels[channel][line] = parsed.cell;
			}
		}
		patterns.set(entry.pattern, { channels, length: rows, speed });
	}
	return {
		samples: parseEditorSamples(data),
		ornaments: parseEditorOrnaments(data),
		patterns,
		order,
		loop
	};
}

function buildProject(
	title: string,
	parsed: {
		samples: SampleDef[];
		ornaments: Map<number, number[]>;
		patterns: Map<number, ParsedPattern>;
		order: OrderEntry[];
		loop: number;
	}
): Project {
	const instruments = parsed.samples.map((sample, index) => instrumentFromSample(index + 1, sample));
	const ornamentTables = new Map<number, number>();
	const tables: Table[] = [];
	for (const [number, lines] of parsed.ornaments) {
		const id = number - 1;
		if (id < 0 || id > MAX_TABLE_ID) continue;
		const loopAt = lines.length > 1 && lines[lines.length - 1] === 0 ? lines.length - 1 : 0;
		const loop = lines.length > 1 && parsed.ornaments.get(number)?.length === lines.length ? loopAt : 0;
		tables.push(new Table(id, lines, loop > 0 && loop < lines.length ? loop : 0, `Ornament ${number.toString(36).toUpperCase()}`));
		ornamentTables.set(number, number);
	}
	if (tables.length === 0) tables.push(new Table(0, [], 0, 'Table 1'));

	const releasable = new Set(
		parsed.samples.flatMap((sample, index) => (sample.release !== undefined ? [index + 1] : []))
	);
	const built = new Map<string, Pattern>();
	const orderIds: number[] = [];
	for (const entry of parsed.order) {
		const source = parsed.patterns.get(entry.pattern);
		if (!source) throw new EtrackerFormatError('E-Tracker order uses a missing pattern');
		const key = `${entry.pattern}:${entry.transpose}`;
		let pattern = built.get(key);
		if (!pattern) {
			pattern = new Pattern(built.size, source.length, SAA_CHIP_SCHEMA);
			const latched = Array.from({ length: CHANNELS }, () => 0);
			for (let line = 0; line < source.length; line++) {
				for (let channel = 0; channel < CHANNELS; channel++) {
					const cell = source.channels[channel]?.[line] ?? blankCell();
					const row = pattern.channels[channel].rows[line];
					if (cell.release) {
						const sample = latched[channel] ?? 0;
						row.note = new Note(releasable.has(sample) ? NoteName.Release : NoteName.Off, 0);
					} else if (cell.note !== null) {
						row.note = noteFromSemitone(cell.note + entry.transpose);
					}
					if (cell.sample > 0) {
						row.instrument = cell.sample;
						latched[channel] = cell.sample;
					}
					if (cell.ornament > 0) row.table = ornamentTables.get(cell.ornament) ?? -1;
					if (cell.speed) {
						pushEffect(pattern, channel, row, new Effect(EffectType.Speed, 0, cell.speed));
					}
					if (cell.envelope !== null) {
						const field = channel < 3 ? 'env0' : 'env1';
						pattern.patternRows[line][field] = cell.envelope === 0 ? -1 : cell.envelope;
					}
					if (cell.invert !== null) {
						pushEffect(pattern, channel, row, new Effect(EffectType.ChipSpecific, 1, cell.invert));
					}
					if (cell.attenuation !== null) {
						const level = 15 - (cell.attenuation & 15);
						const side = level <= 0 ? -1 : level;
						row.left = side;
						row.right = side;
					}
					if (cell.noiseLock !== null) {
						pushEffect(pattern, channel, row, new Effect(EffectType.ChipSpecific, 2, cell.noiseLock));
					}
				}
			}
			const lead = pattern.channels[0].rows[0];
			if (!lead.effects?.some((effect) => effect?.effect === EffectType.Speed)) {
				pushEffect(pattern, 0, lead, new Effect(EffectType.Speed, 0, source.speed));
			}
			built.set(key, pattern);
		}
		orderIds.push(pattern.id);
	}

	const song = new Song(SAA_CHIP_SCHEMA);
	song.chipType = 'saa';
	applySchemaDefaults(song, SAA_CHIP_SCHEMA);
	song.chipFrequency = SAA_SAM_CLOCK;
	song.interruptFrequency = 50;
	song.a4TuningHz = ETRACKER_A4_HZ;
	song.tuningTable = etrackerTuningTable();
	song.patterns = [...built.values()];
	syncSharedEffectColumnLayout(song.patterns);
	song.defaultPatternLength = song.patterns[0]?.length ?? MAX_ROWS;
	const speed = parsed.patterns.get(parsed.order[0]?.pattern ?? 0)?.speed ?? 6;
	const loop = Math.min(Math.max(0, parsed.loop), Math.max(0, orderIds.length - 1));
	return new Project(title, '', [song], loop, orderIds, tables, {}, instruments, speed, 0);
}

export function importEtrackerBuffer(buffer: ArrayBuffer, fallbackName = ''): {
	project: Project;
	warnings: string[];
} {
	const data = new Uint8Array(buffer);
	const offset = compiledOffset(data);
	const warnings: string[] = [];
	const parsed =
		offset >= 0
			? parseCompiled(data.subarray(offset))
			: looksLikeEditorModule(data)
				? parseEditor(data)
				: null;
	if (!parsed) throw new EtrackerFormatError('Not an E-Tracker module');
	return { project: buildProject(fallbackName, parsed), warnings };
}

export async function loadEtrackerFile(file: File): Promise<Project> {
	const buffer = await file.arrayBuffer();
	const stem = file.name.replace(/\.[^.]+$/, '');
	const { project, warnings } = importEtrackerBuffer(buffer, stem);
	for (const warning of warnings) console.warn(`E-Tracker import: ${warning}`);
	return project;
}
