import type { Chip } from '../../../chips/types';
import { loadVT2File, loadPT3File } from '../modules/vt-converter';
import { isTaymBuffer, loadTaymFile } from '../taym/taym-import';
import { isPsgBuffer, loadPsgFile } from '../ay/psg-import';
import { Project, Table } from '../../../models/project';
import {
	Song,
	Pattern,
	Channel,
	Row,
	Note,
	Effect,
	NoteName,
	EffectType,
	Instrument,
	InstrumentRow,
	DEFAULT_PATTERN_LENGTH
} from '../../../models/song';
import { isValidInstrumentSampleByteLength } from '../../../utils/audio-sample-decode';
import { normalizeSamplePlaybackBounds } from '../../../chips/ay/sample-region';
import { normalizeNesInstrumentRow } from '../../../chips/nes/instrument';
import type { ChipSchema } from '../../../chips/base/schema';
import { computeEffectiveChannelLabels } from '../../../models/virtual-channels';

function reconstructProject(data: any, getChip: (chipType: string) => Chip | null): Project {
	const songs = data.songs?.map((songData: any) => reconstructSong(songData, getChip)) || [];
	const tables = data.tables?.map((tableData: any) => reconstructTable(tableData)) || [];

	const patternOrderColors =
		typeof data.patternOrderColors === 'object' && data.patternOrderColors !== null
			? (Object.fromEntries(
					Object.entries(data.patternOrderColors).map(([k, v]) => [
						parseInt(k, 10),
						typeof v === 'string' ? v : ''
					])
				) as Record<number, string>)
			: {};

	let instruments: Instrument[] = [];
	if (data.instruments && Array.isArray(data.instruments) && data.instruments.length > 0) {
		instruments = data.instruments.map((instData: any) => reconstructInstrument(instData));
	} else if (data.songs?.[0]?.instruments && Array.isArray(data.songs[0].instruments)) {
		instruments = data.songs[0].instruments.map((instData: any) =>
			reconstructInstrument(instData)
		);
	}
	if (instruments.length === 0) {
		instruments = [new Instrument('01', [], 0, 'Instrument 01')];
	}

	return new Project(
		data.name || '',
		data.author || '',
		songs,
		data.loopPointId || 0,
		data.patternOrder || [0],
		tables.length > 0 ? tables : [new Table(0, [], 0, 'Table 1')],
		patternOrderColors,
		instruments
	);
}

function reconstructTable(data: any): Table {
	return new Table(
		data.id ?? 0,
		data.rows || [],
		data.loop || 0,
		data.name || `Table ${((data.id ?? 0) + 1).toString(36).toUpperCase()}`,
		data.additive === true
	);
}

function reconstructSong(data: any, getChip: (chipType: string) => Chip | null): Song {
	const chip = data.chipType ? getChip(data.chipType) : null;
	const schema = chip?.schema;
	const song = new Song(schema);

	const virtualChannelMap: Record<number, number> = data.virtualChannelMap ?? {};
	song.virtualChannelMap = virtualChannelMap;

	const hwLabels = schema?.channelLabels ?? ['A', 'B', 'C'];
	const effectiveLabels = computeEffectiveChannelLabels(hwLabels, virtualChannelMap);

	song.patterns = data.patterns?.map((patternData: any) =>
		reconstructPattern(patternData, schema, effectiveLabels)
	) || [new Pattern(0, DEFAULT_PATTERN_LENGTH, schema)];
	song.tuningTable = data.tuningTable || song.tuningTable;
	song.chipType = data.chipType;
	const songRecord = song as unknown as Record<string, unknown>;
	schema?.settings
		?.filter((s) => s.group === 'chip' && s.key)
		.forEach((s) => {
			songRecord[s.key] = data[s.key] ?? s.defaultValue;
		});
	if (songRecord.interruptFrequency === undefined) {
		songRecord.interruptFrequency = 50;
	}
	if (schema?.defaultTuningTable && !data.tuningTable) {
		song.tuningTable = schema.defaultTuningTable;
	}
	if (schema?.defaultChipVariant !== undefined && songRecord.chipVariant === undefined) {
		songRecord.chipVariant = schema.defaultChipVariant;
	}
	if (songRecord.chipVariant === 'ST') {
		songRecord.stMixing = true;
	}
	if (schema?.normalizeSettings) {
		Object.assign(songRecord, schema.normalizeSettings(songRecord));
	}
	const loadedSpeed = data.initialSpeed;
	song.initialSpeed =
		typeof loadedSpeed === 'number' && loadedSpeed >= 1 && loadedSpeed <= 255 ? loadedSpeed : 3;
	const loadedDefaultPatternLength = data.defaultPatternLength;
	song.defaultPatternLength =
		typeof loadedDefaultPatternLength === 'number' &&
		loadedDefaultPatternLength >= 1 &&
		loadedDefaultPatternLength <= 256
			? Math.floor(loadedDefaultPatternLength)
			: DEFAULT_PATTERN_LENGTH;
	return song;
}

