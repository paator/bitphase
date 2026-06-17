import { registerAudioSlotKind } from './audio-slot-registry.js';
import { AyumiSlot } from '../ay/ayumi-slot.js';
import { NesWorkletSlot } from '../nes/nes-worklet-slot.js';

registerAudioSlotKind('ayumi', (port, chipIndex, sharedTimeline, initData) => {
	const slot = new AyumiSlot(port, chipIndex, sharedTimeline);
	void slot.handleMessage({ type: 'init', wasmBuffer: initData.wasmBuffer });
	return slot;
});

registerAudioSlotKind('nes', (port, chipIndex, sharedTimeline, initData) => {
	const slot = new NesWorkletSlot(port, chipIndex, sharedTimeline);
	void slot.handleMessage({ type: 'init', wasmBuffer: initData.wasmBuffer });
	return slot;
});
