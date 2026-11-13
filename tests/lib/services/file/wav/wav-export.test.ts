import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { exportToWAV } from '../../../../../src/lib/services/file/wav/wav-export';
import type { Chip } from '../../../../../src/lib/chips/types';
import { Project } from '../../../../../src/lib/models/project';
import { Song, Pattern } from '../../../../../src/lib/models/song';
import { AYUMI_AUDIO_SLOT_KIND } from '../../../../../src/lib/chips/ay/audio-slot-kind';
import { NES_AUDIO_SLOT_KIND } from '../../../../../src/lib/chips/nes/audio-slot-kind';

vi.mock(
	'../../../../../src/lib/services/file/wav/mixed-chip-shared-timeline-export',
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import('../../../../../src/lib/services/file/wav/mixed-chip-shared-timeline-export')
			>();
		return {
			...actual,
			renderMixedChipSharedTimelineSlots: vi.fn(async () => [
				{ songIndex: 0, channels: [new Float32Array([0.1]), new Float32Array([0.1])] },
				{ songIndex: 1, channels: [new Float32Array([0.2]), new Float32Array([0.2])] }
			])
		};
	}
);

import { renderMixedChipSharedTimelineSlots } from '../../../../../src/lib/services/file/wav/mixed-chip-shared-timeline-export';

