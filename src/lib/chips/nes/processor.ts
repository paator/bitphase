import type { Chip } from '../types';
import type { Pattern, Instrument } from '../../models/song';
import type { Table } from '../../models/project';
import type {
	MixerWorkletSlotProcessor,
	SettingsSubscriber,
	TuningTableSupport,
	InstrumentSupport,
	PreviewNoteSupport
} from '../base/processor';
import type { ChipSettings } from '../../services/audio/chip-settings';
import type { CatchUpSegment } from '../../services/audio/play-from-position';
import { MixerWorkletBridge } from '../../services/audio/mixer-worklet-bridge';
import { ensureNesInstrumentRows } from './instrument';

function sanitizeInstrumentForWorklet(instrument: Instrument) {
	return {
		id: instrument.id,
		chipType: instrument.chipType,
		rows: ensureNesInstrumentRows(instrument.rows as Record<string, unknown>[]),
		loop: instrument.loop,
		name: instrument.name
	};
}

export class NESProcessor
	implements
		MixerWorkletSlotProcessor,
		SettingsSubscriber,
		TuningTableSupport,
		InstrumentSupport,
		PreviewNoteSupport
{
	chip: Chip;
	private readonly bridge: MixerWorkletBridge;
	private settingsUnsubscribers: (() => void)[] = [];

	constructor(chip: Chip) {
		this.chip = chip;
		this.bridge = new MixerWorkletBridge(chip);
	}

	bindChipIndex(index: number): void {
		this.bridge.bindChipIndex(index);
	}

	subscribeToSettings(chipSettings: ChipSettings): void {
		this.settingsUnsubscribers.push(
			chipSettings.subscribe('chipFrequency', (value) => {
				if (typeof value === 'number') {
					this.sendUpdateCpuFrequency(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('chipVariant', (value) => {
				if (typeof value === 'string') {
					this.sendUpdateChipVariant(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('tuningTable', (value) => {
				if (Array.isArray(value) && value.length > 0) {
					this.sendInitTuningTable(value as number[]);
				}
			})
		);
	}

	unsubscribeFromSettings(): void {
		for (const unsubscribe of this.settingsUnsubscribers) {
			unsubscribe();
		}
		this.settingsUnsubscribers = [];
	}

	initialize(wasmBuffer: ArrayBuffer, audioNode: AudioWorkletNode): void {
		if (!wasmBuffer || wasmBuffer.byteLength === 0) {
			throw new Error('WASM buffer not available or empty');
		}

		this.bridge.attachNode(audioNode);
		this.bridge.postInitCommand({ type: 'init', wasmBuffer });
		this.bridge.flushCommandQueue();
	}

	acceptWorkletPayload(data: unknown): void {
		this.bridge.acceptWorkletPayload(data);
	}

	setWaveformCallback(callback: (channels: Float32Array[]) => void): void {
		this.bridge.setWaveformCallback(callback);
	}

	setChannelToneHzCallback(
		callback: (payload: {
			frequencies: (number | null)[];
			sidTimerHz: (number | null)[];
			syncbuzzerTimerHz: (number | null)[];
			timerPwmSweepPhase: (number | null)[];
			channelInstrumentIndex: number[];
			registers: number[];
		}) => void
	): void {
		this.bridge.setChannelToneHzCallback(callback);
	}

	setCallbacks(
		onPositionUpdate: (currentRow: number, currentPatternOrderIndex?: number) => void,
		onPatternRequest: (patternOrderIndex: number) => void
	): void {
		this.bridge.setCallbacks(onPositionUpdate, onPatternRequest);
	}

	play(initialSpeed?: number): void {
		this.bridge.sendCommand({ type: 'play', initialSpeed });
	}

	playFromRow(row: number, patternOrderIndex?: number, speed?: number | null): void {
		this.bridge.sendCommand({ type: 'play_from_row', row, patternOrderIndex, speed });
	}

	playFromPosition(
		row: number,
		patternOrderIndex: number,
		speed: number | null,
		catchUpSegments: CatchUpSegment[],
		startPattern: Pattern
	): void {
		this.bridge.sendCommand({
			type: 'play_from_position',
			catchUpSegments,
			startPattern,
			startPatternOrderIndex: patternOrderIndex,
			startRow: row,
			speed
		});
	}

	stop(): void {
		this.bridge.sendCommand({ type: 'stop' });
	}

	updateOrder(order: number[], loopPointId: number): void {
		this.bridge.sendCommand({ type: 'update_order', order: Array.from(order), loopPointId });
	}

	sendInitPattern(pattern: Pattern, patternOrderIndex: number): void {
		this.bridge.sendCommand({ type: 'init_pattern', pattern, patternOrderIndex });
	}

	sendInitTuningTable(tuningTable: number[]): void {
		this.bridge.sendCommand({ type: 'init_tuning_table', tuningTable });
	}

	sendInitSpeed(speed: number): void {
		this.bridge.sendCommand({ type: 'init_speed', speed });
	}

	sendInitTables(tables: Table[]): void {
		const sanitized: Table[] = tables.map((table) => ({
			id: table.id,
			rows: Array.from(table.rows),
			loop: table.loop,
			name: table.name
		}));
		this.bridge.sendCommand({ type: 'init_tables', tables: sanitized });
	}

	sendInitInstruments(instruments: Instrument[]): void {
		const sanitized = instruments.map((instrument) =>
			sanitizeInstrumentForWorklet(instrument)
		);
		this.bridge.sendCommand({ type: 'init_instruments', instruments: sanitized });
	}

	sendRequestedPattern(pattern: Pattern, patternOrderIndex: number): void {
		this.bridge.sendCommand({ type: 'set_pattern_data', pattern, patternOrderIndex });
	}

	changePatternDuringPlayback(
		row: number,
		patternOrderIndex: number,
		pattern?: Pattern,
		speed?: number | null
	): void {
		this.bridge.sendCommand({
			type: 'change_pattern_during_playback',
			row,
			patternOrderIndex,
			pattern,
			speed
		});
	}

	playPreviewRow(pattern: Pattern, rowIndex: number, instrument?: Instrument): void {
		const sanitized = instrument ? sanitizeInstrumentForWorklet(instrument) : undefined;
		this.bridge.sendCommand({
			type: 'preview_row',
			pattern,
			rowIndex,
			instrument: sanitized
		});
	}

	stopPreviewNote(channel?: number): void {
		this.bridge.sendCommand({ type: 'stop_preview', channel });
	}

	sendUpdateCpuFrequency(cpuFrequency: number): void {
		this.bridge.sendCommand({ type: 'update_cpu_frequency', cpuFrequency });
	}

	sendUpdateChipVariant(chipVariant: string): void {
		this.bridge.sendCommand({ type: 'update_chip_variant', chipVariant });
	}

	updateParameter(parameter: string, value: unknown): void {
		if (parameter.startsWith('channelMute_')) {
			const channelIndex = parseInt(parameter.replace('channelMute_', ''), 10);
			if (!isNaN(channelIndex) && typeof value === 'boolean') {
				this.bridge.sendCommand({ type: 'set_channel_mute', channelIndex, muted: value });
			}
		}
	}

	isAudioNodeAvailable(): boolean {
		return this.bridge.isAudioNodeAvailable();
	}
}
