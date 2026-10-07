import {
	AY_CHIP_SCHEMA,
	SUNSOFT_5B_CHIP_FREQUENCY,
	resolveAYTuningTable
} from '../../../chips/ay/schema';
import {
	NES_CHIP_SCHEMA,
	resolveNesCpuFrequency,
	resolveNesTuningTable
} from '../../../chips/nes/schema';
import type { NesSystem } from '../../../chips/nes/schema';
import {
	copyNesDpcmFields,
	padDpcmBytes,
	type NesDpcmAssignment,
	type NesDpcmSample
} from '../../../chips/nes/dpcm';
import { applySchemaDefaults, type ChipSchema } from '../../../chips/base/schema';
import {
	MAX_CHANNEL_EFFECT_COLUMNS,
	syncSharedEffectColumnLayout
} from '../../../chips/base/channel-effect-columns';
import { Project, Table } from '../../../models/project';
import {
	Effect,
	EffectType,
	Instrument,
	Note,
	NoteName,
	Pattern,
	Row,
	Song
} from '../../../models/song';
import { numberToInstrumentId } from '../../../utils/instrument-id';

const FILE_HEADER = 'FamiTracker Module';
const DN_FILE_HEADER = 'Dn-FamiTracker Module';
const NES_CHANNEL_COUNT = 5;
const S5B_CHANNEL_COUNT = 3;
const S5B_EXPANSION = 0x20;
const INST_2A03 = 1;
const INST_S5B = 6;
const S5B_MODE_ENVELOPE = 0x20;
const S5B_MODE_SQUARE = 0x40;
const S5B_MODE_NOISE = 0x80;
const MAX_FT_INSTRUMENTS = 64;
const MAX_FT_SAMPLES = 64;
const MAX_SEQUENCE_ITEMS = 253;
const SEQUENCE_TYPES = 5;
const DEFAULT_SPEED = 6;
const DEFAULT_TEMPO_NTSC = 150;
const DEFAULT_TEMPO_PAL = 125;
const DEFAULT_SPEED_SPLIT = 32;
const OLD_SPEED_SPLIT = 21;
const TONE_ADD_MIN = -4096;
const TONE_ADD_MAX = 4095;
const PERIOD_UP = EffectType.SlideUp;
const PERIOD_DOWN = EffectType.SlideDown;

const EFFECT_LETTERS = [
	'F',
	'B',
	'D',
	'C',
	'E',
	'3',
	'',
	'H',
	'I',
	'0',
	'4',
	'7',
	'P',
	'G',
	'Z',
	'1',
	'2',
	'V',
	'Y',
	'Q',
	'R',
	'A',
	'S',
	'X'
];

const EXPANSION_NAMES: [number, string][] = [
	[0x01, 'VRC6'],
	[0x02, 'VRC7'],
	[0x04, 'FDS'],
	[0x08, 'MMC5'],
	[0x10, 'N163'],
	[0x20, '5B']
];

const INST_TYPE_NAMES = ['', '2A03', 'VRC6', 'VRC7', 'FDS', 'N163', '5B'];

const QUIET_BLOCKS = new Set([
	'COMMENTS',
	'PARAMS',
	'INFO',
	'HEADER',
	'INSTRUMENTS',
	'SEQUENCES',
	'SEQUENCES_S5B',
	'FRAMES',
	'PATTERNS',
	'DPCM SAMPLES',
	'END'
]);

export class FtmFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FtmFormatError';
	}
}

export type FtmImportResult = {
	project: Project;
	warnings: string[];
};

type FtmBlock = {
	name: string;
	version: number;
	data: Uint8Array;
};

type FtmSequence = {
	values: number[];
	loopPoint: number;
	releasePoint: number;
	settings: number;
};

type FtmCell = {
	note: number;
	octave: number;
	instrument: number;
	volume: number;
	effects: { number: number; param: number }[];
};

type FtmSample = {
	name: string;
	data: number[];
};

type FtmInstrument = {
	index: number;
	type: number;
	name: string;
	seqEnable: boolean[];
	seqIndex: number[];
	samples: number[];
	pitch: number[];
	delta: Array<number | null>;
};

class BlockReader {
	private offset = 0;

	constructor(private readonly data: Uint8Array) {}

	remaining(): number {
		return this.data.length - this.offset;
	}

	private need(size: number): void {
		if (this.offset + size > this.data.length) {
			throw new FtmFormatError('FamiTracker module ended inside a block');
		}
	}

	u8(): number {
		this.need(1);
		return this.data[this.offset++]!;
	}

	i8(): number {
		const value = this.u8();
		return value < 128 ? value : value - 256;
	}

	i32(): number {
		this.need(4);
		const value =
			this.data[this.offset]! |
			(this.data[this.offset + 1]! << 8) |
			(this.data[this.offset + 2]! << 16) |
			(this.data[this.offset + 3]! << 24);
		this.offset += 4;
		return value;
	}

	bytes(size: number): Uint8Array {
		this.need(size);
		const slice = this.data.subarray(this.offset, this.offset + size);
		this.offset += size;
		return slice;
	}

	cstr(): string {
		let text = '';
		for (;;) {
			const value = this.u8();
			if (value === 0) return text;
			text += String.fromCharCode(value);
			if (text.length > 65536) {
				throw new FtmFormatError('FamiTracker string is too long');
			}
		}
	}
}

function latin1(bytes: Uint8Array): string {
	let text = '';
	for (const value of bytes) {
		if (value === 0) break;
		text += String.fromCharCode(value);
	}
	return text;
}

function blockName(bytes: Uint8Array): string {
	const end = bytes.indexOf(0);
	const slice = end < 0 ? bytes : bytes.subarray(0, end);
	return latin1(slice);
}

function headerLength(buffer: ArrayBuffer): number {
	const bytes = new Uint8Array(buffer);
	if (
		bytes.length >= DN_FILE_HEADER.length &&
		latin1(bytes.subarray(0, DN_FILE_HEADER.length)) === DN_FILE_HEADER
	) {
		return DN_FILE_HEADER.length;
	}
	if (
		bytes.length >= FILE_HEADER.length &&
		latin1(bytes.subarray(0, FILE_HEADER.length)) === FILE_HEADER
	) {
		return FILE_HEADER.length;
	}
	return 0;
}

export function isFtmBuffer(buffer: ArrayBuffer): boolean {
	return headerLength(buffer) > 0 && buffer.byteLength >= headerLength(buffer) + 4;
}

