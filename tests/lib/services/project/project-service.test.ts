import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from '../../../../src/lib/services/project/project-service';
import { Project } from '../../../../src/lib/models/project';
import { Song } from '../../../../src/lib/models/song';
import type { Chip } from '../../../../src/lib/chips/types';
import type { AudioService } from '../../../../src/lib/services/audio/audio-service';

const DEFAULT_TABLE_COUNT = 1;
const DEFAULT_PATTERN_ORDER = [0];
const CHIP_TYPE_AY = 'ay';

describe('ProjectService', () => {
	let mockAudioService: AudioService;
	let projectService: ProjectService;

	const createMockChip = (): Chip => ({
		type: CHIP_TYPE_AY,
		name: 'AY-8910',
		wasmUrl: '',
		audioSlotKind: 'ayumi',
		processorMap: () => ({}) as any,
		schema: {
			chipType: CHIP_TYPE_AY,
			template: '',
			fields: {},
			globalFields: {},
			channelLabels: ['A', 'B', 'C']
		},
		createConverter: () => ({}) as any,
		createFormatter: () => ({}) as any,
		createRenderer: () => ({}) as any,
		instrumentEditor: {} as any
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockAudioService = {
			clearChipProcessors: vi.fn(),
			addChipProcessor: vi.fn().mockResolvedValue(undefined)
		} as unknown as AudioService;

		projectService = new ProjectService(mockAudioService);
	});

	describe('createNewProject', () => {
		it('should create project with default values', () => {
			const project = projectService.createNewProject();

			expect(project).toBeInstanceOf(Project);
			expect(project.name).toBe('');
			expect(project.author).toBe('');
			expect(project.songs).toHaveLength(0);
			expect(project.patternOrder).toEqual(DEFAULT_PATTERN_ORDER);
			expect(project.tables).toHaveLength(DEFAULT_TABLE_COUNT);
		});

		it('should create independent project instances', () => {
			const project1 = projectService.createNewProject();
			const project2 = projectService.createNewProject();

			expect(project1).not.toBe(project2);
			expect(project1.songs).not.toBe(project2.songs);
			expect(project1.patternOrder).not.toBe(project2.patternOrder);
		});
	});

	describe('resetProject', () => {
		it('should clear chip processors before creating new project', async () => {
			const mockChip = createMockChip();

			await projectService.resetProject(mockChip);

			expect(mockAudioService.clearChipProcessors).toHaveBeenCalledOnce();
		});

		it('should add chip processor after creating project', async () => {
			const mockChip = createMockChip();

			await projectService.resetProject(mockChip);

			expect(mockAudioService.addChipProcessor).toHaveBeenCalledOnce();
			expect(mockAudioService.addChipProcessor).toHaveBeenCalledWith(mockChip);
		});

		it('should create new project with chip type applied to first song', async () => {
			const mockChip = createMockChip();

			const project = await projectService.resetProject(mockChip);

			expect(project).toBeInstanceOf(Project);
			expect(project.songs).toHaveLength(1);
			expect(project.songs[0].chipType).toBe(CHIP_TYPE_AY);
		});

		it('should apply chip schema defaultTuningTable and defaultChipVariant to song', async () => {
			const defaultTuningTable = [1, 2, 3];
			const defaultChipVariant = 'YM';
			const mockChip = createMockChip();
			mockChip.schema = {
				...mockChip.schema,
				chipType: 'other',
				defaultTuningTable,
				defaultChipVariant
			};
			mockChip.type = 'other';

			const project = await projectService.resetProject(mockChip);

			expect(project.songs[0].tuningTable).toEqual(defaultTuningTable);
			expect(project.songs[0].chipVariant).toBe(defaultChipVariant);
		});

		it('should always create a song with the chip schema', async () => {
			const mockChip = createMockChip();

			const project = await projectService.resetProject(mockChip);

			expect(project.songs).toHaveLength(1);
			expect(project.songs[0].chipType).toBe(CHIP_TYPE_AY);
			expect(mockAudioService.addChipProcessor).toHaveBeenCalledWith(mockChip);
		});
	});

	describe('createNewSong', () => {
		it('should create song with chip type', async () => {
			const mockChip = createMockChip();

			const song = await projectService.createNewSong(mockChip);

			expect(song).toBeInstanceOf(Song);
			expect(song.chipType).toBe(CHIP_TYPE_AY);
		});

		it('should add chip processor when creating new song', async () => {
			const mockChip = createMockChip();

			await projectService.createNewSong(mockChip);

			expect(mockAudioService.addChipProcessor).toHaveBeenCalledOnce();
			expect(mockAudioService.addChipProcessor).toHaveBeenCalledWith(mockChip);
		});

		it('should inherit initialSpeed from an existing song', async () => {
			const mockChip = createMockChip();
			const existing = new Song(mockChip.schema);
			existing.chipType = CHIP_TYPE_AY;
			existing.initialSpeed = 12;

			const song = await projectService.createNewSong(mockChip, [existing]);

			expect(song.initialSpeed).toBe(12);
		});
	});

	describe('restoreChipProcessorsForSongs', () => {
		it('clears processors and adds one per song using chipType', async () => {
			await projectService.restoreChipProcessorsForSongs([
				{ chipType: 'ay' },
				{ chipType: 'nes' }
			]);

			expect(mockAudioService.clearChipProcessors).toHaveBeenCalledOnce();
			expect(mockAudioService.addChipProcessor).toHaveBeenCalledTimes(2);
		});

		it('falls back to AY when chipType is missing', async () => {
			const { AY_CHIP } = await import('../../../../src/lib/chips/ay');

			await projectService.restoreChipProcessorsForSongs([{}]);

			expect(mockAudioService.addChipProcessor).toHaveBeenCalledWith(AY_CHIP);
		});
	});
});
