import { describe, it, expect } from 'vitest';
import { FileImportService } from '@/lib/services/file/project/file-import';
import { FileExportService } from '@/lib/services/file/project/file-export';
import { normalizeAyInstrumentFields, sampleTimerRowFromInstrument } from '@/lib/chips/ay/instrument';
import { decodeTimerWaveform } from '@/lib/chips/ay/ay-timer-macros';
import { Instrument, NoteName } from '@/lib/models/song';

describe('FileImportService', () => {
	it('reads tempo and initial speed from the project', async () => {
		const json = JSON.stringify({
			name: 'clock',
			author: '',
			songs: [{ initialSpeed: 9, tempo: 200, patterns: [] }],
			initialSpeed: 4,
			tempo: 90,
			patternOrder: [0],
			tables: [],
			instruments: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.initialSpeed).toBe(4);
		expect(project.tempo).toBe(90);
	});

	it('lifts tempo and initial speed from the first song of an older file', async () => {
		const json = JSON.stringify({
			name: 'legacy',
			author: '',
			songs: [
				{ initialSpeed: 7, tempo: 140, patterns: [] },
				{ initialSpeed: 2, tempo: 100, patterns: [] }
			],
			patternOrder: [0],
			tables: [],
			instruments: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.initialSpeed).toBe(7);
		expect(project.tempo).toBe(140);
	});

	it('caps each hardware channel at 3 virtual channels when loading', async () => {
		const channel = (label: string, noteName?: number) => ({
			label,
			rows: noteName === undefined ? [] : [{ note: { name: noteName, octave: 4 } }]
		});
		const json = JSON.stringify({
			name: 'split',
			songs: [
				{
					virtualChannelMap: { 0: 5 },
					patterns: [
						{
							id: 0,
							length: 1,
							channels: [
								channel('A1', NoteName.C),
								channel('A2'),
								channel('A3'),
								channel('A4', NoteName.E),
								channel('A5'),
								channel('B', NoteName.D),
								channel('C')
							]
						}
					]
				}
			],
			patternOrder: [0],
			tables: [],
			instruments: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const pattern = project.songs[0].patterns[0];

		expect(project.songs[0].virtualChannelMap).toEqual({ 0: 3 });
		expect(project.songs[0].virtualChannelRoles).toEqual({});
		expect(pattern.channels.map((item) => item.label)).toEqual(['A1', 'A2', 'A3', 'B', 'C']);
		expect(pattern.channels[0].rows[0].note.name).toBe(NoteName.C);
		expect(pattern.channels[3].rows[0].note.name).toBe(NoteName.D);
	});

	it('keeps an AY timer role and drops roles the chip does not declare', async () => {
		const json = JSON.stringify({
			name: 'roles',
			songs: [
				{
					chipType: 'ay',
					virtualChannelMap: { 0: 2 },
					virtualChannelRoles: { 0: { 0: 'nope', 1: 'timer' } },
					patterns: []
				},
				{
					chipType: 'nes',
					virtualChannelMap: { 0: 2 },
					virtualChannelRoles: { 0: { 1: 'timer' } },
					patterns: []
				}
			],
			patternOrder: [0],
			tables: [],
			instruments: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.songs[0].virtualChannelRoles).toEqual({ 0: { 1: 'timer' } });
		expect(project.songs[1].virtualChannelRoles).toEqual({});
	});

	it('preserves projects with zero songs', async () => {
		const json = JSON.stringify({
			name: 'empty',
			author: 'test',
			songs: [],
			patternOrder: [0],
			tables: [{ id: 0, rows: [], loop: 0, name: 'Table 1' }],
			instruments: [{ id: '01', name: 'Instrument 01', loop: 0, rows: [] }]
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.songs).toHaveLength(0);
		expect(project.name).toBe('empty');
		expect(project.instruments).toHaveLength(1);
		expect(project.tables).toHaveLength(1);
	});

	it('preserves instrument color when reconstructing', async () => {
		const json = JSON.stringify({
			name: 'colored',
			songs: [],
			patternOrder: [0],
			tables: [],
			instruments: [{ id: '01', name: 'Lead', color: '#FF00AA', loop: 0, rows: [] }]
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.instruments[0].color).toBe('#ff00aa');
	});

	it('ignores invalid instrument color when reconstructing', async () => {
		const json = JSON.stringify({
			name: 'colored',
			songs: [],
			patternOrder: [0],
			tables: [],
			instruments: [{ id: '01', name: 'Lead', color: 'red', loop: 0, rows: [] }]
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);

		expect(project.instruments[0].color).toBeUndefined();
	});

	it('preserves fm and env-fm timer waveforms when reconstructing instruments', async () => {
		const json = JSON.stringify({
			name: 'test',
			chipType: 'AY',
			songs: [],
			instruments: [
				{
					id: '01',
					name: 'I01',
					loop: 0,
					rows: [{ tone: true, volume: 15, noise: false, envelope: true }],
					timerRows: [
						{
							sid: false,
							syncbuzzer: false,
							fm: true,
							envFm: true,
							fmOffsetMode: 'semitone',
							timerWaveform: [15, 0],
							timerWaveformLoop: 0,
							fmWaveform: [0, 12, -4],
							fmWaveformLoop: 1,
							envFmWaveform: [0, -7, 24],
							envFmWaveformLoop: 2
						}
					],
					timerLoop: 0
				}
			],
			patterns: [],
			tables: [],
			tuningTables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const instrument = project.instruments[0] as Instrument & {
			timerMacros?: Record<string, { values: string[]; loop: number }>;
		};

		expect(decodeTimerWaveform(instrument.timerMacros?.fmWaveform?.values[0] ?? '')).toEqual([
			0, 12, -4
		]);
		expect(instrument.timerMacros?.fmWaveform?.loop).toBe(0);
		expect(decodeTimerWaveform(instrument.timerMacros?.envFmWaveform?.values[0] ?? '')).toEqual([
			0, -7, 24
		]);
		expect(instrument.timerMacros?.envFmWaveform?.loop).toBe(0);

		const fields = normalizeAyInstrumentFields(instrument);
		const row = sampleTimerRowFromInstrument(instrument, 0);
		expect(decodeTimerWaveform(String(fields.timerMacros.fmWaveform?.values[0] ?? ''))).toEqual([
			0, 12, -4
		]);
		expect(decodeTimerWaveform(String(fields.timerMacros.envFmWaveform?.values[0] ?? ''))).toEqual([
			0, -7, 24
		]);
		expect(row.fm).toBe(true);
		expect(row.envFm).toBe(true);
		expect(row.fmWaveformLoop).toBe(1);
		expect(row.envFmWaveformLoop).toBe(2);
	});

	it('preserves fm period offset mode when reconstructing instruments', async () => {
		const json = JSON.stringify({
			name: 'test',
			chipType: 'AY',
			songs: [],
			instruments: [
				{
					id: '09',
					name: 'raspy tone',
					loop: 0,
					rows: [{ tone: true, volume: 15, noise: false, envelope: false }],
					timerRows: [
						{
							sid: false,
							syncbuzzer: false,
							fm: true,
							envFm: false,
							fmOffsetMode: 'period',
							fmWaveform: [0, 24, -24, 0]
						}
					],
					timerLoop: 0
				}
			],
			patterns: [],
			tables: [],
			tuningTables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const instrument = project.instruments[0] as Instrument & {
			timerMacros?: Record<string, { values: unknown[]; loop: number }>;
		};
		const row = sampleTimerRowFromInstrument(instrument, 0);

		expect(instrument.timerMacros?.fmOffsetMode?.values[0]).toBe(1);
		expect(row.fm).toBe(true);
		expect(row.fmOffsetMode).toBe('period');
		expect(row.fmWaveform).toEqual([0, 24, -24, 0]);
	});

	it('reconstructs instruments as Instrument instances', async () => {
		const json = JSON.stringify({
			name: 'test',
			chipType: 'AY',
			songs: [],
			instruments: [
				{
					id: '01',
					name: 'I01',
					loop: 0,
					rows: [{ tone: true, volume: 15 }],
					timerRows: [{ sid: true }],
					timerLoop: 0
				}
			],
			patterns: [],
			tables: [],
			tuningTables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		expect(project.instruments[0]).toBeInstanceOf(Instrument);
		expect(sampleTimerRowFromInstrument(project.instruments[0], 0).sid).toBe(true);
	});

	it('preserves amplitude slide down when reconstructing mixer rows', async () => {
		const json = JSON.stringify({
			name: 'test',
			chipType: 'AY',
			songs: [],
			instruments: [
				{
					id: '0A',
					name: 'looong decay',
					loop: 0,
					rows: [
						{ tone: true, volume: 15, amplitudeSliding: false, amplitudeSlideUp: false },
						{ tone: true, volume: 15, amplitudeSliding: true, amplitudeSlideUp: false }
					]
				}
			],
			patterns: [],
			tables: [],
			tuningTables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const instrument = project.instruments[0] as Instrument & {
			macros?: Record<string, { values: unknown[] }>;
		};

		expect(instrument.macros?.amplitudeSlide?.values).toEqual([0, -1]);
	});

	it('applies the old timerLoop to every migrated timer macro', async () => {
		const json = JSON.stringify({
			name: 'test',
			chipType: 'AY',
			songs: [],
			instruments: [
				{
					id: '01',
					name: 'I01',
					loop: 0,
					rows: [{ tone: true, volume: 15 }],
					timerRows: [
						{ sid: true, timerWaveform: [15, 0] },
						{ sid: true, timerWaveform: [15, 8] },
						{ sid: false, timerWaveform: [15, 0] }
					],
					timerLoop: 2
				}
			],
			patterns: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const instrument = project.instruments[0] as Instrument & {
			timerMacros?: Record<string, { values: unknown[]; loop: number }>;
			timerLoop?: number;
		};

		expect(instrument.timerLoop).toBeUndefined();
		expect(instrument.timerMacros?.sid?.values).toEqual([true, true, false]);
		expect(instrument.timerMacros?.sid?.loop).toBe(2);
		expect(instrument.timerMacros?.timerWaveform?.loop).toBe(2);
		expect(instrument.timerMacros?.fm?.loop).toBe(2);
	});

	it('preserves NES pulse width and retrigger when reconstructing instruments', async () => {
		const json = JSON.stringify({
			name: 'test',
			songs: [],
			instruments: [
				{
					id: '01',
					chipType: 'nes',
					name: 'Pulse',
					loop: 0,
					rows: [
						{
							pulseWidth: 1,
							retrigger: true,
							toneAdd: -2,
							toneAccumulation: true
						}
					]
				}
			],
			patterns: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const instrument = project.instruments[0];

		expect(instrument?.macros?.pulseWidth?.values[0]).toBe(1);
		expect(instrument?.macros?.retrigger?.values[0]).toBe(true);
		expect(instrument?.macros?.toneAdd?.values[0]).toBe(-2);
		expect(instrument?.macros?.toneAccumulation?.values[0]).toBe(true);
	});

	it('preserves independent instrument macros', async () => {
		const json = JSON.stringify({
			name: 'test',
			songs: [],
			instruments: [
				{
					id: '01',
					chipType: 'ay',
					name: 'Macros',
					loop: 0,
					rows: [{ tone: true, volume: 15 }],
					macros: {
						volume: { values: [15, 12, 8], loop: 1 },
						tone: { values: [true, false], loop: 0 }
					}
				}
			],
			patterns: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		expect(project.instruments[0]?.macros?.volume).toEqual({
			values: [15, 12, 8],
			loop: 1
		});
		expect(project.instruments[0]?.macros?.tone).toEqual({
			values: [true, false],
			loop: 0
		});
	});

	it('defaults old patterns to one effect column', async () => {
		const json = JSON.stringify({
			name: 'old',
			songs: [
				{
					patterns: [
						{
							id: 0,
							length: 1,
							channels: [
								{
									label: 'A',
									rows: [
										{
											note: { name: 0, octave: 0 },
											effects: [null]
										}
									]
								}
							],
							patternRows: [{}]
						}
					]
				}
			],
			instruments: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const channel = project.songs[0]?.patterns[0]?.channels[0];
		expect(channel?.effectColumnCount).toBe(1);
		expect(channel?.rows[0]?.effects).toHaveLength(1);
	});

	it('reconstructs extra effect columns from effects arrays', async () => {
		const json = JSON.stringify({
			name: 'extra',
			songs: [
				{
					patterns: [
						{
							id: 0,
							length: 1,
							channels: [
								{
									label: 'A',
									rows: [
										{
											note: { name: 0, octave: 0 },
											effects: [
												{ effect: 65, delay: 1, parameter: 0x37 },
												{ effect: 86, delay: 4, parameter: 0x44 }
											]
										}
									]
								}
							],
							patternRows: [{}]
						}
					]
				}
			],
			instruments: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const channel = project.songs[0]?.patterns[0]?.channels[0];
		expect(channel?.effectColumnCount).toBe(2);
		expect(channel?.rows[0]?.effects).toHaveLength(2);
		expect(channel?.rows[0]?.effects[1]?.effect).toBe(86);
		expect(channel?.rows[0]?.effects[1]?.parameter).toBe(0x44);
	});

	it('aligns effect columns across imported patterns', async () => {
		const json = JSON.stringify({
			name: 'mixed',
			songs: [
				{
					patterns: [
						{
							id: 0,
							length: 1,
							channels: [
								{
									label: 'A',
									effectColumnCount: 2,
									rows: [{ note: { name: 0, octave: 0 }, effects: [null, null] }]
								}
							],
							patternRows: [{}]
						},
						{
							id: 1,
							length: 1,
							channels: [
								{
									label: 'A',
									effectColumnCount: 1,
									rows: [{ note: { name: 0, octave: 0 }, effects: [null] }]
								}
							],
							patternRows: [{}]
						}
					]
				}
			],
			instruments: [],
			tables: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		expect(project.songs[0]?.patterns[0]?.channels[0]?.effectColumnCount).toBe(2);
		expect(project.songs[0]?.patterns[1]?.channels[0]?.effectColumnCount).toBe(2);
		expect(project.songs[0]?.patterns[1]?.channels[0]?.rows[0]?.effects).toHaveLength(2);
	});

	it('drops a saved chip schema and reloads the schema for the song chip', async () => {
		const json = JSON.stringify({
			name: 'nes',
			author: '',
			songs: [
				{
					chipType: 'nes',
					tuningTable: [100],
					schema: {
						chipType: 'ay',
						defaultTuningTable: [1, 2, 3],
						channelLabels: ['X']
					},
					patterns: []
				}
			],
			patternOrder: [0],
			tables: [],
			instruments: []
		});

		const project = await FileImportService.reconstructFromJsonAsync(json);
		const song = project.songs[0]!;

		expect(song.getSchema()?.chipType).toBe('nes');
		expect(song.getSchema()?.channelLabels?.[0]).toBe('Pulse 1');
		expect(song.tuningTable).toEqual([100]);

		const saved = JSON.parse(FileExportService.serializeProject(project)) as {
			songs: { schema?: unknown; tuningTable: number[] }[];
		};
		expect(saved.songs[0]?.schema).toBeUndefined();
		expect(saved.songs[0]?.tuningTable).toEqual([100]);
	});
});
