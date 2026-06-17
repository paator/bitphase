import { registerAudioSlotKind } from './audio-slot-registry.js';
import { AyumiSlot } from './ayumi-slot.js';
import { NesStubSlot } from './nes-stub-slot.js';

registerAudioSlotKind('ayumi', (port, chipIndex, sharedTimeline, initData) => {
	const slot = new AyumiSlot(port, chipIndex, sharedTimeline);
	void slot.handleMessage({ type: 'init', wasmBuffer: initData.wasmBuffer });
	return slot;
});

registerAudioSlotKind('nes', (port, chipIndex, sharedTimeline, initData) => {
	const slot = new NesStubSlot(port, chipIndex, sharedTimeline);
	void slot.handleMessage({ type: 'init', wasmBuffer: initData.wasmBuffer });
	return slot;
});
