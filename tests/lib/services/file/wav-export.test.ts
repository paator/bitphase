import { describe, it, expect, vi } from 'vitest';
import { exportToWAV } from '../../../../src/lib/services/file/wav-export';
import type { Chip } from '../../../../src/lib/chips/types';
import { Project } from '../../../../src/lib/models/project';
import { Song, Pattern } from '../../../../src/lib/models/song';

describe('wav export loop behavior', () => {
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
			processorName: '',
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
});