function readBlocks(buffer: ArrayBuffer): {
	version: number;
	blocks: FtmBlock[];
	dnModule: boolean;
} {
	const header = headerLength(buffer);
	if (header === 0) {
		throw new FtmFormatError('Not a FamiTracker module');
	}
	const bytes = new Uint8Array(buffer);
	let offset = header;
	if (offset + 4 > bytes.length) {
		throw new FtmFormatError('FamiTracker module header is truncated');
	}
	const version =
		bytes[offset]! |
		(bytes[offset + 1]! << 8) |
		(bytes[offset + 2]! << 16) |
		(bytes[offset + 3]! << 24);
	offset += 4;
	const blocks: FtmBlock[] = [];
	while (offset + 24 <= bytes.length) {
		const name = blockName(bytes.subarray(offset, offset + 16));
		offset += 16;
		const blockVersion =
			bytes[offset]! |
			(bytes[offset + 1]! << 8) |
			(bytes[offset + 2]! << 16) |
			(bytes[offset + 3]! << 24);
		offset += 4;
		const size =
			(bytes[offset]! |
				(bytes[offset + 1]! << 8) |
				(bytes[offset + 2]! << 16) |
				(bytes[offset + 3]! << 24)) >>>
			0;
		offset += 4;
		if (size > 50_000_000 || offset + size > bytes.length) {
			throw new FtmFormatError(`FamiTracker block ${name || '(empty)'} is truncated`);
		}
		const data = bytes.subarray(offset, offset + size);
		offset += size;
		if (name === 'END') break;
		blocks.push({ name, version: blockVersion, data });
	}
	return { version, blocks, dnModule: header === DN_FILE_HEADER.length };
}

function findBlock(blocks: FtmBlock[], name: string): FtmBlock | undefined {
	return blocks.find((block) => block.name === name);
}

function clampTone(value: number): number {
	return Math.max(TONE_ADD_MIN, Math.min(TONE_ADD_MAX, value));
}

function holdLoop(loopPoint: number, length: number): number {
	if (length <= 0) return 0;
	if (loopPoint < 0 || loopPoint >= length) return length - 1;
	return loopPoint;
}

function sampleSequence(sequence: FtmSequence, index: number): number {
	const length = sequence.values.length;
	if (length === 0) return 0;
	if (index < length) return sequence.values[index]!;
	const loop = holdLoop(sequence.loopPoint, length);
	const span = length - loop;
	if (span <= 0) return sequence.values[length - 1]!;
	return sequence.values[loop + ((index - length) % span)]!;
}

export function importFtmBuffer(buffer: ArrayBuffer, fallbackName = ''): FtmImportResult {
	const { version, blocks, dnModule } = readBlocks(buffer);
	const warnings: string[] = [];
	const warnOnce = new Set<string>();
	const note = (message: string) => {
		if (warnOnce.has(message)) return;
		warnOnce.add(message);
		warnings.push(message);
	};

	for (const block of blocks) {
		if (!QUIET_BLOCKS.has(block.name)) {
			note(`Skipped FamiTracker block ${block.name}`);
		}
	}

	const params = readParams(findBlock(blocks, 'PARAMS'));
	const info = readInfo(findBlock(blocks, 'INFO'));
	const s5bModule =
		(params.expansion & S5B_EXPANSION) !== 0 &&
		params.channels === NES_CHANNEL_COUNT + S5B_CHANNEL_COUNT;
	if (dnModule && params.expansion !== 0 && !s5bModule) {
		throw new FtmFormatError('Only NES and NES + 5B Dn-FamiTracker modules can be imported');
	}
	if (!s5bModule && params.expansion !== 0) {
		const names = EXPANSION_NAMES.filter(([bit]) => params.expansion & bit).map(
			([, name]) => name
		);
		note(
			`Expansion chip ${names.join(', ') || params.expansion.toString(16)} was skipped; only 2A03 channels were imported`
		);
	}

	const header = readHeader(findBlock(blocks, 'HEADER'), params.channels);
	const sequences = readSequences(findBlock(blocks, 'SEQUENCES'));
	const s5bSequences = s5bModule ? readS5bSequences(findBlock(blocks, 'SEQUENCES_S5B')) : [];
	const instruments = readInstruments(findBlock(blocks, 'INSTRUMENTS'));
	const frames = readFrames(
		findBlock(blocks, 'FRAMES'),
		header.trackCount,
		params.machine,
		params.channels
	);
	const samples = readSamples(findBlock(blocks, 'DPCM SAMPLES'), note);
	const cells = readPatterns(findBlock(blocks, 'PATTERNS'), header.effectColumns, version);

	if (frames.length === 0) {
		throw new FtmFormatError('FamiTracker module has no songs');
	}
	if (header.trackCount > 1) {
		note('Bitphase keeps one order list, taken from the first song');
	}
	const skippedEffects = new Set<string>();
	const arpTables = buildArpTables(instruments, sequences, s5bSequences, note);
	const projectInstruments = instruments.map((instrument) =>
		toInstrument(instrument, sequences, s5bSequences, samples, note)
	);
	if (projectInstruments.length === 0) {
		projectInstruments.push(new Instrument('01', 'Instrument 01', 'nes'));
	}

	const songs = frames.flatMap((track, trackIndex) => {
		const columns = header.effectColumns[trackIndex] ?? header.effectColumns[0] ?? [];
		const trackCells = cells.get(trackIndex) ?? new Map();
		const nesSong = toSong(
			track,
			columns,
			trackCells,
			params,
			skippedEffects,
			arpTables.byInstrument
		);
		if (!s5bModule) return [nesSong];
		return [
			nesSong,
			toAySong(
				track,
				columns,
				trackCells,
				params,
				skippedEffects,
				arpTables.byInstrument,
				note
			)
		];
	});

	if (skippedEffects.size > 0) {
		note(`Skipped FamiTracker effects ${[...skippedEffects].sort().join(', ')}`);
	}

	const firstOrder = songs[0]!.patterns.map((pattern) => pattern.id);
	return {
		project: new Project(
			info.title || fallbackName,
			info.artist,
			songs,
			0,
			firstOrder.length > 0 ? firstOrder : [0],
			arpTables.tables,
			{},
			projectInstruments
		),
		warnings
	};
}

type FtmParams = {
	expansion: number;
	channels: number;
	machine: NesSystem;
	engineHz: number;
	speedSplit: number;
	vibratoNew: boolean;
};

