import { describe, it, expect } from 'vitest';
import { FileImportService } from '@/lib/services/file/project/file-import';
import { normalizeAyInstrumentFields } from '@/lib/chips/ay/instrument';
import type { Instrument } from '@/lib/models/song';

describe('FileImportService', () => {
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
			timerRows?: {
				fmWaveform?: number[];
				fmWaveformLoop?: number;
				envFmWaveform?: number[];
				envFmWaveformLoop?: number;
			}[];
		};

		expect(instrument.timerRows?.[0]?.fmWaveform).toEqual([0, 12, -4]);
		expect(instrument.timerRows?.[0]?.fmWaveformLoop).toBe(1);
		expect(instrument.timerRows?.[0]?.envFmWaveform).toEqual([0, -7, 24]);
		expect(instrument.timerRows?.[0]?.envFmWaveformLoop).toBe(2);

		const fields = normalizeAyInstrumentFields(instrument);
		expect(fields.timerRows[0]?.fmWaveform).toEqual([0, 12, -4]);
		expect(fields.timerRows[0]?.envFmWaveform).toEqual([0, -7, 24]);
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
		const row = project.instruments[0]?.rows[0];

		expect(row?.pulseWidth).toBe(1);
		expect(row?.retrigger).toBe(true);
		expect(row?.toneAdd).toBe(-2);
		expect(row?.toneAccumulation).toBe(true);
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
});
