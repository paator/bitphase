import type { Chip } from '../types';
import type { Pattern, Instrument } from '../../models/song';
import type { Table } from '../../models/project';
import type {
	MixerWorkletSlotProcessor,
	TuningTableSupport,
	InstrumentSupport
} from '../base/processor';
import type { CatchUpSegment } from '../../services/audio/play-from-position';
import { MixerWorkletBridge } from '../../services/audio/mixer-worklet-bridge';

export class NESProcessor
	implements MixerWorkletSlotProcessor, TuningTableSupport, InstrumentSupport
{
	chip: Chip;
	private readonly bridge: MixerWorkletBridge;

	constructor(chip: Chip) {
		this.chip = chip;
		this.bridge = new MixerWorkletBridge(chip);
	}

	bindChipIndex(index: number): void {
		this.bridge.bindChipIndex(index);
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
		const sanitized = instruments.map((instrument) => ({
			id: instrument.id,
			chipType: instrument.chipType,
			rows: Array.from(instrument.rows).map((row) => ({ ...row })),
			loop: instrument.loop,
			name: instrument.name
		}));
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