function readParams(block: FtmBlock | undefined): FtmParams {
	if (!block) {
		throw new FtmFormatError('FamiTracker module has no PARAMS block');
	}
	const reader = new BlockReader(block.data);
	let expansion = 0;
	if (block.version === 1) {
		reader.i32();
	} else {
		expansion = reader.u8();
	}
	const channels = reader.i32();
	const machine = reader.i32() === 1 ? 'PAL' : 'NTSC';
	const engineSpeed = reader.i32();
	let vibratoNew = block.version >= 7;
	if (block.version > 2) {
		const vibratoStyle = reader.i32();
		if (block.version < 7) vibratoNew = vibratoStyle !== 0;
	}
	if (block.version > 3) {
		reader.i32();
		reader.i32();
	}
	if (block.version >= 5 && expansion & 0x10) reader.i32();
	const speedSplit = block.version >= 6 ? reader.i32() : OLD_SPEED_SPLIT;
	const engineHz = engineSpeed > 0 ? engineSpeed : machine === 'PAL' ? 50 : 60;
	return {
		expansion,
		channels: Math.max(NES_CHANNEL_COUNT, channels),
		machine,
		engineHz,
		speedSplit: speedSplit > 0 ? speedSplit : DEFAULT_SPEED_SPLIT,
		vibratoNew
	};
}

function readInfo(block: FtmBlock | undefined): { title: string; artist: string } {
	if (!block || block.data.length < 96) return { title: '', artist: '' };
	return {
		title: latin1(block.data.subarray(0, 32)).trim(),
		artist: latin1(block.data.subarray(32, 64)).trim()
	};
}

function readHeader(
	block: FtmBlock | undefined,
	channelCount: number
): { trackCount: number; effectColumns: number[][] } {
	if (!block) {
		return { trackCount: 1, effectColumns: [Array(NES_CHANNEL_COUNT).fill(1)] };
	}
	const reader = new BlockReader(block.data);
	if (block.version === 1) {
		const columns: number[] = [];
		for (let channel = 0; channel < channelCount && reader.remaining() >= 2; channel++) {
			reader.u8();
			columns.push(Math.min(4, reader.u8() + 1));
		}
		return { trackCount: 1, effectColumns: [columns] };
	}
	const trackCount = reader.u8() + 1;
	if (block.version >= 3) {
		for (let track = 0; track < trackCount; track++) reader.cstr();
	}
	const effectColumns = Array.from({ length: trackCount }, () => [] as number[]);
	for (let channel = 0; channel < channelCount && reader.remaining() > 0; channel++) {
		reader.u8();
		for (let track = 0; track < trackCount && reader.remaining() > 0; track++) {
			effectColumns[track]!.push(Math.min(4, reader.u8() + 1));
		}
	}
	return { trackCount, effectColumns };
}

function readSequences(block: FtmBlock | undefined): FtmSequence[][] {
	const sequences: FtmSequence[][] = Array.from({ length: 128 }, () =>
		Array.from({ length: SEQUENCE_TYPES }, () => ({
			values: [],
			loopPoint: -1,
			releasePoint: -1,
			settings: 0
		}))
	);
	if (!block) return sequences;
	const reader = new BlockReader(block.data);
	const count = reader.i32();
	if (block.version < 2) {
		throw new FtmFormatError(
			'This FamiTracker module uses a sequence format Bitphase cannot read'
		);
	}
	if (block.version === 2) {
		for (let i = 0; i < count; i++) {
			const index = reader.i32();
			const type = reader.i32();
			const seqCount = reader.u8();
			const values: number[] = [];
			for (let item = 0; item < seqCount; item++) {
				const value = reader.i8();
				const length = Math.max(0, reader.i8());
				for (let step = 0; step < length && values.length < MAX_SEQUENCE_ITEMS; step++) {
					values.push(value);
				}
			}
			if (index >= 0 && index < 128 && type >= 0 && type < SEQUENCE_TYPES) {
				sequences[index]![type] = { values, loopPoint: -1, releasePoint: -1, settings: 0 };
			}
		}
		return sequences;
	}

	const indices: number[] = [];
	const types: number[] = [];
	for (let i = 0; i < count; i++) {
		const index = reader.i32();
		const type = reader.i32();
		const seqCount = reader.u8();
		let loopPoint = reader.i32();
		if (loopPoint === seqCount) loopPoint = -1;
		indices.push(index);
		types.push(type);
		let releasePoint = -1;
		let settings = 0;
		if (block.version === 4) {
			releasePoint = reader.i32();
			settings = reader.i32();
		}
		const values: number[] = [];
		for (let item = 0; item < seqCount; item++) {
			const value = reader.i8();
			if (values.length < MAX_SEQUENCE_ITEMS) values.push(value);
		}
		if (index >= 0 && index < 128 && type >= 0 && type < SEQUENCE_TYPES) {
			sequences[index]![type] = { values, loopPoint, releasePoint, settings };
		}
	}
	if (block.version === 5) {
		for (let index = 0; index < 128; index++) {
			for (let type = 0; type < SEQUENCE_TYPES; type++) {
				const releasePoint = reader.i32();
				const settings = reader.i32();
				const sequence = sequences[index]![type]!;
				if (sequence.values.length > 0) {
					sequence.releasePoint = releasePoint;
					sequence.settings = settings;
				}
			}
		}
	} else if (block.version >= 6) {
		for (let i = 0; i < count; i++) {
			const releasePoint = reader.i32();
			const settings = reader.i32();
			const index = indices[i]!;
			const type = types[i]!;
			if (index >= 0 && index < 128 && type >= 0 && type < SEQUENCE_TYPES) {
				const sequence = sequences[index]![type]!;
				sequence.releasePoint = releasePoint;
				sequence.settings = settings;
			}
		}
	}
	return sequences;
}

function readS5bSequences(block: FtmBlock | undefined): FtmSequence[][] {
	const sequences: FtmSequence[][] = Array.from({ length: 128 }, () =>
		Array.from({ length: SEQUENCE_TYPES }, () => ({
			values: [],
			loopPoint: -1,
			releasePoint: -1,
			settings: 0
		}))
	);
	if (!block) return sequences;
	const reader = new BlockReader(block.data);
	const count = reader.i32();
	for (let i = 0; i < count; i++) {
		const index = reader.i32();
		const type = reader.i32();
		const seqCount = reader.u8();
		let loopPoint = reader.i32();
		if (loopPoint === seqCount) loopPoint = -1;
		const releasePoint = reader.i32();
		const settings = reader.i32();
		const values: number[] = [];
		for (let item = 0; item < seqCount; item++) {
			const value = reader.i8();
			if (values.length < MAX_SEQUENCE_ITEMS) values.push(value);
		}
		if (index >= 0 && index < 128 && type >= 0 && type < SEQUENCE_TYPES) {
			sequences[index]![type] = { values, loopPoint, releasePoint, settings };
		}
	}
	return sequences;
}

