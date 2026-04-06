import type { ChipProcessor, SettingsSubscriber } from '../../chips/base/processor';
import type { Chip } from '../../chips/types';
import type { Table } from '../../models/project';
import { ChipSettings } from './chip-settings';
import type { CatchUpSegment } from './play-from-position';
import { channelMuteStore } from '../../stores/channel-mute.svelte';
import { waveformStore } from '../../stores/waveform.svelte';

import type { Pattern } from '../../models/song';

export interface PlayFromRowOptions {
	catchUpSegments?: CatchUpSegment[];
	startPattern?: Pattern;
	getCatchUpSegmentsForChip?: (chipIndex: number) => CatchUpSegment[];
	getStartPatternForChip?: (chipIndex: number) => Pattern;
}

export class AudioService {
	private _audioContext: AudioContext | null = new AudioContext();
	private _isPlaying = false;
	private _previewChipIndices = new Set<number>();
	public chipSettings: ChipSettings = new ChipSettings();
	private _masterGainNode: GainNode | null = null;
	private _playPatternRestoreOrder: number[] | null = null;
	private _playPatternRestoreLoopPointId = 0;
	private _playPatternId: number | null = null;

	//for example 1x FM chip processor, 2x AY chip processors for TSFM track
	//they will all be mixed together in single audio context
	chipProcessors: ChipProcessor[] = [];

	constructor() {
		// Web browsers like to disable audio contexts when they first exist to prevent auto-play video/audio ads.
		// We explicitly re-enable it whenever the user does something on the page.
		if (this._audioContext) {
			this._masterGainNode = this._audioContext.createGain();
			this._masterGainNode.connect(this._audioContext.destination);
			this._masterGainNode.gain.value = 1.0;

			document.addEventListener('keydown', () => this._audioContext?.resume(), {
				once: true
			});
			document.addEventListener('mousedown', () => this._audioContext?.resume(), {
				once: true
			});
			document.addEventListener('touchstart', () => this._audioContext?.resume(), {
				once: true
			});
			document.addEventListener('touchend', () => this._audioContext?.resume(), {
				once: true
			});
		}
	}

	async addChipProcessor(chip: Chip) {
		if (!this._audioContext) {
			throw new Error('Audio context not initialized');
		}

		const processor = this.createChipProcessor(chip);
		const chipIndex = this.chipProcessors.length;
		this.chipProcessors.push(processor);

		if (this.hasSettingsSubscription(processor)) {
			processor.subscribeToSettings(this.chipSettings);
		}

		const response = await fetch(import.meta.env.BASE_URL + chip.wasmUrl);
		const wasmBuffer = await response.arrayBuffer();

		await this._audioContext.audioWorklet.addModule(
			import.meta.env.BASE_URL + chip.processorName + '.js'
		);

		const audioNode = this.createAudioNode();

		processor.initialize(wasmBuffer, audioNode);

		const processorWithWaveform = processor as {
			setWaveformCallback?: (cb: (channels: Float32Array[]) => void) => void;
		};
		processorWithWaveform.setWaveformCallback?.((channels: Float32Array[]) => {
			const showWaveform = this._isPlaying || this._previewChipIndices.has(chipIndex);
			if (showWaveform) waveformStore.setChannels(chipIndex, channels);
		});
	}

	setPreviewActiveForChips(indices: number | number[] | null): void {
		if (indices === null) {
			this._previewChipIndices.clear();
			if (!this._isPlaying) waveformStore.clear();
			return;
		}
		const arr = Array.isArray(indices) ? indices : [indices];
		this._previewChipIndices = new Set(arr);
	}

	play(initialSpeeds?: number[]) {
		if (this._isPlaying) return;

		this._isPlaying = true;
		this._previewChipIndices.clear();

		this.applyMuteStateToAllChips();

		this.chipProcessors.forEach((chipProcessor, index) => {
			const initialSpeed = initialSpeeds?.[index];
			chipProcessor.play(initialSpeed);
		});
	}

	playFromRow(
		row: number,
		patternOrderIndex?: number,
		getSpeedForChip?: (chipIndex: number) => number | null,
		options?: PlayFromRowOptions
	) {
		if (this._isPlaying) return;

		this._isPlaying = true;
		this._previewChipIndices.clear();

		this.applyMuteStateToAllChips();

		const catchUpSegments = options?.catchUpSegments;
		const startPattern = options?.startPattern;
		const getCatchUpSegmentsForChip = options?.getCatchUpSegmentsForChip;
		const getStartPatternForChip = options?.getStartPatternForChip;
		const orderIndex = patternOrderIndex ?? 0;

		this.chipProcessors.forEach((chipProcessor, index) => {
			const speed = getSpeedForChip ? (getSpeedForChip(index) ?? null) : null;
			const chipCatchUp = getCatchUpSegmentsForChip?.(index) ?? catchUpSegments;
			const chipStartPattern = getStartPatternForChip?.(index) ?? startPattern;
			if (chipCatchUp && chipStartPattern && chipProcessor.playFromPosition) {
				chipProcessor.playFromPosition(
					row,
					orderIndex,
					speed,
					chipCatchUp,
					chipStartPattern
				);
			} else {
				chipProcessor.playFromRow(row, patternOrderIndex, speed ?? undefined);
			}
		});
	}

