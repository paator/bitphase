import SongTimeline from '../tracker/song-timeline.js';
import { createAudioSlot } from './audio-slot-registry.js';
import {
	capIdleTickAccumulator,
	leaderPatternLengthFromSlots,
	runSharedTimelineQuantum,
	sharedPlaybackShouldHoldClock,
	sortPlaySlotsForQuantum
} from '../tracker/shared-playback-orchestrator.js';
import './builtin-audio-slots.js';

class BitphaseAudioProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.slots = [];
		this.sharedTimeline = null;
		this.port.onmessage = (event) => this.onPortMessage(event);
	}

	onPortMessage(event) {
		const data = event.data ?? {};
		if (data.type === 'dispose_mixer') {
			this.slots = [];
			this.sharedTimeline = null;
			return;
		}
		const chipIndex = data.chipIndex;
		if (chipIndex === undefined) return;

		if (data.type === 'init') {
			const kind = data.slotKind;
			if (!kind || typeof kind !== 'string') {
				console.error('bitphase init missing slotKind');
				return;
			}
			if (!this.sharedTimeline) {
				this.sharedTimeline = new SongTimeline();
			}
			while (this.slots.length <= chipIndex) {
				this.slots.push(undefined);
			}
			const slot = createAudioSlot(kind, this.port, chipIndex, this.sharedTimeline, data);
			if (!slot) return;
			this.slots[chipIndex] = slot;
			return;
		}

		const slot = this.slots[chipIndex];
		if (!slot) return;
		const { chipIndex: _ci, slotKind: _sk, ...payload } = data;
		slot.handleMessage(payload);
	}

	process(_inputs, outputs, _parameters) {
		const output = outputs[0];
		if (!output || output.length < 2) {
			return true;
		}
		const leftChannel = output[0];
		const rightChannel = output[1];
		const numSamples = leftChannel.length;
		const tl = this.sharedTimeline;
		const slots = this.slots;

		if (!tl) {
			for (let i = 0; i < numSamples; i++) {
				leftChannel[i] = 0;
				rightChannel[i] = 0;
			}
			return true;
		}

		const active = slots.filter((s) => s && s.canRender());
		const anyPreview = active.some((s) => s.isPreviewActive());
		const catchingUpSlots = anyPreview ? [] : active.filter((s) => s.hasPendingCatchUp?.());
		if (catchingUpSlots.length > 0) {
			for (const s of catchingUpSlots) {
				s.advanceCatchUp(Number.MAX_SAFE_INTEGER);
			}
			for (let i = 0; i < numSamples; i++) {
				leftChannel[i] = 0;
				rightChannel[i] = 0;
			}
			for (let j = 0; j < slots.length; j++) {
				const s = slots[j];
				if (s) s.finishAudioBlock(numSamples);
			}
			return true;
		}

		const transportSlots = anyPreview ? [] : active.filter((s) => s.isPlayingTransport());
		const playSlots = transportSlots.filter((s) => s.shouldRunPlaybackAccumulation());
		const holdClock = sharedPlaybackShouldHoldClock(transportSlots.length, playSlots.length);
		const outputSlots = anyPreview
			? []
			: active.filter((s) => s.shouldAccumulateStereoOutput());
		const quantumSlots = sortPlaySlotsForQuantum(playSlots);
		const leaderLen = leaderPatternLengthFromSlots(slots.filter(Boolean));

		for (let i = 0; i < numSamples; i++) {
			tl.tickAccumulator += tl.tickStep;
			const mix = { l: 0, r: 0 };

			if (anyPreview) {
				for (const s of active) {
					if (s.isPreviewActive()) {
						s.runPreviewStep();
						s.accumulateStereoOutput(i, mix);
					}
				}
			} else if (!holdClock && playSlots.length > 0 && tl.tickAccumulator >= 1.0) {
				runSharedTimelineQuantum(quantumSlots, slots.filter(Boolean), tl, leaderLen);
				tl.tickAccumulator -= 1.0;
			} else if (holdClock || playSlots.length === 0) {
				tl.tickAccumulator = capIdleTickAccumulator(tl.tickAccumulator, false);
			}

			if (!anyPreview) {
				for (const s of outputSlots) {
					s.accumulateStereoOutput(i, mix);
				}
			}

			leftChannel[i] = mix.l;
			rightChannel[i] = mix.r;
		}

		for (let j = 0; j < slots.length; j++) {
			const s = slots[j];
			if (s) s.finishAudioBlock(numSamples);
		}
		return true;
	}
}

registerProcessor('bitphase-audio-processor', BitphaseAudioProcessor);