function reconstructPattern(
	data: any,
	schema?: ChipSchema,
	effectiveChannelLabels?: string[]
): Pattern {
	const length = data.length ?? DEFAULT_PATTERN_LENGTH;
	const pattern = new Pattern(data.id ?? 0, length, schema, effectiveChannelLabels);
	const channelLabels = effectiveChannelLabels ?? schema?.channelLabels ?? ['A', 'B', 'C'];
	if (data.channels) {
		pattern.channels = data.channels.map((channelData: any, index: number) =>
			reconstructChannel(
				channelData,
				channelLabels[index] ?? String.fromCharCode(65 + index),
				schema
			)
		);
	}
	if (data.patternRows && data.patternRows.length > 0) {
		pattern.patternRows = data.patternRows.map((rowData: any) =>
			reconstructPatternRow(rowData, schema)
		);
	}
	return pattern;
}

function reconstructChannel(data: any, label: string, schema?: ChipSchema): Channel {
	const channel = new Channel(data.rows?.length || 64, label, schema?.fields);
	if (data.rows) {
		channel.rows = data.rows.map((rowData: any) => reconstructRow(rowData, schema));
	}
	return channel;
}

function reconstructRow(data: any, schema?: ChipSchema): Row {
	const row = new Row(schema?.fields, data);
	row.note = data.note ? reconstructNote(data.note) : new Note();
	row.effects = data.effects?.map((effectData: any) =>
		effectData ? reconstructEffect(effectData) : null
	) || [null];
	return row;
}

function reconstructNote(data: any): Note {
	return new Note(data.name ?? NoteName.None, data.octave ?? 0);
}

function reconstructEffect(data: any): Effect {
	return new Effect(data.effect ?? 0, data.delay ?? 0, data.parameter ?? 0, data.tableIndex);
}

function reconstructPatternRow(data: any, schema?: ChipSchema): any {
	const result: Record<string, unknown> = {};
	if (schema?.globalFields) {
		for (const key of Object.keys(schema.globalFields)) {
			if (data[key] !== undefined) {
				if (key.toLowerCase().includes('effect') && data[key]) {
					result[key] = reconstructEffect(data[key]);
				} else {
					result[key] = data[key];
				}
			}
		}
	}
	for (const key of Object.keys(data)) {
		if (result[key] === undefined) {
			if (key.toLowerCase().includes('effect') && data[key]) {
				result[key] = reconstructEffect(data[key]);
			} else {
				result[key] = data[key];
			}
		}
	}
	return result;
}

