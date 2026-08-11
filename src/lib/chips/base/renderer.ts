import type { Project } from '../../models/project';

export interface RenderOptions {
	separateChannels?: boolean;
	startPatternOrderIndex?: number;
	loopCount?: number;
	disableDcFilter?: boolean;
}

export type SharedTimelineExportSlot = {
	songIndex: number;
	audioSlotKind: string;
};

export type SharedTimelineExportResult = {
	songIndex: number;
	channels: Float32Array[];
};

export type ChipRendererBinding = {
	chipType: string;
	audioSlotKind: string;
};

export type SharedTimelineExportBuildSession = {
	patternOrder: number[];
	startOrderIndex: number;
	sharedTimeline: unknown | null;
	separateChannels: boolean;
	resourceCache?: Map<string, unknown>;
};

export type SharedTimelineExportLaneHandle = {
	songIndex: number;
	audioSlotKind: string;
	separateChannels: boolean;
	getLeaderPatternRowCount(): number;
	runSharedPlaybackQuantum(): void;
	onPatternOrderAdvanced(needsChange: boolean): void;
	captureSample(sampleIndex: number): { left: number; right: number; channels?: number[] };
	createChannelBuffers?(): number[][];
	release(): void;
};

export function assertSharedTimelineSlotsForChip(
	slots: readonly SharedTimelineExportSlot[],
	binding: ChipRendererBinding
): void {
	if (slots.length < 2) {
		throw new Error('renderSharedTimelineSlots requires at least two slots');
	}
	for (const slot of slots) {
		if (slot.audioSlotKind !== binding.audioSlotKind) {
			throw new Error(
				`Expected audioSlotKind "${binding.audioSlotKind}" for all slots, got "${slot.audioSlotKind}"`
			);
		}
	}
}

export interface ChipRenderer {
	render(
		project: Project,
		songIndex: number,
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<Float32Array[]>;
	renderSharedTimelineSlots?(
		project: Project,
		slots: readonly SharedTimelineExportSlot[],
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<SharedTimelineExportResult[]>;
	createSharedTimelineExportLane?(
		project: Project,
		songIndex: number,
		session: SharedTimelineExportBuildSession
	): Promise<SharedTimelineExportLaneHandle>;
}
