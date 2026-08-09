import type { Song, Instrument, Pattern } from '../models/song';
import { DEFAULT_PATTERN_LENGTH, Instrument as InstrumentModel } from '../models/song';
import { Project, Table } from '../models/project';
import {
	filterInstrumentsForActiveChipTypes,
	resolveInstrumentChipType
} from '../services/instrument/instrument-filter';
import { getNextAvailableInstrumentId } from '../utils/instrument-id';
import { channelMuteStore } from './channel-mute.svelte';
import { undoRedoStore } from './undo-redo.svelte';
import type { ProjectDiff, ProjectHistoryEntry, ProjectHistoryMetadata } from '../models/history';
import { HistoryClone } from '../services/history/history-clone';
import { ProjectDiffService } from '../services/history/project-diff-service';
import { ProjectHistoryEntryFactory } from '../services/history/project-history-entry-factory';

class ProjectStore {
	songs = $state<Song[]>([]);
	patterns = $state<Pattern[][]>([]);
	patternOrder = $state<number[]>([]);
	loopPointId = $state(0);
	patternOrderColors = $state<Record<number, string>>({});
	tables = $state<Table[]>([]);
	instruments = $state<Instrument[]>([]);
	settings = $state<Record<string, unknown>>({
		title: '',
		author: '',
		initialSpeed: 3,
		defaultPatternLength: DEFAULT_PATTERN_LENGTH
	});
	initialized = $state(false);

	recordHistory(metadata: ProjectHistoryMetadata, diffs: ProjectDiff[]): void {
		if (undoRedoStore.isApplying) return;
		const entry = ProjectHistoryEntryFactory.create(metadata, diffs);
		if (entry) undoRedoStore.pushProjectEntry(entry);
	}

	applyHistoryEntry(entry: ProjectHistoryEntry, direction: 'undo' | 'redo'): void {
		const diffs = direction === 'undo' ? entry.inverseDiffs : entry.diffs;
		ProjectDiffService.applyAll(this, diffs);
		this.refreshHistoryDomains(entry);
	}

	createSetDiff(path: (string | number)[], before: unknown, after: unknown): ProjectDiff {
		return {
			kind: 'set',
			path,
			before: HistoryClone.value(before),
			after: HistoryClone.value(after)
		};
	}

	cloneForHistory<T>(value: T): T {
		return HistoryClone.value(value);
	}

	private refreshHistoryDomains(entry: ProjectHistoryEntry): void {
		if (entry.affectedDomains.includes('songs') || entry.affectedDomains.includes('chipSettings')) {
			this.songs = [...this.songs];
		}
		if (
			entry.affectedDomains.includes('patterns') ||
			entry.affectedDomains.includes('virtualChannels')
		) {
			this.patterns = [...this.patterns];
		}
		if (entry.affectedDomains.includes('patternOrder')) {
			this.patternOrder = [...this.patternOrder];
			this.patternOrderColors = { ...this.patternOrderColors };
		}
		if (entry.affectedDomains.includes('tables')) {
			this.tables = [...this.tables];
		}
		if (entry.affectedDomains.includes('instruments')) {
			this.instruments = [...this.instruments];
		}
		if (entry.affectedDomains.includes('settings')) {
			this.settings = { ...this.settings };
		}
	}

	applyProject(project: Project): void {
		undoRedoStore.clear();
		channelMuteStore.clear();
		this.settings = {
			title: project.name,
			author: project.author,
			initialSpeed: project.songs[0]?.initialSpeed ?? 3,
			defaultPatternLength: project.songs[0]?.defaultPatternLength ?? DEFAULT_PATTERN_LENGTH
		};
		this.patterns = project.songs.map((song) => song.patterns);
		this.songs = project.songs;
		this.patternOrder = project.patternOrder;
		const maxLoop = Math.max(0, project.patternOrder.length - 1);
		this.loopPointId = Math.min(Math.max(0, project.loopPointId), maxLoop);
		this.patternOrderColors = project.patternOrderColors ?? {};
		this.tables = project.tables;
		this.instruments = project.instruments;
	}

	getCurrentProject(): Project {
		const songs = this.songs.map((song, i) => {
			song.patterns = this.patterns[i] ?? [];
			return song;
		});
		return new Project(
			this.settings.title as string,
			this.settings.author as string,
			songs,
			this.loopPointId,
			this.patternOrder,
			this.tables,
			this.patternOrderColors,
			this.instruments
		);
	}

	removeSong(index: number): void {
		this.songs = this.songs.filter((_, i) => i !== index);
		this.patterns = this.patterns.filter((_, i) => i !== index);
		this.instruments = filterInstrumentsForActiveChipTypes(this.songs, this.instruments);
		channelMuteStore.removeChip(index);
	}

	addSong(song: Song): void {
		const projectInitialSpeed = this.settings.initialSpeed;
		if (typeof projectInitialSpeed === 'number' && projectInitialSpeed >= 1) {
			song.initialSpeed = projectInitialSpeed;
		}
		const projectDefaultPatternLength = this.settings.defaultPatternLength;
		if (
			typeof projectDefaultPatternLength === 'number' &&
			projectDefaultPatternLength >= 1 &&
			projectDefaultPatternLength <= 256
		) {
			song.defaultPatternLength = projectDefaultPatternLength;
		}
		this.songs = [...this.songs, song];
		this.patterns = [...this.patterns, song.patterns];
		this.ensureDefaultInstrumentForChip(song.chipType);
	}

	private ensureDefaultInstrumentForChip(chipType: string | undefined): void {
		if (!chipType) return;
		const hasInstrumentForChip = this.instruments.some(
			(instrument) => resolveInstrumentChipType(instrument) === chipType
		);
		if (hasInstrumentForChip) return;
		const newId = getNextAvailableInstrumentId(this.instruments.map((instrument) => instrument.id));
		if (!newId) return;
		this.instruments = [
			...this.instruments,
			new InstrumentModel(newId, [], 0, `Instrument ${newId}`, chipType)
		];
	}

	getDefaultPatternLength(): number {
		const value = this.settings.defaultPatternLength;
		if (typeof value === 'number' && value >= 1 && value <= 256) {
			return Math.floor(value);
		}
		return DEFAULT_PATTERN_LENGTH;
	}

	updatePatterns(songIndex: number, newPatterns: Pattern[]): void {
		this.patterns[songIndex] = newPatterns;
		this.patterns = [...this.patterns];
	}

	addPatternToAllSongs(pattern: Pattern): void {
		this.patterns = this.patterns.map((songPatterns) => {
			const existing = songPatterns.find((p) => p.id === pattern.id);
			if (existing) {
				return songPatterns.map((p) => (p.id === pattern.id ? pattern : p));
			}
			return [...songPatterns, pattern];
		});
	}
}

export const projectStore = new ProjectStore();
undoRedoStore.setProjectEntryApplier((entry, direction) => projectStore.applyHistoryEntry(entry, direction));
