import type { Project } from '../../models/project';
import type { Song } from '../../models/song';
import type { AudioService } from '../audio/audio-service';
import type { ProjectService } from '../project/project-service';

export interface PatternEditorRef {
	handleKeyDownFromMenu?(event: KeyboardEvent): void;
	togglePlayback?(): void;
	playFromCursor?(): void;
	resetToBeginning?(): void;
	playPattern?(): void;
	hasSelection?(): boolean;
	applyScript?(result: unknown): void;
}

export interface MenuActionContext {
	getPatternEditor(): PatternEditorRef | null;
	getCurrentProject(): Project;
	applyProject(project: Project): void;
	removeSong(index: number): void;
	addSong(song: Song): void;
	setActiveSongIndex(index: number): void;
	getSongsLength(): number;
	getActiveSongIndex(): number;
	container: { audioService: AudioService };
	projectService: ProjectService;
	playbackStore: { isPlaying: boolean };
	open: (component: unknown, props?: Record<string, unknown>) => Promise<unknown>;
	handleFileImport: (action: string) => Promise<Project | null>;
	handleFileExport: (action: string, project: Project) => Promise<void>;
	clearAutobackup: () => Promise<void>;
	resetPatternEditor: () => void;
	syncChipProcessors: () => void;
}