function reconstructInstrument(data: any): Instrument {
	let id: string;
	if (typeof data.id === 'string') {
		id = data.id;
	} else {
		const numId = data.id ?? 1;
		id = numId.toString(36).toUpperCase().padStart(2, '0');
	}
	const instrument = new Instrument(
		id,
		[],
		data.loop ?? 0,
		data.name ?? '',
		typeof data.chipType === 'string' ? data.chipType : 'ay'
	);
	if (data.rows) {
		instrument.rows = data.rows.map((rowData: any) =>
			reconstructInstrumentRow(rowData, instrument.chipType)
		);
	}
	if (data.timerRows) {
		(
			instrument as Instrument & {
				timerRows?: {
					sid: boolean;
					syncbuzzer?: boolean;
					fm?: boolean;
					envFm?: boolean;
					fmOffsetMode?: 'semitone' | 'period';
					sidPeriodMode?: 'auto' | 'manual';
					detune?: number;
					period?: number;
					semitone?: number;
					timerWaveform?: number[];
					timerWaveformLoop?: number;
					fmWaveform?: number[];
					fmWaveformLoop?: number;
					envFmWaveform?: number[];
					envFmWaveformLoop?: number;
				}[];
			}
		).timerRows = data.timerRows.map(
			(row: {
				sid?: boolean;
				syncbuzzer?: boolean;
				fm?: boolean;
				envFm?: boolean;
				fmOffsetMode?: 'semitone' | 'period';
				sidPeriodMode?: 'auto' | 'manual';
				detune?: number;
				period?: number;
				semitone?: number;
				timerWaveform?: number[];
				timerWaveformLoop?: number;
				fmWaveform?: number[];
				fmWaveformLoop?: number;
				envFmWaveform?: number[];
				envFmWaveformLoop?: number;
				timerPwmDuty?: number;
				timerPwmSweepMin?: number;
				timerPwmSweep?: number;
			}) => {
				const timerRow: {
					sid: boolean;
					syncbuzzer?: boolean;
					fm?: boolean;
					envFm?: boolean;
					fmOffsetMode?: 'semitone' | 'period';
					sidPeriodMode?: 'auto' | 'manual';
					detune?: number;
					period?: number;
					semitone?: number;
					timerWaveform?: number[];
					timerWaveformLoop?: number;
					fmWaveform?: number[];
					fmWaveformLoop?: number;
					envFmWaveform?: number[];
					envFmWaveformLoop?: number;
					timerPwmDuty?: number;
					timerPwmSweepMin?: number;
					timerPwmSweep?: number;
				} = {
					sid: row.sid ?? false,
					syncbuzzer: row.syncbuzzer ?? false,
					fm: row.fm ?? false,
					envFm: row.envFm ?? false,
					fmOffsetMode: row.fmOffsetMode === 'period' ? 'period' : 'semitone',
					sidPeriodMode:
						row.sidPeriodMode === 'auto' || row.sidPeriodMode === 'manual'
							? row.sidPeriodMode
							: 'auto'
				};
				if (row.detune !== undefined) timerRow.detune = row.detune;
				if (row.period !== undefined) timerRow.period = row.period;
				if (row.semitone !== undefined) timerRow.semitone = row.semitone;
				if (row.timerWaveform) timerRow.timerWaveform = [...row.timerWaveform];
				if (row.timerWaveformLoop !== undefined) {
					timerRow.timerWaveformLoop = row.timerWaveformLoop;
				}
				if (row.fmWaveform) timerRow.fmWaveform = [...row.fmWaveform];
				if (row.fmWaveformLoop !== undefined) {
					timerRow.fmWaveformLoop = row.fmWaveformLoop;
				}
				if (row.envFmWaveform) timerRow.envFmWaveform = [...row.envFmWaveform];
				if (row.envFmWaveformLoop !== undefined) {
					timerRow.envFmWaveformLoop = row.envFmWaveformLoop;
				}
				if (row.timerPwmDuty !== undefined) timerRow.timerPwmDuty = row.timerPwmDuty;
				if (row.timerPwmSweepMin !== undefined)
					timerRow.timerPwmSweepMin = row.timerPwmSweepMin;
				if (row.timerPwmSweep !== undefined) timerRow.timerPwmSweep = row.timerPwmSweep;
				return timerRow;
			}
		);
	}
	if (data.timerLoop !== undefined) {
		(
			instrument as Instrument & {
				timerLoop?: number;
			}
		).timerLoop = data.timerLoop;
	}
	const extended = instrument as Instrument & {
		timerPwmDuty?: number;
		timerPwmSweepMin?: number;
		timerPwmSweep?: number;
		timerPwmPreserveOnNewNote?: boolean;
		timerPwmReverseSweep?: boolean;
		timerPwmSweepStartPhase?: number;
		timerPwmSweepShape?: string;
	};
	if (data.timerPwmDuty !== undefined) extended.timerPwmDuty = data.timerPwmDuty;
	if (data.timerPwmSweepMin !== undefined) extended.timerPwmSweepMin = data.timerPwmSweepMin;
	if (data.timerPwmSweep !== undefined) extended.timerPwmSweep = data.timerPwmSweep;
	if (data.timerPwmPreserveOnNewNote !== undefined) {
		extended.timerPwmPreserveOnNewNote = data.timerPwmPreserveOnNewNote === true;
	}
	if (data.timerPwmSweepStartPhase !== undefined) {
		extended.timerPwmSweepStartPhase = data.timerPwmSweepStartPhase;
	}
	if (data.timerPwmReverseSweep !== undefined) {
		extended.timerPwmReverseSweep = data.timerPwmReverseSweep === true;
	}
	if (data.timerPwmSweepShape !== undefined) {
		extended.timerPwmSweepShape = data.timerPwmSweepShape as typeof extended.timerPwmSweepShape;
	}
	const withSample = extended as Instrument & {
		sampleData?: number[];
		sampleRate?: number;
		sampleStart?: number;
		sampleEnd?: number;
		sampleLoopStart?: number;
		sampleLength?: number;
		sampleLoopEnabled?: boolean;
		sampleLoop?: number;
	};
	if (Array.isArray(data.sampleData) && data.sampleData.length > 0) {
		const sampleBytes = data.sampleData.map((value: number) => value & 0xff);
		if (isValidInstrumentSampleByteLength(sampleBytes.length)) {
			withSample.sampleData = sampleBytes;
		}
	}
	if (typeof data.sampleRate === 'number' && data.sampleRate > 0) {
		withSample.sampleRate = data.sampleRate;
	}
	if (withSample.sampleData?.length) {
		const bounds = normalizeSamplePlaybackBounds({
			sampleData: withSample.sampleData,
			sampleStart: data.sampleStart ?? data.sampleLoop,
			sampleEnd: data.sampleEnd,
			sampleLoopStart: data.sampleLoopStart ?? data.sampleLoop,
			sampleLength: data.sampleLength,
			sampleLoop: data.sampleLoop
		});
		if (bounds) {
			withSample.sampleStart = bounds.start;
			withSample.sampleEnd = bounds.end;
			withSample.sampleLoopStart = bounds.loopStart;
		}
		if (data.sampleLoopEnabled === false) {
			withSample.sampleLoopEnabled = false;
		} else {
			withSample.sampleLoopEnabled = true;
		}
	}
	return instrument;
}

