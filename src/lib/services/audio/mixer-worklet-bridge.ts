import type { Pattern, Instrument } from '../../models/song';
import type { Table } from '../../models/project';
import type { Chip } from '../../chips/types';
import type { PlaybackCarryState } from './play-from-position';

export type MixerWorkletIncomingMessage =
	| {
			type: 'position_update';
			chipIndex?: number;
			currentRow: number;
			currentPatternOrderIndex?: number;
	  }
	| {
			type: 'request_pattern';
			chipIndex?: number;
			patternOrderIndex: number;
	  }
	| {
			type: 'channel_waveform';
			chipIndex?: number;
			channels: Float32Array[];
	  }
	| {
			type: 'channel_levels';
			chipIndex?: number;
			levels: number[];
	  }
	| {
			type: 'channel_tone_hz';
			chipIndex?: number;
			frequencies: (number | null)[];
			sidTimerHz: (number | null)[];
			syncbuzzerTimerHz: (number | null)[];
			timerPwmSweepPhase?: (number | null)[];
			channelInstrumentIndex?: number[];
			registers: number[];
	  }
	| {
			type: 'timer_pwm_sweep_phase';
			chipIndex?: number;
			timerPwmSweepPhase: (number | null)[];
			channelInstrumentIndex: number[];
	  };

export type MixerSlotCommand =
	| { type: 'init'; wasmBuffer: ArrayBuffer }
	| { type: 'play'; initialSpeed?: number }
	| {
			type: 'play_from_row';
			row: number;
			patternOrderIndex?: number;
			speed?: number | null;
			carry?: PlaybackCarryState | null;
	  }
	| { type: 'stop' }
	| { type: 'update_order'; order: number[]; loopPointId: number }
	| { type: 'init_pattern'; pattern: Pattern; patternOrderIndex: number }
	| { type: 'init_tuning_table'; tuningTable: number[] }
	| { type: 'init_speed'; speed: number }
	| { type: 'set_pattern_data'; pattern: Pattern; patternOrderIndex: number }
	| { type: 'init_tables'; tables: Table[] }
	| { type: 'init_instruments'; instruments: Instrument[] }
	| { type: 'update_ay_frequency'; aymFrequency: number }
	| { type: 'update_cpu_frequency'; cpuFrequency: number }
	| { type: 'update_int_frequency'; intFrequency: number }
	| { type: 'update_chip_variant'; chipVariant: string }
	| { type: 'update_st_mixing'; stMixing: boolean }
	| { type: 'update_stereo_layout'; stereoLayout: string }
	| { type: 'set_channel_mute'; channelIndex: number; muted: boolean }
	| {
			type: 'change_pattern_during_playback';
			row: number;
			patternOrderIndex?: number;
			pattern?: Pattern;
			speed?: number | null;
	  }
	| {
			type: 'preview_row';
			pattern: Pattern;
			rowIndex: number;
			instrument?: Instrument;
			channelIndex?: number;
	  }
	| { type: 'stop_preview'; channel?: number }
	| {
			type: 'set_virtual_channel_config';
			virtualChannelMap: Record<number, number>;
			hwChannelCount: number;
	  };

export class MixerWorkletBridge {
	audioNode: AudioWorkletNode | null = null;
	private _chipIndex = 0;
	private onPositionUpdate?: (currentRow: number, currentPatternOrderIndex?: number) => void;
	private onPatternRequest?: (patternOrderIndex: number) => void;
	private waveformCallback?: (channels: Float32Array[]) => void;
	private channelLevelsCallback?: (levels: number[]) => void;
	private channelToneHzCallback?: (payload: {
		frequencies: (number | null)[];
		sidTimerHz: (number | null)[];
		syncbuzzerTimerHz: (number | null)[];
		timerPwmSweepPhase: (number | null)[];
		channelInstrumentIndex: number[];
		registers: number[];
	}) => void;
	private timerPwmSweepPhaseCallback?: (payload: {
		timerPwmSweepPhase: (number | null)[];
		channelInstrumentIndex: number[];
	}) => void;
	private readonly commandQueue: MixerSlotCommand[] = [];

