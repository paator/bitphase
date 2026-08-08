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
import { isValidInstrumentSampleByteLength } from '../../utils/audio-sample-decode';
import { normalizeSamplePlaybackBounds } from './sample-region';
import type { AyTimerPwmSweepShape } from './instrument';

type WorkletInstrument = Instrument & {
	timerLoop?: number;
	timerRows?: Record<string, unknown>[];
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
	timerPwmPreserveOnNewNote?: boolean;
	timerPwmReverseSweep?: boolean;
	timerPwmSweepStartPhase?: number;
	timerPwmSweepShape?: AyTimerPwmSweepShape;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLength?: number;
	sampleLoopEnabled?: boolean;
	sampleLoop?: number;
};

export function sanitizeInstrumentForWorklet(instrument: Instrument): WorkletInstrument {
	const extended = instrument as WorkletInstrument;
	const sampleData =
		extended.sampleData?.length &&
		isValidInstrumentSampleByteLength(extended.sampleData.length)
			? extended.sampleData.map((value) => value & 0xff)
			: undefined;
	return {
		id: instrument.id,
		chipType: instrument.chipType,
		rows: Array.from(instrument.rows).map((row) => ({ ...row })),
		loop: instrument.loop,
		name: instrument.name,
		timerLoop: extended.timerLoop ?? instrument.loop,
		timerPwmDuty: extended.timerPwmDuty,
		timerPwmSweepMin: extended.timerPwmSweepMin,
		timerPwmSweep: extended.timerPwmSweep,
		timerPwmPreserveOnNewNote: extended.timerPwmPreserveOnNewNote,
		timerPwmSweepStartPhase: extended.timerPwmSweepStartPhase,
		timerPwmSweepShape: extended.timerPwmSweepShape,
		timerPwmReverseSweep: extended.timerPwmReverseSweep,
		timerRows: extended.timerRows?.map((row) => ({
			...row,
			timerWaveform: (row as { timerWaveform?: number[] }).timerWaveform
				? [...((row as { timerWaveform?: number[] }).timerWaveform as number[])]
				: undefined
		})),
		...(sampleData?.length
			? (() => {
					const bounds = normalizeSamplePlaybackBounds({
						sampleData,
						sampleStart: extended.sampleStart,
						sampleEnd: extended.sampleEnd,
						sampleLoopStart: extended.sampleLoopStart,
						sampleLength: extended.sampleLength,
						sampleLoop: extended.sampleLoop
					});
					return {
						sampleData,
						sampleRate: extended.sampleRate,
						sampleStart: bounds?.start ?? 0,
						sampleEnd: bounds?.end ?? sampleData.length - 1,
						sampleLoopStart: bounds?.loopStart ?? 0,
						sampleLoopEnabled: extended.sampleLoopEnabled !== false
					};
				})()
			: {})
	};
}

export class AYProcessor
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

	get audioNode(): AudioWorkletNode | null {
		return this.bridge.audioNode;
	}

	bindChipIndex(index: number): void {
		this.bridge.bindChipIndex(index);
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
			chipSettings.subscribe('chipVariant', (value) => {
				if (typeof value === 'string') {
					this.sendUpdateChipVariant(value);
				}
			})
		);

		this.settingsUnsubscribers.push(
			chipSettings.subscribe('stMixing', (value) => {
				if (typeof value === 'boolean') {
					this.sendUpdateStMixing(value);
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

	setWaveformCallback(callback: (channels: Float32Array[]) => void): void {
		this.bridge.setWaveformCallback(callback);
	}

	setChannelLevelsCallback(callback: (levels: number[]) => void): void {
		this.bridge.setChannelLevelsCallback(callback);
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

	setTimerPwmSweepPhaseCallback(
		callback: (payload: {
			timerPwmSweepPhase: (number | null)[];
			channelInstrumentIndex: number[];
		}) => void
	): void {
		this.bridge.setTimerPwmSweepPhaseCallback(callback);
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
		const sanitized: Table[] = tables.map((o) => ({
			id: o.id,
			rows: Array.from(o.rows),
			loop: o.loop,
			name: o.name,
			additive: o.additive
		}));
		this.bridge.sendCommand({ type: 'init_tables', tables: sanitized });
	}

	sendInitInstruments(instruments: Instrument[]): void {
		const sanitized = instruments.map(sanitizeInstrumentForWorklet);
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

	sendUpdateAyFrequency(aymFrequency: number): void {
		this.bridge.sendCommand({ type: 'update_ay_frequency', aymFrequency });
	}

	sendUpdateIntFrequency(intFrequency: number): void {
		this.bridge.sendCommand({ type: 'update_int_frequency', intFrequency });
	}

	sendUpdateChipVariant(chipVariant: string): void {
		this.bridge.sendCommand({ type: 'update_chip_variant', chipVariant });
	}

	sendUpdateStMixing(stMixing: boolean): void {
		this.bridge.sendCommand({ type: 'update_st_mixing', stMixing });
	}

	sendUpdateStereoLayout(stereoLayout: string): void {
		this.bridge.sendCommand({ type: 'update_stereo_layout', stereoLayout });
	}

	updateParameter(parameter: string, value: unknown): void {
		if (parameter.startsWith('channelMute_')) {
			const channelIndex = parseInt(parameter.replace('channelMute_', ''), 10);
			if (!isNaN(channelIndex) && typeof value === 'boolean') {
				this.bridge.sendCommand({ type: 'set_channel_mute', channelIndex, muted: value });
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
			case 'chipVariant':
				this.sendUpdateChipVariant(value as string);
				break;
			case 'stMixing':
				this.sendUpdateStMixing(value as boolean);
				break;
			case 'stereoLayout':
				this.sendUpdateStereoLayout(value as string);
				break;
			default:
				console.warn(`AY processor: unknown parameter "${parameter}"`);
		}
	}

	isAudioNodeAvailable(): boolean {
		return this.bridge.isAudioNodeAvailable();
	}

	playPreviewRow(
		pattern: Pattern,
		rowIndex: number,
		instrument?: Instrument,
		channelIndex?: number
	): void {
		if (rowIndex < 0 || rowIndex >= pattern.length) return;
		const patternCopy = structuredClone(pattern);
		const instrumentCopy = instrument ? sanitizeInstrumentForWorklet(instrument) : undefined;
		this.bridge.sendCommand({
			type: 'preview_row',
			pattern: patternCopy,
			rowIndex,
			instrument: instrumentCopy,
			channelIndex
		});
	}

	stopPreviewNote(channel?: number): void {
		this.bridge.sendCommand({ type: 'stop_preview', channel });
	}

	sendVirtualChannelConfig(
		virtualChannelMap: Record<number, number>,
		hwChannelCount: number
	): void {
		this.bridge.sendCommand({
			type: 'set_virtual_channel_config',
			virtualChannelMap,
			hwChannelCount
		});
	}
}
