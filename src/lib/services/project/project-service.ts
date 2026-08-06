import { Project } from '../../models/project';
import { Song } from '../../models/song';
import type { Chip } from '../../chips/types';
import type { AudioService } from '../audio/audio-service';
import { applySchemaDefaults, type ChipSchema } from '../../chips/base/schema';
import { normalizeChipSettingsRecord } from '../../chips/base/chip-settings';
import { getChipByType } from '../../chips/registry';
import { AY_CHIP } from '../../chips/ay';

export class ProjectService {
	constructor(private audioService: AudioService) {}

	createNewProject(): Project {
		return new Project();
	}

	async resetProject(): Promise<Project> {
		this.audioService.clearChipProcessors();
		return this.createNewProject();
	}

	async createNewSong(chip: Chip, existingSongs: Song[] = []): Promise<Song> {
		const newSong = new Song(chip.schema);
		newSong.chipType = chip.type;
		applySchemaDefaults(newSong, chip.schema);
		this.applyChipDefaults(newSong, chip.schema);
		if (existingSongs.length > 0) {
			newSong.initialSpeed = existingSongs[0].initialSpeed;
			newSong.defaultPatternLength = existingSongs[0].defaultPatternLength;
		}
		this.syncFromPeerSongs(newSong, existingSongs, chip.schema);
		await this.audioService.addChipProcessor(chip);
		return newSong;
	}

	async restoreChipProcessorsForSongs(songs: { chipType?: string }[]): Promise<void> {
		this.audioService.clearChipProcessors();
		for (const song of songs) {
			const chip = song.chipType ? getChipByType(song.chipType) : null;
			await this.audioService.addChipProcessor(chip ?? AY_CHIP);
		}
	}

	private syncFromPeerSongs(targetSong: Song, existingSongs: Song[], schema: ChipSchema): void {
		const peer = existingSongs.find((s) => s.chipType === targetSong.chipType);
		if (!peer) return;

		const peerRecord = peer as unknown as Record<string, unknown>;
		const targetRecord = targetSong as unknown as Record<string, unknown>;

		if (schema.settings) {
			for (const setting of schema.settings) {
				const value = peerRecord[setting.key];
				if (value !== undefined) {
					targetRecord[setting.key] = value;
				}
			}
		}

		targetSong.initialSpeed = peer.initialSpeed;
		targetSong.defaultPatternLength = peer.defaultPatternLength;
		targetSong.tuningTable = [...peer.tuningTable];
	}

	static ensureChipSettingsConsistency(songs: Song[]): void {
		if (songs.length <= 1) return;

		const grouped = new Map<string, Song[]>();
		for (const song of songs) {
			if (!song.chipType) continue;
			if (!grouped.has(song.chipType)) {
				grouped.set(song.chipType, []);
			}
			grouped.get(song.chipType)!.push(song);
		}

		for (const [chipType, songsOfType] of grouped) {
			if (songsOfType.length <= 1) continue;

			const chip = getChipByType(chipType);
			if (!chip) continue;

			const source = songsOfType[0];
			const sourceRecord = source as unknown as Record<string, unknown>;

			for (let i = 1; i < songsOfType.length; i++) {
				const target = songsOfType[i];
				const targetRecord = target as unknown as Record<string, unknown>;

				if (chip.schema.settings) {
					for (const setting of chip.schema.settings) {
						const sourceValue = sourceRecord[setting.key];
						if (sourceValue !== undefined && targetRecord[setting.key] !== sourceValue) {
							targetRecord[setting.key] = sourceValue;
						}
					}
				}

				if (chip.schema.normalizeSettings) {
					const normalized = normalizeChipSettingsRecord(
						chip.schema,
						targetRecord
					);
					Object.assign(targetRecord, normalized);
				}

				if (target.initialSpeed !== source.initialSpeed) {
					target.initialSpeed = source.initialSpeed;
				}
				if (target.defaultPatternLength !== source.defaultPatternLength) {
					target.defaultPatternLength = source.defaultPatternLength;
				}
			}

			if (chip.schema.resolveTuningTable) {
				const resolvedTable = chip.schema.resolveTuningTable(sourceRecord);
				for (const song of songsOfType) {
					const currentTable = song.tuningTable;
					if (
						currentTable.length !== resolvedTable.length ||
						currentTable.some((v, i) => v !== resolvedTable[i])
					) {
						song.tuningTable = resolvedTable;
					}
				}
			}
		}
	}

	private applyChipDefaults(song: Song, schema: ChipSchema): void {
		if (schema.resolveTuningTable) {
			const record = song as unknown as Record<string, unknown>;
			song.tuningTable = schema.resolveTuningTable(record);
		} else if (schema.defaultTuningTable) {
			song.tuningTable = schema.defaultTuningTable;
		}
		if (schema.defaultChipVariant !== undefined) {
			song.chipVariant = schema.defaultChipVariant;
		}
	}
}