function readInstruments(block: FtmBlock | undefined): FtmInstrument[] {
	if (!block) return [];
	const reader = new BlockReader(block.data);
	const count = reader.i32();
	const instruments: FtmInstrument[] = [];
	for (let i = 0; i < count; i++) {
		const index = reader.i32();
		const type = reader.u8();
		const seqEnable: boolean[] = [];
		const seqIndex: number[] = [];
		if (type === INST_2A03 || type === INST_S5B) {
			const seqCount = reader.i32();
			for (let seq = 0; seq < seqCount; seq++) {
				seqEnable.push(reader.u8() !== 0);
				seqIndex.push(reader.u8());
			}
		}
		if (type === INST_2A03) {
			const octaves = block.version === 1 ? 6 : 8;
			const samples: number[] = [];
			const pitch: number[] = [];
			const delta: Array<number | null> = [];
			for (let octave = 0; octave < octaves; octave++) {
				for (let note = 0; note < 12; note++) {
					const sample = reader.u8();
					samples.push(sample > MAX_FT_SAMPLES ? 0 : sample);
					pitch.push(reader.u8());
					if (block.version > 5) {
						const value = reader.i8();
						delta.push(value < 0 ? null : Math.min(127, value));
					} else {
						delta.push(null);
					}
				}
			}
			const nameSize = reader.i32();
			const name = latin1(reader.bytes(Math.max(0, nameSize)));
			instruments.push({ index, type, name, seqEnable, seqIndex, samples, pitch, delta });
			continue;
		}
		if (type === INST_S5B) {
			const nameSize = reader.i32();
			const name = latin1(reader.bytes(Math.max(0, nameSize)));
			instruments.push({
				index,
				type,
				name,
				seqEnable,
				seqIndex,
				samples: [],
				pitch: [],
				delta: []
			});
			continue;
		}
		throw new FtmFormatError(
			`FamiTracker ${INST_TYPE_NAMES[type] || 'expansion'} instruments are not supported yet`
		);
	}
	return instruments;
}

type FtmTrack = {
	frameCount: number;
	speed: number;
	tempo: number;
	patternLength: number;
	frames: number[][];
};

function readFrames(
	block: FtmBlock | undefined,
	trackCount: number,
	machine: NesSystem,
	channelCount: number
): FtmTrack[] {
	if (!block) {
		throw new FtmFormatError('FamiTracker module has no FRAMES block');
	}
	const reader = new BlockReader(block.data);
	const tracks: FtmTrack[] = [];
	const songs = block.version === 1 ? 1 : trackCount;
	for (let track = 0; track < songs; track++) {
		const frameCount = reader.i32();
		let speed = DEFAULT_SPEED;
		let tempo = machine === 'PAL' ? DEFAULT_TEMPO_PAL : DEFAULT_TEMPO_NTSC;
		let channels = channelCount;
		if (block.version === 1) {
			channels = reader.i32();
		} else {
			speed = reader.i32();
			if (block.version >= 3) {
				tempo = reader.i32();
			} else if (speed >= 20) {
				tempo = speed;
				speed = DEFAULT_SPEED;
			}
		}
		const patternLength = block.version === 1 ? 64 : reader.i32();
		const frames: number[][] = [];
		for (let frame = 0; frame < frameCount; frame++) {
			const row: number[] = [];
			for (let channel = 0; channel < channels; channel++) {
				row.push(reader.u8());
			}
			frames.push(row);
		}
		tracks.push({
			frameCount,
			speed: Math.max(1, speed),
			tempo,
			patternLength: Math.max(1, patternLength),
			frames
		});
	}
	return tracks;
}

function readSamples(
	block: FtmBlock | undefined,
	note: (message: string) => void
): Array<FtmSample | null> {
	const samples: Array<FtmSample | null> = Array(MAX_FT_SAMPLES).fill(null);
	if (!block) return samples;
	const reader = new BlockReader(block.data);
	const count = reader.u8();
	for (let i = 0; i < count; i++) {
		const index = reader.u8();
		const nameSize = reader.i32();
		const name = latin1(reader.bytes(Math.max(0, nameSize))) || 'Sample';
		const size = reader.i32();
		const raw = [...reader.bytes(Math.max(0, size))];
		if (index >= MAX_FT_SAMPLES || raw.length === 0) continue;
		if (raw.length > 4081) {
			note(`DPCM sample ${name} was truncated to 4,081 bytes`);
		}
		samples[index] = { name, data: padDpcmBytes(raw) };
	}
	return samples;
}

function readPatterns(
	block: FtmBlock | undefined,
	effectColumns: number[][],
	fileVersion: number
): Map<number, Map<number, Map<number, Map<number, FtmCell>>>> {
	const tracks = new Map<number, Map<number, Map<number, Map<number, FtmCell>>>>();
	if (!block) return tracks;
	const reader = new BlockReader(block.data);
	if (block.version === 1) reader.i32();
	while (reader.remaining() > 0) {
		const track = block.version > 1 ? reader.i32() : 0;
		const channel = reader.i32();
		const pattern = reader.i32();
		const items = reader.i32();
		for (let item = 0; item < items; item++) {
			const row = fileVersion === 0x0200 ? reader.u8() : reader.i32();
			const note = reader.u8();
			const octave = reader.u8();
			const instrument = reader.u8();
			let volume = reader.u8();
			const effectCount = fileVersion === 0x0200 ? 1 : (effectColumns[track]?.[channel] ?? 1);
			const effects: { number: number; param: number }[] = [];
			for (let column = 0; column < effectCount; column++) {
				let effect = reader.u8();
				let param = reader.u8();
				if (block.version < 3 && effect === 7) {
					effect = 6;
					param = 0;
				} else if (block.version < 3 && effect === 6 && param < 0xff) {
					param++;
				}
				effects.push({ number: effect, param });
			}
			if (volume > 0x10) volume &= 0x0f;
			let trackMap = tracks.get(track);
			if (!trackMap) {
				trackMap = new Map();
				tracks.set(track, trackMap);
			}
			let channelMap = trackMap.get(channel);
			if (!channelMap) {
				channelMap = new Map();
				trackMap.set(channel, channelMap);
			}
			let patternMap = channelMap.get(pattern);
			if (!patternMap) {
				patternMap = new Map();
				channelMap.set(pattern, patternMap);
			}
			patternMap.set(row, { note, octave, instrument, volume, effects });
		}
	}
	return tracks;
}

