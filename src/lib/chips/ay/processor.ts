import type { Chip } from '../types';
import type { Pattern, Instrument } from '../../models/song';
import type { Table } from '../../models/project';
import type {
	ChipProcessor,
	SettingsSubscriber,
	TuningTableSupport,
	InstrumentSupport,
	PreviewNoteSupport
} from '../base/processor';
import type { ChipSettings } from '../../services/audio/chip-settings';
import type { CatchUpSegment } from '../../services/audio/play-from-position';

type PositionUpdateMessage = {
	type: 'position_update';
	currentRow: number;
	currentPatternOrderIndex?: number;
};

type RequestPatternMessage = {
	type: 'request_pattern';
	patternOrderIndex: number;
};

type ChannelWaveformMessage = {
	type: 'channel_waveform';
	channels: Float32Array[];
};

type WorkletMessage =
	| PositionUpdateMessage
	| RequestPatternMessage
	| SpeedUpdateMessage
	| ChannelWaveformMessage;

interface SpeedUpdateMessage {
	type: 'speed_update';
	speed: number;
}

type PlayFromPositionCommand = {
	type: 'play_from_position';
	catchUpSegments: CatchUpSegment[];
	startPattern: Pattern;
	startPatternOrderIndex: number;
	startRow: number;
	speed: number | null;
};

type WorkletCommand =
	| { type: 'init'; wasmBuffer: ArrayBuffer }
	| { type: 'play'; initialSpeed?: number }
	| { type: 'play_from_row'; row: number; patternOrderIndex?: number; speed?: number | null }
	| PlayFromPositionCommand
	| { type: 'stop' }
	| { type: 'update_order'; order: number[]; loopPointId: number }
	| { type: 'init_pattern'; pattern: Pattern; patternOrderIndex: number }
	| { type: 'init_tuning_table'; tuningTable: number[] }
	| { type: 'init_speed'; speed: number }
	| { type: 'set_pattern_data'; pattern: Pattern; patternOrderIndex: number }
	| { type: 'init_tables'; tables: Table[] }
	| { type: 'init_instruments'; instruments: Instrument[] }
	| { type: 'update_ay_frequency'; aymFrequency: number }
	| { type: 'update_int_frequency'; intFrequency: number }
	| { type: 'update_timer_frequency'; timerFrequency: number }
	| { type: 'update_timer_scheme'; timerScheme: string }
	| { type: 'update_chip_variant'; chipVariant: string }
	| { type: 'update_stereo_layout'; stereoLayout: string }
	| { type: 'set_channel_mute'; channelIndex: number; muted: boolean }
	| {
			type: 'change_pattern_during_playback';
			row: number;
			patternOrderIndex?: number;
			pattern?: Pattern;
			speed?: number | null;
	  }
	| { type: 'preview_row'; pattern: Pattern; rowIndex: number; instrument?: Instrument }
	| { type: 'stop_preview'; channel?: number }
	| {
			type: 'set_virtual_channel_config';
			virtualChannelMap: Record<number, number>;
			hwChannelCount: number;
	  };

