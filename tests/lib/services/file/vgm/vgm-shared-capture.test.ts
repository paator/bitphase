import { describe, expect, it } from 'vitest';
import { captureVgmProject } from '@/lib/services/file/vgm/vgm-shared-capture';
import type { Project } from '@/lib/models/project';

function songStub(overrides: Record<string, unknown> = {}) {
	return {
		chipType: 'ay',
		chipFrequency: 1773400,
		interruptFrequency: 50,
		initialSpeed: 6,
		patterns: [{ id: 0, length: 1 }],
		tuningTable: [],
		...overrides
	};
}

describe('vgm-shared-capture validation', () => {
	it('rejects songs with mismatched interrupt frequencies', async () => {
		const project = {
			name: 'test',
			patternOrder: [0],
			loopPointId: 0,
			songs: [
				songStub({ interruptFrequency: 50 }),
				songStub({ chipType: 'nes', interruptFrequency: 60 })
			],
			instruments: [],
			tables: []
		} as unknown as Project;

		await expect(captureVgmProject(project, [0], [1])).rejects.toThrow(
			/same interrupt frequency/
		);
	});

	it('rejects dual AY with mismatched clocks', async () => {
		const project = {
			name: 'test',
			patternOrder: [0],
			loopPointId: 0,
			songs: [
				songStub({ chipFrequency: 1773400 }),
				songStub({ chipFrequency: 2000000 })
			],
			instruments: [],
			tables: []
		} as unknown as Project;

		await expect(captureVgmProject(project, [0, 1], [])).rejects.toThrow(
			/matching chip frequencies/
		);
	});
});