function toInstrument(
	source: FtmInstrument,
	sequences: FtmSequence[][],
	s5bSequences: FtmSequence[][],
	samples: Array<FtmSample | null>,
	note: (message: string) => void
): Instrument {
	const id = numberToInstrumentId(source.index + 1);
	if (source.type === INST_S5B) {
		return toAyInstrument(source, s5bSequences, id);
	}
	const instrument = new Instrument(id, source.name || `Instrument ${id}`, 'nes');
	if (source.type !== INST_2A03) {
		note(`Instrument ${source.name || id} is not a 2A03 instrument and was left empty`);
		return instrument;
	}
	const macros: NonNullable<Instrument['macros']> = {};
	const volume = enabledSequence(source, sequences, 0);
	if (volume && volume.values.length > 0) {
		const values = volume.values.map((value) => Math.max(0, Math.min(15, value)));
		macros.volumeOrRate = sequenceMacro(values, volume.loopPoint, volume.releasePoint);
	}
	const pitch = enabledSequence(source, sequences, 2);
	const hiPitch = enabledSequence(source, sequences, 3);
	const tone = mergePitch(pitch, hiPitch);
	if (tone) {
		macros.toneAdd = sequenceMacro(tone.values, tone.loopPoint, tone.releasePoint);
		const accumulate = (pitch?.settings ?? 0) !== 1;
		macros.toneAccumulation = sequenceMacro(
			tone.values.map(() => accumulate),
			tone.loopPoint,
			tone.releasePoint
		);
	}
	const duty = enabledSequence(source, sequences, 4);
	if (duty && duty.values.length > 0) {
		macros.pulseWidth = sequenceMacro(
			duty.values.map((value) => value & 3),
			duty.loopPoint,
			duty.releasePoint
		);
	}
	if (Object.keys(macros).length > 0) instrument.macros = macros;

	const used = new Map<number, number>();
	const localSamples: NesDpcmSample[] = [];
	const assignments: Array<NesDpcmAssignment | null> = Array(96).fill(null);
	for (let key = 0; key < Math.min(96, source.samples.length); key++) {
		const sampleNumber = source.samples[key] ?? 0;
		if (sampleNumber <= 0) continue;
		const sample = samples[sampleNumber - 1];
		if (!sample) continue;
		let localIndex = used.get(sampleNumber - 1);
		if (localIndex === undefined) {
			localIndex = localSamples.length;
			used.set(sampleNumber - 1, localIndex);
			localSamples.push({ name: sample.name, data: [...sample.data] });
		}
		const pitchByte = source.pitch[key] ?? 0;
		assignments[key] = {
			sampleIndex: localIndex,
			pitch: pitchByte & 0x0f,
			loop: (pitchByte & 0x80) !== 0,
			delta: source.delta[key] ?? null
		};
	}
	copyNesDpcmFields(
		{ dpcmSamples: localSamples, dpcmAssignments: assignments },
		instrument as Instrument & {
			dpcmSamples?: NesDpcmSample[];
			dpcmAssignments?: (NesDpcmAssignment | null)[];
		}
	);
	return instrument;
}

function toAyInstrument(source: FtmInstrument, sequences: FtmSequence[][], id: string): Instrument {
	const instrument = new Instrument(id, source.name || `Instrument ${id}`, 'ay');
	const macros: NonNullable<Instrument['macros']> = {};
	const volume = enabledSequence(source, sequences, 0);
	if (volume && volume.values.length > 0) {
		macros.volume = sequenceMacro(
			volume.values.map((value) => Math.max(0, Math.min(15, value))),
			volume.loopPoint,
			volume.releasePoint
		);
	}
	const pitch = enabledSequence(source, sequences, 2);
	const hiPitch = enabledSequence(source, sequences, 3);
	const tone = mergePitch(pitch, hiPitch);
	if (tone) {
		macros.toneAdd = sequenceMacro(tone.values, tone.loopPoint, tone.releasePoint);
		macros.toneAccumulation = sequenceMacro(
			tone.values.map(() => true),
			tone.loopPoint,
			tone.releasePoint
		);
	}
	const mode = enabledSequence(source, sequences, 4);
	if (mode && mode.values.length > 0) {
		macros.tone = sequenceMacro(
			mode.values.map((value) => (value & S5B_MODE_SQUARE) !== 0),
			mode.loopPoint,
			mode.releasePoint
		);
		macros.noise = sequenceMacro(
			mode.values.map((value) => (value & S5B_MODE_NOISE) !== 0),
			mode.loopPoint,
			mode.releasePoint
		);
		macros.envelope = sequenceMacro(
			mode.values.map((value) => (value & S5B_MODE_ENVELOPE) !== 0),
			mode.loopPoint,
			mode.releasePoint
		);
		macros.noiseAdd = sequenceMacro(
			mode.values.map((value) => value & 0x1f),
			mode.loopPoint,
			mode.releasePoint
		);
	}
	if (Object.keys(macros).length > 0) instrument.macros = macros;
	return instrument;
}

function enabledSequence(
	instrument: FtmInstrument,
	sequences: FtmSequence[][],
	type: number
): FtmSequence | null {
	if (!instrument.seqEnable[type]) return null;
	const index = instrument.seqIndex[type] ?? 0;
	return sequences[index]?.[type] ?? null;
}

function sequenceMacro<T extends boolean | number>(
	values: T[],
	loopPoint: number,
	releasePoint: number
): { values: T[]; loop: number; release?: number } {
	const loop = holdLoop(loopPoint, values.length);
	if (releasePoint < 0 || releasePoint >= values.length) return { values, loop };
	return { values, loop, release: releasePoint };
}

function mergePitch(
	pitch: FtmSequence | null,
	hiPitch: FtmSequence | null
): { values: number[]; loop: number; loopPoint: number; releasePoint: number } | null {
	const primary = pitch && pitch.values.length > 0 ? pitch : null;
	const coarse = hiPitch && hiPitch.values.length > 0 ? hiPitch : null;
	if (!primary && !coarse) return null;
	const length = Math.max(primary?.values.length ?? 0, coarse?.values.length ?? 0);
	const values: number[] = [];
	for (let index = 0; index < length; index++) {
		const fine = primary ? sampleSequence(primary, index) : 0;
		const hi = coarse ? sampleSequence(coarse, index) << 4 : 0;
		values.push(clampTone(fine + hi));
	}
	const loopSource = primary ?? coarse!;
	return {
		values,
		loop: holdLoop(loopSource.loopPoint, values.length),
		loopPoint: loopSource.loopPoint,
		releasePoint: loopSource.releasePoint
	};
}