export class AYProcessor
	implements
		ChipProcessor,
		SettingsSubscriber,
		TuningTableSupport,
		InstrumentSupport,
		PreviewNoteSupport
{
	chip: Chip;
	audioNode: AudioWorkletNode | null = null;
	private onPositionUpdate?: (currentRow: number, currentPatternOrderIndex?: number) => void;
	private onPatternRequest?: (patternOrderIndex: number) => void;
	private onSpeedUpdate?: (speed: number) => void;
	private waveformCallback?: (channels: Float32Array[]) => void;
	private commandQueue: WorkletCommand[] = [];
	private settingsUnsubscribers: (() => void)[] = [];

	constructor(chip: Chip) {
		this.chip = chip;
	}

	subscribeToSettings(chipSettings: ChipSettings): void {
		this.settingsUnsubscribers.push(
			chipSettings.subscribe('chipFrequency', (value) => {
				if (typeof value === 'number') {
					this.sendUpdateAyFrequency(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('interruptFrequency', (value) => {
				if (typeof value === 'number') {
					this.sendUpdateIntFrequency(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('timerFrequency', (value) => {
				if (typeof value === 'number') {
					this.sendUpdateTimerFrequency(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('timerScheme', (value) => {
				if (typeof value === 'string') {
					this.sendUpdateTimerScheme(value);
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
			chipSettings.subscribe('stereoLayout', (value) => {
				if (typeof value === 'string') {
					this.sendUpdateStereoLayout(value);
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
		this.settingsUnsubscribers.forEach((unsubscribe) => unsubscribe());
		this.settingsUnsubscribers = [];
	}

	initialize(wasmBuffer: ArrayBuffer, audioNode: AudioWorkletNode): void {
		if (!wasmBuffer || wasmBuffer.byteLength === 0) {
			throw new Error('WASM buffer not available or empty');
		}

		this.audioNode = audioNode;
		this.audioNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
			this.handleWorkletMessage(event);
		};

		this.sendCommand({ type: 'init', wasmBuffer });
	}

	private sendCommand(command: WorkletCommand): void {
		if (!this.audioNode) {
			this.commandQueue.push(command);
			return;
		}

		while (this.commandQueue.length > 0) {
			const queuedCommand = this.commandQueue.shift();
			if (queuedCommand) {
				this.audioNode.port.postMessage(this.toSerializableCommand(queuedCommand));
			}
		}

		this.audioNode.port.postMessage(this.toSerializableCommand(command));
	}

	private toSerializableCommand(command: WorkletCommand): unknown {
		if (command.type === 'init') {
			return command;
		}
		return JSON.parse(JSON.stringify(command));
	}

	setCallbacks(
		onPositionUpdate: (currentRow: number, currentPatternOrderIndex?: number) => void,
		onPatternRequest: (patternOrderIndex: number) => void,
		onSpeedUpdate?: (speed: number) => void
	): void {
		this.onPositionUpdate = onPositionUpdate;
		this.onPatternRequest = onPatternRequest;
		this.onSpeedUpdate = onSpeedUpdate;
	}

	setWaveformCallback(callback: (channels: Float32Array[]) => void): void {
		this.waveformCallback = callback;
	}

	play(initialSpeed?: number): void {
		this.sendCommand({ type: 'play', initialSpeed });
	}

	playFromRow(row: number, patternOrderIndex?: number, speed?: number | null): void {
		this.sendCommand({ type: 'play_from_row', row, patternOrderIndex, speed });
	}

	playFromPosition(
		row: number,
		patternOrderIndex: number,
		speed: number | null,
		catchUpSegments: CatchUpSegment[],
		startPattern: Pattern
	): void {
		this.sendCommand({
			type: 'play_from_position',
			catchUpSegments,
			startPattern,
			startPatternOrderIndex: patternOrderIndex,
			startRow: row,
			speed
		});
	}

	stop(): void {
		this.sendCommand({ type: 'stop' });
	}

	updateOrder(order: number[], loopPointId: number): void {
		this.sendCommand({ type: 'update_order', order: Array.from(order), loopPointId });
	}

	sendInitPattern(pattern: Pattern, patternOrderIndex: number): void {
		this.sendCommand({ type: 'init_pattern', pattern, patternOrderIndex });
	}

	sendInitTuningTable(tuningTable: number[]): void {
		this.sendCommand({ type: 'init_tuning_table', tuningTable });
	}

	sendInitSpeed(speed: number): void {
		this.sendCommand({ type: 'init_speed', speed });
	}

	sendInitTables(tables: Table[]): void {
		const sanitized: Table[] = tables.map((o) => ({
			id: o.id,
			rows: Array.from(o.rows),
			loop: o.loop,
			name: o.name
		}));
		this.sendCommand({ type: 'init_tables', tables: sanitized });
	}

	sendInitInstruments(instruments: Instrument[]): void {
		const sanitized: Instrument[] = instruments.map((o) => ({
			id: o.id,
			rows: Array.from(o.rows).map((row) => ({ ...row })),
			loop: o.loop,
			name: o.name
		}));
		this.sendCommand({ type: 'init_instruments', instruments: sanitized });
	}

	sendRequestedPattern(pattern: Pattern, patternOrderIndex: number): void {
		this.sendCommand({ type: 'set_pattern_data', pattern, patternOrderIndex });
	}

	changePatternDuringPlayback(
		row: number,
		patternOrderIndex: number,
		pattern?: Pattern,
		speed?: number | null
	): void {
		this.sendCommand({
			type: 'change_pattern_during_playback',
			row,
			patternOrderIndex,
			pattern,
			speed
		});
	}

	sendUpdateAyFrequency(aymFrequency: number): void {
		this.sendCommand({ type: 'update_ay_frequency', aymFrequency });
	}

	sendUpdateIntFrequency(intFrequency: number): void {
		this.sendCommand({ type: 'update_int_frequency', intFrequency });
	}

	sendUpdateTimerFrequency(timerFrequency: number): void {
		this.sendCommand({ type: 'update_timer_frequency', timerFrequency });
	}

	sendUpdateTimerScheme(timerScheme: string): void {
		this.sendCommand({ type: 'update_timer_scheme', timerScheme });
	}

	sendUpdateChipVariant(chipVariant: string): void {
		this.sendCommand({ type: 'update_chip_variant', chipVariant });
	}

	sendUpdateStereoLayout(stereoLayout: string): void {
		this.sendCommand({ type: 'update_stereo_layout', stereoLayout });
	}

	updateParameter(parameter: string, value: unknown): void {
		if (parameter.startsWith('channelMute_')) {
			const channelIndex = parseInt(parameter.replace('channelMute_', ''), 10);
			if (!isNaN(channelIndex) && typeof value === 'boolean') {
				this.sendCommand({ type: 'set_channel_mute', channelIndex, muted: value });
			}
			return;
		}

		switch (parameter) {
			case 'chipFrequency':
				this.sendUpdateAyFrequency(value as number);
				break;
			case 'interruptFrequency':
				this.sendUpdateIntFrequency(value as number);
				break;
			case 'timerFrequency':
				this.sendUpdateTimerFrequency(value as number);
				break;
			case 'timerScheme':
				this.sendUpdateTimerScheme(value as string);
				break;
			case 'chipVariant':
				this.sendUpdateChipVariant(value as string);
				break;
			case 'stereoLayout':
				this.sendUpdateStereoLayout(value as string);
				break;
			default:
				console.warn(`AY processor: unknown parameter "${parameter}"`);
		}
	}

	private handleWorkletMessage(event: MessageEvent<WorkletMessage>): void {
		const message = event.data;

		switch (message.type) {
			case 'position_update':
				this.onPositionUpdate?.(message.currentRow, message.currentPatternOrderIndex);
				break;
			case 'request_pattern':
				this.onPatternRequest?.(message.patternOrderIndex);
				break;
			case 'speed_update':
				this.onSpeedUpdate?.(message.speed);
				break;
			case 'channel_waveform':
				this.waveformCallback?.(message.channels);
				break;
			default:
				console.warn('Unhandled message:', message);
		}
	}

	isAudioNodeAvailable(): boolean {
		return this.audioNode !== null;
	}

	playPreviewRow(pattern: Pattern, rowIndex: number, instrument?: Instrument): void {
		if (rowIndex < 0 || rowIndex >= pattern.length) return;
		const patternCopy = structuredClone(pattern);
		const instrumentCopy = instrument
			? {
					id: instrument.id,
					rows: Array.from(instrument.rows).map((row) => ({ ...row })),
					loop: instrument.loop,
					name: instrument.name
				}
			: undefined;
		this.sendCommand({
			type: 'preview_row',
			pattern: patternCopy,
			rowIndex,
			instrument: instrumentCopy
		});
	}

	stopPreviewNote(channel?: number): void {
		this.sendCommand({ type: 'stop_preview', channel });
	}

	sendVirtualChannelConfig(
		virtualChannelMap: Record<number, number>,
		hwChannelCount: number
	): void {
		this.sendCommand({
			type: 'set_virtual_channel_config',
			virtualChannelMap,
			hwChannelCount
		});
	}
}
