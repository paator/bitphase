import SongTimeline from '../tracker/song-timeline.js';
import { createAudioSlot } from './audio-slot-registry.js';
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

	leaderPatternLength() {
		const rowCount = (slot) =>
			typeof slot.getLeaderPatternRowCount === 'function' ? slot.getLeaderPatternRowCount() : 0;
		const s0 = this.slots[0];
		let n = s0 ? rowCount(s0) : 0;
		if (n > 0) return n;
		for (let i = 0; i < this.slots.length; i++) {
			const s = this.slots[i];
			if (!s) continue;
			const len = rowCount(s);
			if (len > 0) return len;
		}
		return 1;
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

		for (let i = 0; i < numSamples; i++) {
			tl.tickAccumulator += tl.tickStep;
			const mix = { l: 0, r: 0 };

			const active = slots.filter((s) => s && s.canRender());
			const anyPreview = active.some((s) => s.isPreviewActive());
			const playSlots = active.filter((s) => s.shouldRunPlaybackAccumulation());

			if (anyPreview) {
				for (const s of active) {
					if (s.isPreviewActive()) {
						s.runPreviewStep();
						s.accumulateStereoOutput(i, mix);
					}
				}
			} else if (playSlots.length > 0 && tl.tickAccumulator >= 1.0) {
				for (const s of playSlots) {
					s.runSharedPlaybackQuantum();
				}
				const leaderLen = this.leaderPatternLength();
				const needsOrderWrap = tl.advancePosition(leaderLen);
				for (let j = 0; j < slots.length; j++) {
					const s = slots[j];
					if (s) s.onPatternOrderAdvanced(needsOrderWrap);
				}
				tl.tickAccumulator -= 1.0;
				for (const s of playSlots) {
					s.accumulateStereoOutput(i, mix);
				}
			} else {
				for (const s of playSlots) {
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