function buildArpTables(
	instruments: FtmInstrument[],
	sequences: FtmSequence[][],
	s5bSequences: FtmSequence[][],
	note: (message: string) => void
): { tables: Table[]; byInstrument: Map<number, number> } {
	const byInstrument = new Map<number, number>();
	const tables: Table[] = [];
	const seen = new Map<string, number>();
	let fixedWarned = false;
	for (const source of instruments) {
		if (source.type !== INST_2A03 && source.type !== INST_S5B) continue;
		const table = source.type === INST_S5B ? s5bSequences : sequences;
		const arpeggio = enabledSequence(source, table, 1);
		if (!arpeggio || arpeggio.values.length === 0) continue;
		if (arpeggio.settings === 1) {
			if (!fixedWarned) {
				note('FamiTracker fixed arpeggio sequences were not imported');
				fixedWarned = true;
			}
			continue;
		}
		const rows = arpeggio.values.slice(0, MAX_SEQUENCE_ITEMS);
		const loop = holdLoop(arpeggio.loopPoint, rows.length);
		const additive = arpeggio.settings === 2;
		const key = `${additive ? 1 : 0}:${loop}:${rows.join(',')}`;
		let id = seen.get(key);
		if (id === undefined) {
			id = tables.length;
			seen.set(key, id);
			tables.push(new Table(id, rows, loop, source.name || `Arp ${id + 1}`, additive));
		}
		byInstrument.set(source.index, id);
	}
	if (tables.length === 0) tables.push(new Table(0, [], 0, 'Table 1'));
	return { tables, byInstrument };
}

type EffectCarry = {
	pitch: Effect | null;
	vibrato: Effect | null;
	sweep: Effect | null;
	volumeSlide: Effect | null;
	detune: Effect | null;
	gate: boolean;
};

function freshEffectCarry(): EffectCarry {
	return {
		pitch: null,
		vibrato: null,
		sweep: null,
		volumeSlide: null,
		detune: null,
		gate: false
	};
}

function cloneImportedEffect(effect: Effect): Effect {
	return new Effect(effect.effect, effect.delay, effect.parameter);
}

function isContinuingPitchEffect(effect: number): boolean {
	return (
		effect === EffectType.SlideUp ||
		effect === EffectType.SlideDown ||
		effect === EffectType.Portamento ||
		effect === EffectType.Arpeggio
	);
}

function isSweepEffect(effect: Effect): boolean {
	return effect.effect === EffectType.AutoEnvelope && (effect.delay === 2 || effect.delay === 3);
}

function rememberImportedEffect(carry: EffectCarry, effect: Effect): void {
	if (isContinuingPitchEffect(effect.effect)) {
		carry.pitch = effect.parameter === 0 ? null : cloneImportedEffect(effect);
		return;
	}
	if (effect.effect === EffectType.Vibrato) {
		carry.vibrato = effect.parameter === 0 ? null : cloneImportedEffect(effect);
		return;
	}
	if (isSweepEffect(effect)) {
		carry.sweep = (effect.parameter & 0x0f) === 0 ? null : cloneImportedEffect(effect);
		return;
	}
	if (effect.effect === EffectType.VolumeSlide) {
		carry.volumeSlide = effect.parameter === 0 ? null : cloneImportedEffect(effect);
		return;
	}
	if (effect.effect === EffectType.Detune) {
		carry.detune = cloneImportedEffect(effect);
	}
}

function rowHasImportedEffect(row: Row, match: (effect: Effect) => boolean): boolean {
	return (row.effects ?? []).some((effect) => effect != null && match(effect));
}

function placeImportedEffect(
	channel: { effectColumnCount?: number },
	row: Row,
	effect: Effect
): void {
	const effects = row.effects ?? [null];
	row.effects = effects;
	const empty = effects.findIndex((slot) => slot == null);
	if (empty >= 0) {
		effects[empty] = effect;
		return;
	}
	if (effects.length >= MAX_CHANNEL_EFFECT_COLUMNS) return;
	effects.push(effect);
	channel.effectColumnCount = Math.max(channel.effectColumnCount ?? 1, effects.length);
}

function updateEffectCarry(
	carry: EffectCarry,
	cell: FtmCell | undefined,
	row: Row,
	channel: number,
	ayChannel: boolean,
	params: FtmParams,
	skippedEffects: Set<string>
): void {
	const scratch = emptyRow(ayChannel ? AY_CHIP_SCHEMA.fields : NES_CHIP_SCHEMA.fields, 1);
	scratch.note = row.note;
	for (const raw of cell?.effects ?? []) {
		if (raw.number === 20 || raw.number === 21) {
			carry.pitch = null;
			continue;
		}
		const mapped = mapEffect(
			raw.number,
			raw.param,
			params.speedSplit,
			channel,
			scratch,
			skippedEffects,
			ayChannel,
			params.vibratoNew
		);
		if (mapped) {
			rememberImportedEffect(carry, mapped);
		} else if (
			raw.param === 0 &&
			(raw.number === 6 || raw.number === 10 || raw.number === 16 || raw.number === 17)
		) {
			carry.pitch = null;
		}
	}
}

function sustainImportedEffects(
	channel: { effectColumnCount?: number },
	row: Row,
	cell: FtmCell | undefined,
	carry: EffectCarry,
	params: FtmParams,
	channelIndex: number,
	ayChannel: boolean,
	skippedEffects: Set<string>
): void {
	const pitched = row.note.name >= NoteName.C && row.note.name <= NoteName.B;
	const gateWasOpen = carry.gate;
	updateEffectCarry(carry, cell, row, channelIndex, ayChannel, params, skippedEffects);
	if (!pitched) {
		if (row.note.name === NoteName.Off) carry.gate = false;
		return;
	}
	const resume = (effect: Effect | null, present: boolean) => {
		if (!effect || present) return;
		placeImportedEffect(channel, row, cloneImportedEffect(effect));
	};
	const portamentoAfterCut = !gateWasOpen && carry.pitch?.effect === EffectType.Portamento;
	resume(
		portamentoAfterCut ? null : carry.pitch,
		rowHasImportedEffect(row, (effect) => isContinuingPitchEffect(effect.effect))
	);
	resume(
		carry.vibrato,
		rowHasImportedEffect(row, (effect) => effect.effect === EffectType.Vibrato)
	);
	if (!ayChannel && channelIndex <= 1) {
		resume(carry.sweep, rowHasImportedEffect(row, isSweepEffect));
	}
	if (!gateWasOpen) {
		resume(
			carry.volumeSlide,
			rowHasImportedEffect(row, (effect) => effect.effect === EffectType.VolumeSlide)
		);
		resume(
			carry.detune,
			rowHasImportedEffect(row, (effect) => effect.effect === EffectType.Detune)
		);
	}
	carry.gate = true;
}