	constructor(private readonly slotKindSource: Pick<Chip, 'audioSlotKind'>) {}

	bindChipIndex(index: number): void {
		this._chipIndex = index;
	}

	setCallbacks(
		onPositionUpdate: (currentRow: number, currentPatternOrderIndex?: number) => void,
		onPatternRequest: (patternOrderIndex: number) => void
	): void {
		this.onPositionUpdate = onPositionUpdate;
		this.onPatternRequest = onPatternRequest;
	}

	setWaveformCallback(callback: (channels: Float32Array[]) => void): void {
		this.waveformCallback = callback;
	}

	setChannelLevelsCallback(callback: (levels: number[]) => void): void {
		this.channelLevelsCallback = callback;
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
		this.channelToneHzCallback = callback;
	}

	setTimerPwmSweepPhaseCallback(
		callback: (payload: {
			timerPwmSweepPhase: (number | null)[];
			channelInstrumentIndex: number[];
		}) => void
	): void {
		this.timerPwmSweepPhaseCallback = callback;
	}

	acceptWorkletPayload(data: unknown): void {
		if (typeof data !== 'object' || data === null || !('type' in data)) {
			return;
		}
		const msgType = (data as { type: unknown }).type;
		if (
			msgType !== 'position_update' &&
			msgType !== 'request_pattern' &&
			msgType !== 'channel_waveform' &&
			msgType !== 'channel_levels' &&
			msgType !== 'channel_tone_hz' &&
			msgType !== 'timer_pwm_sweep_phase'
		) {
			return;
		}
		const message = data as MixerWorkletIncomingMessage;
		switch (message.type) {
			case 'position_update':
				this.onPositionUpdate?.(message.currentRow, message.currentPatternOrderIndex);
				break;
			case 'request_pattern':
				this.onPatternRequest?.(message.patternOrderIndex);
				break;
			case 'channel_waveform':
				this.waveformCallback?.(message.channels);
				break;
			case 'channel_levels':
				this.channelLevelsCallback?.(message.levels);
				break;
			case 'channel_tone_hz':
				this.channelToneHzCallback?.({
					frequencies: message.frequencies,
					registers: message.registers ?? [],
					sidTimerHz: message.sidTimerHz ?? [],
					syncbuzzerTimerHz: message.syncbuzzerTimerHz ?? [],
					timerPwmSweepPhase: message.timerPwmSweepPhase ?? [],
					channelInstrumentIndex: message.channelInstrumentIndex ?? []
				});
				break;
			case 'timer_pwm_sweep_phase':
				this.timerPwmSweepPhaseCallback?.({
					timerPwmSweepPhase: message.timerPwmSweepPhase,
					channelInstrumentIndex: message.channelInstrumentIndex
				});
				break;
		}
	}

	wrapOutgoing(command: MixerSlotCommand): unknown {
		if (command.type === 'init') {
			return {
				chipIndex: this._chipIndex,
				slotKind: this.slotKindSource.audioSlotKind,
				type: 'init',
				wasmBuffer: command.wasmBuffer
			};
		}
		const serial = JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
		return { chipIndex: this._chipIndex, ...serial };
	}

	sendCommand(command: MixerSlotCommand): void {
		if (!this.audioNode) {
			this.commandQueue.push(command);
			return;
		}
		this.audioNode.port.postMessage(this.wrapOutgoing(command));
	}

	attachNode(audioNode: AudioWorkletNode): void {
		this.audioNode = audioNode;
	}

	postInitCommand(init: Extract<MixerSlotCommand, { type: 'init' }>): void {
		if (!this.audioNode) {
			return;
		}
		this.audioNode.port.postMessage(this.wrapOutgoing(init));
	}

	flushCommandQueue(): void {
		if (!this.audioNode) {
			return;
		}
		while (this.commandQueue.length > 0) {
			const queued = this.commandQueue.shift();
			if (queued) {
				this.audioNode.port.postMessage(this.wrapOutgoing(queued));
			}
		}
	}

	isAudioNodeAvailable(): boolean {
		return this.audioNode !== null;
	}
}
