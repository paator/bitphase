import type { Project } from '../../models/project';
import type { Pattern } from '../../models/song';
import type { Chip } from '../../chips/types';
import type { ResourceLoader } from '../../chips/base/resource-loader';
import type {
	RenderOptions,
	SharedTimelineExportResult,
	SharedTimelineExportSlot
} from '../../chips/base/renderer';
import { AYUMI_AUDIO_SLOT_KIND } from '../../chips/ay/audio-slot-kind';
import { NES_AUDIO_SLOT_KIND } from '../../chips/nes/audio-slot-kind';
import { AYChipRenderer } from '../../chips/ay/renderer';
import { NESChipRenderer } from '../../chips/nes/renderer';
import { createAySharedTimelineExportLane } from '../../chips/ay/shared-timeline-export-lane';
import { createNesSharedTimelineExportLane } from '../../chips/nes/shared-timeline-export-lane';
import {
	renderOfflineSharedTimeline,
	type OfflineSharedTimeline
} from './offline-shared-timeline-render';

const SAMPLE_RATE = 44100;

function calculateTotalRows(song: { patterns: Pattern[] }, patternOrder: number[]): number {
	let totalRows = 0;
	for (const patternId of patternOrder) {
		const pattern = song.patterns.find((entry) => entry.id === patternId);
		if (pattern) {
			totalRows += pattern.length;
		}
	}
	return totalRows;
}

function calculateCurrentRow(
	timeline: {
		currentPatternOrderIndex: number;
		currentRow: number;
		patternOrder: number[];
	},
	song: { patterns: Pattern[] }
): number {
	let currentRow = 0;
	for (let i = 0; i < timeline.currentPatternOrderIndex; i++) {
		const patternId = timeline.patternOrder[i];
		const pattern = song.patterns.find((entry) => entry.id === patternId);
		if (pattern) {
			currentRow += pattern.length;
		}
	}
	currentRow += timeline.currentRow;
	return currentRow;
}

async function createLaneForSlot(
	project: Project,
	slot: SharedTimelineExportSlot,
	chip: Chip,
	session: {
		patternOrder: number[];
		startOrderIndex: number;
		sharedTimeline: unknown | null;
		separateChannels: boolean;
		resourceCache: Map<string, unknown>;
	},
	resourceLoader: ResourceLoader | undefined,
	onProgress?: (progress: number, message: string) => void
) {
	if (slot.audioSlotKind === AYUMI_AUDIO_SLOT_KIND) {
		const renderer = chip.createRenderer(resourceLoader, {
			chipType: chip.type,
			audioSlotKind: chip.audioSlotKind
		}) as AYChipRenderer;
		return createAySharedTimelineExportLane(
			renderer,
			project,
			slot.songIndex,
			session,
			onProgress
		);
	}
	if (slot.audioSlotKind === NES_AUDIO_SLOT_KIND) {
		const renderer = chip.createRenderer(resourceLoader, {
			chipType: chip.type,
			audioSlotKind: chip.audioSlotKind
		}) as NESChipRenderer;
		return createNesSharedTimelineExportLane(
			renderer,
			project,
			slot.songIndex,
			session,
			onProgress
		);
	}
	throw new Error(`Unsupported audio slot kind for mixed export: ${slot.audioSlotKind}`);
}

export async function renderMixedChipSharedTimelineSlots(
	project: Project,
	slots: readonly SharedTimelineExportSlot[],
	getChip: (chipType: string) => Chip | null,
	options: RenderOptions | undefined,
	resourceLoader: ResourceLoader | undefined,
	onProgress?: (progress: number, message: string) => void
): Promise<SharedTimelineExportResult[]> {
	const loopCount = Math.max(1, options?.loopCount ?? 1);
	const separateChannels = options?.separateChannels ?? false;
	const patternOrder = project.patternOrder || [0];
	const startOrderIndex =
		options?.startPatternOrderIndex != null &&
		options.startPatternOrderIndex >= 0 &&
		options.startPatternOrderIndex < patternOrder.length
			? options.startPatternOrderIndex
			: 0;

	const session = {
		patternOrder,
		startOrderIndex,
		sharedTimeline: null as unknown | null,
		separateChannels,
		resourceCache: new Map<string, unknown>()
	};

	const lanes = [];
	try {
		for (const slot of slots) {
			const song = project.songs[slot.songIndex];
			if (!song?.chipType) {
				throw new Error(`Song ${slot.songIndex + 1} has no chip type`);
			}
			const chip = getChip(song.chipType);
			if (!chip) {
				throw new Error(`No chip available for song ${slot.songIndex + 1}`);
			}
			lanes.push(
				await createLaneForSlot(project, slot, chip, session, resourceLoader, onProgress)
			);
		}

		if (!session.sharedTimeline) {
			throw new Error('Shared timeline was not initialized');
		}

		const leaderSong = project.songs[slots[0]!.songIndex]!;
		const firstPassRows = calculateTotalRows(leaderSong, patternOrder);
		const validLoopPointId =
			project.loopPointId >= 0 && project.loopPointId < patternOrder.length
				? project.loopPointId
				: 0;
		const loopOrderSegment = patternOrder.slice(validLoopPointId);
		const loopSegmentRows = calculateTotalRows(leaderSong, loopOrderSegment);
		const totalRows =
			loopCount <= 1 ? firstPassRows : firstPassRows + loopSegmentRows * (loopCount - 1);

		const timeline = session.sharedTimeline as OfflineSharedTimeline;

		const buffers = await renderOfflineSharedTimeline({
			lanes,
			timeline,
			sampleRate: SAMPLE_RATE,
			loopCount,
			totalRows,
			onProgress,
			calculateCurrentRow: () => calculateCurrentRow(timeline, leaderSong)
		});

		return lanes.map((lane, index) => ({
			songIndex: lane.songIndex,
			channels: buffers[index]!
		}));
	} finally {
		for (const lane of lanes) {
			lane.release();
		}
	}
}

export function isMixedChipSharedTimelineExport(slots: readonly SharedTimelineExportSlot[]): boolean {
	if (slots.length < 2) return false;
	const firstKind = slots[0]?.audioSlotKind;
	return slots.some((slot) => slot.audioSlotKind !== firstKind);
}