function patternLengthForFrame(
	frame: number[],
	cells: Map<number, Map<number, Map<number, FtmCell>>>,
	fullLength: number
): number {
	let cut = fullLength;
	for (let channel = 0; channel < frame.length; channel++) {
		const rows = cells.get(channel)?.get(frame[channel] ?? 0);
		if (!rows) continue;
		for (const [rowIndex, cell] of rows) {
			if (rowIndex < 0 || rowIndex >= cut) continue;
			const endsFrame = cell.effects.some(
				(effect) => effect.number === 2 || effect.number === 3
			);
			if (endsFrame) cut = rowIndex + 1;
		}
	}
	return cut > 0 ? cut : 1;
}

function toSong(
	track: FtmTrack,
	effectColumns: number[],
	cells: Map<number, Map<number, Map<number, FtmCell>>>,
	params: FtmParams,
	skippedEffects: Set<string>,
	arpByInstrument: Map<number, number>
): Song {
	const song = new Song(NES_CHIP_SCHEMA);
	song.chipType = 'nes';
	song.chipVariant = params.machine;
	song.initialSpeed = track.speed;
	song.defaultPatternLength = track.patternLength;
	song.a4TuningHz = 440;
	applySchemaDefaults(song, NES_CHIP_SCHEMA);
	song.chipVariant = params.machine;
	song.chipFrequency = resolveNesCpuFrequency(params.machine);
	song.interruptFrequency = params.engineHz;
	song.tempo = track.tempo > 0 ? track.tempo : 0;
	song.tuningTable = resolveNesTuningTable(song.chipFrequency, song.a4TuningHz);

	const latchedInstrument = Array.from({ length: NES_CHANNEL_COUNT }, () => -1);
	const carriedEffects = Array.from({ length: NES_CHANNEL_COUNT }, () => freshEffectCarry());
	song.patterns = track.frames.map((frame, frameIndex) => {
		const length = patternLengthForFrame(frame, cells, track.patternLength);
		const pattern = new Pattern(frameIndex, length, NES_CHIP_SCHEMA);
		for (let channel = 0; channel < NES_CHANNEL_COUNT; channel++) {
			const columnCount = effectColumns[channel] ?? 1;
			const patternChannel = pattern.channels[channel]!;
			patternChannel.effectColumnCount = columnCount;
			const patternIndex = frame[channel] ?? 0;
			const rows = cells.get(channel)?.get(patternIndex);
			for (let rowIndex = 0; rowIndex < length; rowIndex++) {
				const cell = rows?.get(rowIndex);
				const row = cell
					? toRow(
							cell,
							columnCount,
							params.speedSplit,
							skippedEffects,
							channel,
							latchedInstrument,
							arpByInstrument,
							false,
							() => {},
							params.vibratoNew
						)
					: emptyRow(NES_CHIP_SCHEMA.fields, columnCount);
				sustainImportedEffects(
					patternChannel,
					row,
					cell,
					carriedEffects[channel]!,
					params,
					channel,
					false,
					skippedEffects
				);
				patternChannel.rows[rowIndex] = row;
			}
		}
		return pattern;
	});
	syncSharedEffectColumnLayout(song.patterns);
	return song;
}

function toAySong(
	track: FtmTrack,
	effectColumns: number[],
	cells: Map<number, Map<number, Map<number, FtmCell>>>,
	params: FtmParams,
	skippedEffects: Set<string>,
	arpByInstrument: Map<number, number>,
	warn: (message: string) => void
): Song {
	const song = new Song(AY_CHIP_SCHEMA);
	song.chipType = 'ay';
	song.chipVariant = 'YM';
	song.initialSpeed = track.speed;
	song.defaultPatternLength = track.patternLength;
	applySchemaDefaults(song, AY_CHIP_SCHEMA);
	song.chipVariant = 'YM';
	song.chipFrequency = SUNSOFT_5B_CHIP_FREQUENCY;
	song.tuningTableIndex = 5;
	song.a4TuningHz = 440;
	song.interruptFrequency = params.engineHz;
	song.tempo = track.tempo > 0 ? track.tempo : 0;
	song.tuningTable = resolveAYTuningTable(5, SUNSOFT_5B_CHIP_FREQUENCY, 440);

	const latchedInstrument = Array.from({ length: S5B_CHANNEL_COUNT }, () => -1);
	const carriedEffects = Array.from({ length: S5B_CHANNEL_COUNT }, () => freshEffectCarry());
	song.patterns = track.frames.map((frame, frameIndex) => {
		const length = patternLengthForFrame(frame, cells, track.patternLength);
		const pattern = new Pattern(frameIndex, length, AY_CHIP_SCHEMA);
		for (let channel = 0; channel < S5B_CHANNEL_COUNT; channel++) {
			const sourceChannel = NES_CHANNEL_COUNT + channel;
			const columnCount = effectColumns[sourceChannel] ?? 1;
			const patternChannel = pattern.channels[channel]!;
			patternChannel.effectColumnCount = columnCount;
			const patternIndex = frame[sourceChannel] ?? 0;
			const rows = cells.get(sourceChannel)?.get(patternIndex);
			for (let rowIndex = 0; rowIndex < length; rowIndex++) {
				const cell = rows?.get(rowIndex);
				const row = cell
					? toRow(
							cell,
							columnCount,
							params.speedSplit,
							skippedEffects,
							channel,
							latchedInstrument,
							arpByInstrument,
							true,
							warn,
							params.vibratoNew
						)
					: emptyRow(AY_CHIP_SCHEMA.fields, columnCount);
				sustainImportedEffects(
					patternChannel,
					row,
					cell,
					carriedEffects[channel]!,
					params,
					channel,
					true,
					skippedEffects
				);
				patternChannel.rows[rowIndex] = row;
			}
		}
		return pattern;
	});
	syncSharedEffectColumnLayout(song.patterns);
	return song;
}

function ayNoteOctave(fileOctave: number, warn: (message: string) => void): number {
	const octave = fileOctave + 1;
	if (octave <= 1) {
		warn('5B notes in the lowest octave were left on octave 1');
		return 1;
	}
	return octave - 1;
}

function emptyRow(fields: ChipSchema['fields'], columnCount: number): Row {
	const row = new Row(fields);
	row.note = new Note(NoteName.None, 0);
	row.effects = Array.from({ length: columnCount }, () => null);
	return row;
}

