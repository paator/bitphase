import type { Chip } from '../types';
import type { Pattern, Instrument } from '../../models/song';
import type { Table } from '../../models/project';
import type { ChipSettings } from '../../services/audio/chip-settings';
import type { CatchUpSegment } from '../../services/audio/play-from-position';

export interface ChipProcessor {
	chip: Chip;
	initialize(wasmBuffer: ArrayBuffer, audioNode: AudioWorkletNode): void;
	play(initialSpeed?: number): void;
	playFromRow(row: number, patternOrderIndex?: number, speed?: number | null): void;
	playFromPosition?(
		row: number,
		patternOrderIndex: number,
		speed: number | null,
		catchUpSegments: CatchUpSegment[],
		startPattern: Pattern
	): void;
	stop(): void;
	updateOrder(order: number[], loopPointId: number): void;
	sendInitPattern(pattern: Pattern, patternOrderIndex: number): void;
	sendRequestedPattern(pattern: Pattern, patternOrderIndex: number): void;
	sendInitTables(tables: Table[]): void;
	setCallbacks(
		onPositionUpdate: (currentRow: number, currentPatternOrderIndex?: number) => void,
		onPatternRequest: (patternOrderIndex: number) => void,
		onSpeedUpdate?: (speed: number) => void
	): void;
	isAudioNodeAvailable(): boolean;
	sendInitSpeed(speed: number): void;
	updateParameter(parameter: string, value: unknown): void;
	changePatternDuringPlayback?(
		row: number,
		patternOrderIndex: number,
		pattern?: Pattern,
		speed?: number | null
	): void;
}

export interface SettingsSubscriber {
	subscribeToSettings(chipSettings: ChipSettings): void;
	unsubscribeFromSettings(): void;
}

export interface TuningTableSupport {
	sendInitTuningTable(tuningTable: number[]): void;
}

export interface InstrumentSupport {
	sendInitInstruments(instruments: Instrument[]): void;
}

export interface PreviewNoteSupport {
	playPreviewRow(pattern: Pattern, rowIndex: number, instrument?: Instrument): void;
	stopPreviewNote(channel?: number): void;
}

export interface VirtualChannelSupport {
	sendVirtualChannelConfig(
		virtualChannelMap: Record<number, number>,
		hwChannelCount: number
	): void;
}