describe('wav export loop behavior', () => {
	beforeEach(() => {
		vi.mocked(renderMixedChipSharedTimelineSlots).mockClear();
	});

	it('passes loopCount to renderer for continuous stateful looping', async () => {
		const song = new Song();
		song.chipType = 'fake-chip';
		song.patterns = [new Pattern(0, 1), new Pattern(1, 1), new Pattern(2, 1)];

		const project = new Project('Test', '', [song], 1, [0, 1, 2]);

		const fakeRenderer = {
			render: vi.fn(async () => [new Float32Array([0]), new Float32Array([0])])
		};
		const fakeChip = {
			type: 'fake-chip',
			name: 'Fake',
			wasmUrl: '',
			audioSlotKind: 'fake',
			processorMap: () => {
				throw new Error('Not used in test');
			},
			schema: {} as Chip['schema'],
			createConverter: () => {
				throw new Error('Not used in test');
			},
			createFormatter: () => {
				throw new Error('Not used in test');
			},
			createRenderer: () => fakeRenderer
		} as unknown as Chip;

		await exportToWAV(
			project,
			{
				sampleRate: 44100,
				bitDepth: 16,
				loops: 3,
				channelMode: 'mixed',
				stereo: true,
				title: 'test'
			},
			undefined,
			undefined,
			{
				onOutput: async () => {},
				getChip: () => fakeChip
			}
		);

		expect(fakeRenderer.render).toHaveBeenCalledTimes(1);
		const renderCall = fakeRenderer.render.mock.calls[0];
		expect(renderCall?.[3]).toMatchObject({ loopCount: 3 });
	});

	it('uses mixed shared timeline export for AY and NES songs', async () => {
		const aySong = new Song();
		aySong.chipType = 'ay';
		aySong.patterns = [new Pattern(0, 4)];

		const nesSong = new Song();
		nesSong.chipType = 'nes';
		nesSong.patterns = [new Pattern(0, 4)];

		const project = new Project('Test', '', [aySong, nesSong], 1, [0]);

		const ayRenderer = {
			render: vi.fn(async () => [new Float32Array([0]), new Float32Array([0])])
		};
		const nesRenderer = {
			render: vi.fn(async () => [new Float32Array([0]), new Float32Array([0])])
		};

		const chips: Record<string, Chip> = {
			ay: {
				type: 'ay',
				name: 'AY',
				wasmUrl: '',
				audioSlotKind: AYUMI_AUDIO_SLOT_KIND,
				processorMap: () => {
					throw new Error('Not used in test');
				},
				schema: {} as Chip['schema'],
				createConverter: () => {
					throw new Error('Not used in test');
				},
				createFormatter: () => {
					throw new Error('Not used in test');
				},
				createRenderer: () => ayRenderer
			} as unknown as Chip,
			nes: {
				type: 'nes',
				name: 'NES',
				wasmUrl: '',
				audioSlotKind: NES_AUDIO_SLOT_KIND,
				processorMap: () => {
					throw new Error('Not used in test');
				},
				schema: {} as Chip['schema'],
				createConverter: () => {
					throw new Error('Not used in test');
				},
				createFormatter: () => {
					throw new Error('Not used in test');
				},
				createRenderer: () => nesRenderer
			} as unknown as Chip
		};

		await exportToWAV(
			project,
			{
				sampleRate: 44100,
				bitDepth: 16,
				loops: 1,
				channelMode: 'mixed',
				stereo: true,
				title: 'test'
			},
			undefined,
			undefined,
			{
				onOutput: async () => {},
				getChip: (type) => chips[type] ?? null
			}
		);

		expect(renderMixedChipSharedTimelineSlots).toHaveBeenCalledTimes(1);
		expect(ayRenderer.render).not.toHaveBeenCalled();
		expect(nesRenderer.render).not.toHaveBeenCalled();
	});

	it('writes a mono mix when stereo is off', async () => {
		const song = new Song();
		song.chipType = 'fake-chip';
		song.patterns = [new Pattern(0, 1)];
		const project = new Project('Test', '', [song], 1, [0]);
		const fakeRenderer = {
			render: vi.fn(async () => [new Float32Array([0.5]), new Float32Array([-0.5])])
		};
		const fakeChip = {
			type: 'fake-chip',
			name: 'Fake',
			wasmUrl: '',
			audioSlotKind: 'fake',
			processorMap: () => {
				throw new Error('Not used in test');
			},
			schema: {} as Chip['schema'],
			createConverter: () => {
				throw new Error('Not used in test');
			},
			createFormatter: () => {
				throw new Error('Not used in test');
			},
			createRenderer: () => fakeRenderer
		} as unknown as Chip;

		let channels = 0;
		await exportToWAV(
			project,
			{
				sampleRate: 44100,
				bitDepth: 16,
				loops: 1,
				channelMode: 'mixed',
				stereo: false,
				title: 'mono'
			},
			undefined,
			undefined,
			{
				onOutput: async (buffer) => {
					channels = new DataView(buffer).getUint16(22, true);
				},
				getChip: () => fakeChip
			}
		);

		expect(channels).toBe(1);
	});

	it('writes each separate channel as a stereo wav when stereo is on', async () => {
		const song = new Song();
		song.chipType = 'fake-chip';
		song.patterns = [new Pattern(0, 1)];
		const project = new Project('Test', '', [song], 1, [0]);
		const fakeRenderer = {
			render: vi.fn(async (_project, _songIndex, _onProgress, options) => {
				expect(options?.separateChannels).toBe(true);
				expect(options?.stereo).toBe(true);
				return [
					new Float32Array([0.2]),
					new Float32Array([0.1]),
					new Float32Array([0.3]),
					new Float32Array([0.4])
				];
			})
		};
		const fakeChip = {
			type: 'fake-chip',
			name: 'Fake',
			wasmUrl: '',
			audioSlotKind: 'fake',
			processorMap: () => {
				throw new Error('Not used in test');
			},
			schema: { channelLabels: ['A', 'B'] } as Chip['schema'],
			createConverter: () => {
				throw new Error('Not used in test');
			},
			createFormatter: () => {
				throw new Error('Not used in test');
			},
			createRenderer: () => fakeRenderer
		} as unknown as Chip;

		let names: string[] = [];
		const channelCounts: number[] = [];
		await exportToWAV(
			project,
			{
				sampleRate: 44100,
				bitDepth: 16,
				loops: 1,
				channelMode: 'separateFiles',
				stereo: true,
				title: 'stems'
			},
			undefined,
			undefined,
			{
				onOutput: async (buffer) => {
					const zip = await JSZip.loadAsync(buffer);
					names = Object.keys(zip.files).sort();
					for (const name of names) {
						const wav = await zip.files[name]!.async('arraybuffer');
						channelCounts.push(new DataView(wav).getUint16(22, true));
					}
				},
				getChip: () => fakeChip
			}
		);

		expect(names).toEqual(['stems_song1_fake-chip_A.wav', 'stems_song1_fake-chip_B.wav']);
		expect(channelCounts).toEqual([2, 2]);
	});
});