function toRow(
	cell: FtmCell,
	columnCount: number,
	speedSplit: number,
	skippedEffects: Set<string>,
	channel: number,
	latchedInstrument: number[],
	arpByInstrument: Map<number, number>,
	ayChannel: boolean,
	warn: (message: string) => void = () => {},
	vibratoNew = false
): Row {
	const row = emptyRow(ayChannel ? AY_CHIP_SCHEMA.fields : NES_CHIP_SCHEMA.fields, columnCount);
	const noteOn = cell.note >= 1 && cell.note <= 12;
	if (noteOn) {
		row.note = new Note(
			(cell.note + 1) as NoteName,
			ayChannel ? ayNoteOctave(cell.octave, warn) : cell.octave + 1
		);
	} else if (cell.note === 13) {
		row.note = new Note(NoteName.Release, 0);
	} else if (cell.note === 14) {
		row.note = new Note(NoteName.Off, 0);
	}
	let instrumentSet = false;
	if (cell.instrument < MAX_FT_INSTRUMENTS) {
		row.instrument = cell.instrument + 1;
		latchedInstrument[channel] = cell.instrument;
		instrumentSet = true;
	}
	if (noteOn || instrumentSet) {
		const instrumentIndex = latchedInstrument[channel] ?? -1;
		const tableId = instrumentIndex >= 0 ? arpByInstrument.get(instrumentIndex) : undefined;
		row.table = tableId === undefined ? -1 : tableId + 1;
	}
	row.volume = ftVolume(cell.volume);
	const effects: (Effect | null)[] = [];
	for (const effect of cell.effects) {
		if (effects.length >= columnCount) break;
		const mapped = mapEffect(
			effect.number,
			effect.param,
			speedSplit,
			channel,
			row,
			skippedEffects,
			ayChannel,
			vibratoNew
		);
		if (mapped) effects.push(mapped);
	}
	while (effects.length < columnCount) effects.push(null);
	row.effects = effects;
	return row;
}

function ftVolume(volume: number): number {
	if (volume >= 0x10) return 0;
	if (volume === 0) return -1;
	return volume & 0x0f;
}

const NEW_VIBRATO_DEPTH = [0, 1, 2, 3, 4, 6, 9, 11, 13, 15, 15, 15, 15, 15, 15, 15];
const OLD_VIBRATO_DEPTH = [1, 1, 1, 2, 2, 4, 4, 8, 8, 15, 15, 15, 15, 15, 15, 15];

function famitrackerVibrato(byte: number, vibratoNew: boolean): Effect {
	const ftSpeed = (byte >> 4) & 0x0f;
	const ftDepth = byte & 0x0f;
	if (ftSpeed === 0) return new Effect(EffectType.Vibrato, 0, 0);
	const depth = (vibratoNew ? NEW_VIBRATO_DEPTH : OLD_VIBRATO_DEPTH)[ftDepth] ?? 0;
	if (depth === 0) return new Effect(EffectType.Vibrato, 0, 0);
	let speed = 1;
	let delay = 1;
	let error = Number.POSITIVE_INFINITY;
	for (let candidateDelay = 1; candidateDelay <= 15; candidateDelay++) {
		for (let candidateSpeed = 1; candidateSpeed <= 15; candidateSpeed++) {
			const nextError = Math.abs(candidateSpeed * candidateDelay * ftSpeed - 16);
			if (nextError < error || (nextError === error && candidateSpeed > speed)) {
				error = nextError;
				speed = candidateSpeed;
				delay = candidateDelay;
			}
		}
	}
	return new Effect(EffectType.Vibrato, delay, (speed << 4) | depth);
}

function famitrackerVolumeSlide(byte: number): Effect {
	const net = ((byte >> 4) & 0x0f) - (byte & 0x0f);
	if (net === 0) return new Effect(EffectType.VolumeSlide, 0, 0);
	const amount = Math.abs(net);
	let divisor = amount;
	let scale = 8;
	while (scale !== 0) {
		const next = divisor % scale;
		divisor = scale;
		scale = next;
	}
	const step = amount / divisor;
	const delay = 8 / divisor;
	return new Effect(EffectType.VolumeSlide, delay, net > 0 ? step << 4 : step);
}

function mapEffect(
	number: number,
	param: number,
	speedSplit: number,
	channel: number,
	row: Row,
	skippedEffects: Set<string>,
	ayChannel: boolean,
	vibratoNew = false
): Effect | null {
	const byte = param & 0xff;
	switch (number) {
		case 0:
			return null;
		case 4:
			return new Effect(EffectType.SongEnd, 0, 0);
		case 1:
			if (byte >= speedSplit) {
				skippedEffects.add('tempo');
				return null;
			}
			return new Effect(EffectType.Speed, 0, byte);
		case 2:
		case 3:
			return null;
		case 5:
			if (row.volume === 0) row.volume = ftVolume(byte & 0x0f);
			return null;
		case 6:
			if (byte === 0 && row.note.name >= NoteName.C && row.note.name <= NoteName.B)
				return null;
			return new Effect(EffectType.Portamento, 0, byte);
		case 8:
		case 9:
			if (ayChannel || channel > 1) {
				skippedEffects.add(EFFECT_LETTERS[number - 1] || String(number));
				return null;
			}
			return new Effect(EffectType.AutoEnvelope, number === 8 ? 2 : 3, byte);
		case 10:
			return new Effect(EffectType.Arpeggio, 0, byte);
		case 11:
			return famitrackerVibrato(byte, vibratoNew);
		case 13:
			return new Effect(EffectType.Detune, 0, byte);
		case 16:
			return new Effect(!ayChannel && channel === 3 ? PERIOD_UP : PERIOD_DOWN, 1, byte);
		case 17:
			return new Effect(!ayChannel && channel === 3 ? PERIOD_DOWN : PERIOD_UP, 1, byte);
		case 22:
			return famitrackerVolumeSlide(byte);
		case 23:
			if (byte === 0) {
				row.note = new Note(NoteName.Off, 0);
				return null;
			}
			if (byte > 0x0f) {
				skippedEffects.add('S');
				return null;
			}
			return new Effect(EffectType.OnOff, 0, byte << 4);
		case 18:
			if (ayChannel || (channel > 1 && channel !== 3)) {
				skippedEffects.add('V');
				return null;
			}
			return new Effect(EffectType.AutoEnvelope, 1, (byte & 3) + 1);
		default:
			if (number > 0) skippedEffects.add(EFFECT_LETTERS[number - 1] || String(number));
			return null;
	}
}

export async function loadFtmFile(file: File): Promise<Project> {
	const buffer = await file.arrayBuffer();
	const stem = file.name.replace(/\.[^.]+$/, '');
	const { project, warnings } = importFtmBuffer(buffer, stem);
	for (const warning of warnings) {
		console.warn(`FTM import: ${warning}`);
	}
	return project;
}