	stop() {
		if (!this._isPlaying) return;

		this._isPlaying = false;
		this._previewChipIndices.clear();

		waveformStore.clear();

		this.chipProcessors.forEach((chipProcessor) => {
			chipProcessor.stop();
		});

		if (this._playPatternRestoreOrder) {
			this.updateOrder(this._playPatternRestoreOrder, this._playPatternRestoreLoopPointId);
			this._playPatternRestoreOrder = null;
			this._playPatternRestoreLoopPointId = 0;
			this._playPatternId = null;
		}
	}

	updateOrder(order: number[], loopPointId: number) {
		this.chipProcessors.forEach((chipProcessor) => {
			chipProcessor.updateOrder(order, loopPointId);
		});
	}

	setPlayPatternRestoreOrder(order: number[], patternId: number, loopPointId: number) {
		this._playPatternRestoreOrder = order;
		this._playPatternRestoreLoopPointId = loopPointId;
		this._playPatternId = patternId;
	}

	getPlayPatternId(): number | null {
		return this._playPatternId;
	}

	updateTables(tables: Table[]) {
		this.chipProcessors.forEach((chipProcessor) => {
			chipProcessor.sendInitTables(tables);
		});
	}

	updateInstruments(instruments: import('../../models/song').Instrument[]) {
		this.chipProcessors.forEach((chipProcessor) => {
			if ('sendInitInstruments' in chipProcessor) {
				(chipProcessor as any).sendInitInstruments(instruments);
			}
		});
	}

	updateSpeed(speed: number) {
		this.chipProcessors.forEach((chipProcessor) => {
			chipProcessor.sendInitSpeed(speed);
		});
	}

	removeChipProcessor(index: number): void {
		if (index < 0 || index >= this.chipProcessors.length) return;
		if (this._isPlaying) {
			this.stop();
		}
		this.chipProcessors = this.chipProcessors.filter((_, i) => i !== index);
	}

	clearChipProcessors() {
		if (this._isPlaying) {
			this.stop();
		}
		this.chipProcessors = [];
	}

	async dispose() {
		if (this._isPlaying) {
			this.stop();
		}

		if (this._audioContext) {
			await this._audioContext.close();
			this._audioContext = null;
		}

		this.chipProcessors = [];
	}

	get playing() {
		return this._isPlaying;
	}

	private createAudioNode() {
		if (!this._audioContext || !this._masterGainNode) {
			throw new Error('Audio context not initialized');
		}

		const audioNode = new AudioWorkletNode(
			this._audioContext,
			this.chipProcessors[0].chip.processorName,
			{
				outputChannelCount: [2]
			}
		);

		audioNode.connect(this._masterGainNode);

		return audioNode;
	}

	setVolume(volume: number) {
		if (this._masterGainNode) {
			this._masterGainNode.gain.value = Math.max(0, Math.min(1, volume / 100));
		}
	}

	private createChipProcessor(chip: Chip): ChipProcessor {
		const createProcessor = chip.processorMap;
		if (!createProcessor) {
			throw new Error(`Unsupported chip: ${chip}`);
		}

		return createProcessor(chip);
	}

	private hasSettingsSubscription(
		processor: ChipProcessor
	): processor is ChipProcessor & SettingsSubscriber {
		return (
			'subscribeToSettings' in processor &&
			'unsubscribeFromSettings' in processor &&
			typeof (processor as unknown as SettingsSubscriber).subscribeToSettings ===
				'function' &&
			typeof (processor as unknown as SettingsSubscriber).unsubscribeFromSettings ===
				'function'
		);
	}

	private applyMuteStateToAllChips(): void {
		const allMuteStates = channelMuteStore.getAllMuteStates();

		this.chipProcessors.forEach((chipProcessor, chipIndex) => {
			const chipMutes = allMuteStates.get(chipIndex);
			if (chipMutes) {
				chipMutes.forEach((isMuted, channelIndex) => {
					chipProcessor.updateParameter(`channelMute_${channelIndex}`, isMuted);
				});
			}
		});
	}
}