function reconstructInstrumentRow(data: any, chipType?: string): InstrumentRow {
	const rowData = data ?? {};
	switch (chipType) {
		case 'nes':
			return new InstrumentRow(normalizeNesInstrumentRow(rowData));
		case 'ay':
		default:
			return new InstrumentRow({
				tone: rowData.tone ?? false,
				noise: rowData.noise ?? false,
				envelope: rowData.envelope ?? false,
				toneAdd: rowData.toneAdd ?? 0,
				noiseAdd: rowData.noiseAdd ?? 0,
				envelopeAdd: rowData.envelopeAdd ?? 0,
				envelopeAccumulation: rowData.envelopeAccumulation ?? false,
				volume: rowData.volume ?? 0,
				loop: rowData.loop ?? false,
				amplitudeSliding: rowData.amplitudeSliding ?? false,
				amplitudeSlideUp: rowData.amplitudeSlideUp ?? false,
				toneAccumulation: rowData.toneAccumulation ?? false,
				noiseAccumulation: rowData.noiseAccumulation ?? false,
				retriggerEnvelope: rowData.retriggerEnvelope ?? false
			});
	}
}

export class FileImportService {
	static reconstructFromJson(json: string, getChip?: (chipType: string) => Chip | null): Project {
		const data = JSON.parse(json);
		const resolveChip =
			getChip ??
			((type: string) => {
				throw new Error(
					'getChip is required when using FileImportService outside browser context. Use reconstructFromJsonWithChip or pass getChip.'
				);
			});
		return reconstructProject(data, resolveChip);
	}

