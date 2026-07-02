import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToWAV } from '../../../../src/lib/services/file/wav-export';
import type { Chip } from '../../../../src/lib/chips/types';
import { Project } from '../../../../src/lib/models/project';
import { Song, Pattern } from '../../../../src/lib/models/song';
import { AYUMI_AUDIO_SLOT_KIND } from '../../../../src/lib/chips/ay/audio-slot-kind';
import { NES_AUDIO_SLOT_KIND } from '../../../../src/lib/chips/nes/audio-slot-kind';

vi.mock('../../../../src/lib/services/file/mixed-chip-shared-timeline-export', async (importOriginal) => {
	const actual = await importOriginal<
		typeof import('../../../../src/lib/services/file/mixed-chip-shared-timeline-export')
	>();
	return {
		...actual,
		renderMixedChipSharedTimelineSlots: vi.fn(async () => [
			{ songIndex: 0, channels: [new Float32Array([0.1]), new Float32Array([0.1])] },
			{ songIndex: 1, channels: [new Float32Array([0.2]), new Float32Array([0.2])] }
		])
	};
});

import { renderMixedChipSharedTimelineSlots } from '../../../../src/lib/services/file/mixed-chip-shared-timeline-export';

describe('wav export loop behavior', () => {
	beforeEach(() => {
		vi.mocked(renderMixedChipSharedTimelineSlots).mockClear();
	});

	it('passes loopCount to renderer for continuous stateful looping', async () => {
		const song = new Song();
		song.chipType = 'fake-chip';
		song.patterns = [new Pattern(0, 1), new Pattern(1, 1), new Pattern(2, 1)];

		const project = new Project(
			'Test',
			'',
			[song],
			1,
			[0, 1, 2]
		);

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
});