	static async reconstructFromJsonAsync(json: string): Promise<Project> {
		const { getChipByType } = await import('../../../chips/registry');
		return this.reconstructFromJson(json, getChipByType);
	}

	static async decompressData(blob: Blob): Promise<string> {
		const stream = blob.stream();
		const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
		const chunks: Uint8Array[] = [];
		const reader = decompressedStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		const decoder = new TextDecoder();
		return decoder.decode(combined);
	}

	static async importModule(): Promise<Project | null> {
		try {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.pt3,.vt2,.taym,.psg';
			input.style.display = 'none';

			document.body.appendChild(input);

			return new Promise((resolve, reject) => {
				input.onchange = async (event) => {
					const target = event.target as HTMLInputElement;
					const file = target.files?.[0];

					document.body.removeChild(input);

					if (!file) {
						resolve(null);
						return;
					}

					try {
						const buffer = await file.arrayBuffer();
						const bytes = new Uint8Array(buffer);
						const header = String.fromCharCode(
							...bytes.slice(0, Math.min(32, bytes.length))
						);
						const isPT3 =
							header.startsWith('ProTracker 3.') ||
							header.startsWith('Vortex Tracker II');
						const isVT2 = header.startsWith('[Module]');
						const isTaym = isTaymBuffer(buffer);
						const isPsg = isPsgBuffer(buffer);
						if (!isPT3 && !isVT2 && !isTaym && !isPsg) {
							throw new Error(
								'Unknown format. Expected PT3, VT2, TAYM or PSG module (.pt3, .vt2, .taym, .psg).'
							);
						}
						const project = isTaym
							? await loadTaymFile(file)
							: isPsg
								? await loadPsgFile(file)
								: isPT3
									? await loadPT3File(file)
									: await loadVT2File(file);
						resolve(project);
					} catch (error) {
						console.error('Error loading module file:', error);
						reject(error);
					}
				};

				input.oncancel = () => {
					document.body.removeChild(input);
					resolve(null);
				};

				input.click();
			});
		} catch (error) {
			console.error('Error importing module file:', error);
			throw error;
		}
	}

	static async importBTP(): Promise<Project | null> {
		try {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.btp';
			input.style.display = 'none';

			document.body.appendChild(input);

			return new Promise((resolve, reject) => {
				input.onchange = async (event) => {
					const target = event.target as HTMLInputElement;
					const file = target.files?.[0];

					document.body.removeChild(input);

					if (!file) {
						resolve(null);
						return;
					}

					try {
						const text = await this.decompressData(file);
						const project = await this.reconstructFromJsonAsync(text);
						resolve(project);
					} catch (error) {
						console.error('Error loading BTP file:', error);
						reject(error);
					}
				};

				input.oncancel = () => {
					document.body.removeChild(input);
					resolve(null);
				};

				input.click();
			});
		} catch (error) {
			console.error('Error importing BTP file:', error);
			throw error;
		}
	}

	static async handleMenuAction(action: string): Promise<Project | null> {
		switch (action) {
			case 'open':
				return await this.importBTP();
			case 'import-module':
				return await this.importModule();
			default:
				console.warn('Unknown import action:', action);
				return null;
		}
	}
}

export async function handleFileImport(action: string): Promise<Project | null> {
	return FileImportService.handleMenuAction(action);
}
