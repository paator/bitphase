import { describe, expect, it, vi } from 'vitest';
import { NesWorkletSlot } from '../../public/nes/nes-worklet-slot.js';

function createPreviewSlot() {
	const slot = new NesWorkletSlot({ postMessage() {} }, 0);
	slot.initialized = true;
	slot.state.wasmModule = {};
	slot.state.apuPtr = 1;
	slot.state.timeline.samplesPerTick = 8;
	slot.audioDriver = {
		processInstruments() {},
		advancePulseWidthTable() {},
		advanceSweepTable() {},
		syncSweepTableRegisterState() {},
		_silenceChannel() {},
		resizeChannels() {}
	};
	slot.patternProcessor = {
		parsePatternRow() {},
		processTables() {}
	};
	slot.apuEngine = {
		reset: vi.fn(),
		applyRegisterState: vi.fn()
	};
	return slot;
}

const previewPattern = {
	length: 1,
	patternRows: [{}],
	channels: [{ rows: [{}] }]
};

describe('NesWorkletSlot preview', () => {
	it('does not reset the APU when starting a preview row', () => {
		const slot = createPreviewSlot();

		slot.handlePreviewRow({
			pattern: previewPattern,
			rowIndex: 0,
			channelIndex: 0
		});

		expect(slot.apuEngine.reset).not.toHaveBeenCalled();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalled();
	});

	it('does not reset the APU when stopping preview', () => {
		const slot = createPreviewSlot();
		slot.handlePreviewRow({
			pattern: previewPattern,
			rowIndex: 0,
			channelIndex: 0
		});
		slot.apuEngine.reset.mockClear();
		slot.apuEngine.applyRegisterState.mockClear();

		slot.handleStopPreview();

		expect(slot.apuEngine.reset).not.toHaveBeenCalled();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalled();
	});

	it('silences playback on stop without resetting the APU', () => {
		const slot = createPreviewSlot();
		slot.paused = false;

		slot.handleStop();

		expect(slot.paused).toBe(true);
		expect(slot.apuEngine.reset).not.toHaveBeenCalled();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalled();
	});

	it('silences playback on play without resetting the APU', () => {
		const slot = createPreviewSlot();
		slot.paused = true;
		slot.state.currentPattern = previewPattern;

		slot.startPlaybackCommon();

		expect(slot.paused).toBe(false);
		expect(slot.apuEngine.reset).not.toHaveBeenCalled();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalled();
	});

	it('does not reset the APU when virtual channel config is reapplied', () => {
		const slot = createPreviewSlot();
		slot.apuEngine.reset.mockClear();
		slot.apuEngine.applyRegisterState.mockClear();

		slot.handleSetVirtualChannelConfig({
			virtualChannelMap: {},
			hwChannelCount: 5
		});

		expect(slot.apuEngine.reset).not.toHaveBeenCalled();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalled();
	});

	it('stays in the audio mix while paused so preview start and stop are not hard cuts', () => {
		const slot = createPreviewSlot();
		slot.paused = true;

		expect(slot.isPreviewActive()).toBe(false);
		expect(slot.shouldAccumulateStereoOutput()).toBe(true);
	});

	it('does not rewrite registers on every preview sample', () => {
		const slot = createPreviewSlot();
		slot.handlePreviewRow({
			pattern: previewPattern,
			rowIndex: 0,
			channelIndex: 0
		});
		slot.apuEngine.applyRegisterState.mockClear();
		slot.previewTickSampleCounter = 0;

		for (let i = 0; i < 7; i++) {
			slot.runPreviewStep();
		}

		expect(slot.apuEngine.applyRegisterState).not.toHaveBeenCalled();

		slot.runPreviewStep();
		expect(slot.apuEngine.applyRegisterState).toHaveBeenCalledTimes(1);
	});

	it('clears waveform capture when preparing playback', () => {
		const slot = createPreviewSlot();
		slot.channelWaveformBuf[0][0] = 0.5;
		slot.channelWaveformBuf[1][0] = 0.5;
		slot.resetChannelWaveformCapture = vi.fn(slot.resetChannelWaveformCapture.bind(slot));

		slot._prepareOutputForPlay();

		expect(slot.resetChannelWaveformCapture).toHaveBeenCalled();
		expect(slot.channelWaveformBuf[0][0]).toBe(0);
		expect(slot.channelWaveformBuf[1][0]).toBe(0);
	});

	it('treats a muted hardware channel as muted for the oscilloscope', () => {
		const slot = createPreviewSlot();
		slot.state.channelMuted[0] = true;
		slot.state.channelMuted[1] = false;

		expect(slot._isHardwareChannelMuted(0)).toBe(true);
		expect(slot._isHardwareChannelMuted(1)).toBe(false);
	});

	it('writes zeros into the scope buffer for muted hardware channels', () => {
		const slot = createPreviewSlot();
		slot.paused = false;
		slot.state.channelMuted[0] = true;
		slot.state.channelSoundEnabled[1] = true;
		slot.registerState.channels[1].enabled = true;
		slot.registerState.channels[1].period = 428;
		slot.registerState.channels[1].volume = 15;
		slot.apuEngine.process = () => ({ left: 0, right: 0 });
		slot.apuEngine.canReadChannelOutputs = () => true;
		slot.apuEngine.getChannelRawOut = () => 0;
		slot.waveformCapture.readChannelOutputs = () => [0.8, 0.5, 0.2, 0.1, 0.3];
		globalThis.sampleRate = 48000;

		slot.accumulateStereoOutput(0, { l: 0, r: 0 });

		expect(slot.channelWaveformBuf[0][0]).toBe(0);
		expect(slot.channelWaveformBuf[1][0]).toBe(0.5);
	});

	it('does not draw emulator residual when a channel is unmuted but not sounding', () => {
		const slot = createPreviewSlot();
		slot.paused = false;
		slot.state.channelMuted[0] = false;
		slot.state.channelSoundEnabled[0] = true;
		slot.registerState.channels[0].enabled = false;
		slot.apuEngine.process = () => ({ left: 0, right: 0 });
		slot.waveformCapture.readChannelOutputs = () => [0.8, 0.5, 0.2, 0.1, 0.3];
		globalThis.sampleRate = 48000;

		slot.accumulateStereoOutput(0, { l: 0, r: 0 });

		expect(slot.channelWaveformBuf[0][0]).toBe(0);
	});

	it('keeps DPCM scope flat while the channel is not implemented', () => {
		const slot = createPreviewSlot();
		slot.paused = false;
		slot.state.channelMuted[4] = false;
		slot.state.channelSoundEnabled[4] = true;
		slot.registerState.channels[4].enabled = true;
		slot.registerState.channels[4].volume = 64;
		slot.apuEngine.process = () => ({ left: 0, right: 0 });
		slot.waveformCapture.readChannelOutputs = () => [0.8, 0.5, 0.2, 0.1, 0.3];
		globalThis.sampleRate = 48000;

		slot.accumulateStereoOutput(0, { l: 0, r: 0 });

		expect(slot.channelWaveformBuf[4][0]).toBe(0);
	});

	it('still mixes audio while paused without writing scope samples', () => {
		const slot = createPreviewSlot();
		slot.paused = true;
		slot.state.channelSoundEnabled[0] = true;
		slot.registerState.channels[0].enabled = true;
		slot.apuEngine.process = () => ({ left: 0.25, right: 0.25 });
		slot.waveformCapture.readChannelOutputs = () => [0.8, 0.5, 0.2, 0.1, 0.3];
		globalThis.sampleRate = 48000;
		const mix = { l: 0, r: 0 };

		slot.accumulateStereoOutput(0, mix);

		expect(mix.l).toBe(0.25);
		expect(slot.channelWaveformBuf[0][0]).toBe(0);
	});

	it('draws noise from register volume when emulator GetOut is flat', () => {
		const slot = createPreviewSlot();
		slot.paused = false;
		slot.state.channelMuted[3] = false;
		slot.state.channelSoundEnabled[3] = false;
		slot.registerState.channels[3].enabled = true;
		slot.registerState.channels[3].volume = 12;
		slot.registerState.channels[3].volumeReg = 0x1c;
		slot.apuEngine.process = () => ({ left: 0, right: 0 });
		slot.apuEngine.getChannelRawOut = () => 0;
		slot.waveformCapture.readChannelOutputs = () => [0, 0, 0, 0, 0];
		globalThis.sampleRate = 48000;

		slot.accumulateStereoOutput(0, { l: 0, r: 0 });

		expect(Math.abs(slot.channelWaveformBuf[3][0])).toBeGreaterThan(0);
	});

	it('keeps muted noise flat even when registers still look active', () => {
		const slot = createPreviewSlot();
		slot.paused = false;
		slot.state.channelMuted[3] = true;
		slot.registerState.channels[3].enabled = true;
		slot.registerState.channels[3].volume = 12;
		slot.apuEngine.process = () => ({ left: 0, right: 0 });
		slot.apuEngine.getChannelRawOut = () => 8;
		slot.waveformCapture.readChannelOutputs = () => [0, 0, 0, 0.4, 0];
		globalThis.sampleRate = 48000;

		slot.accumulateStereoOutput(0, { l: 0, r: 0 });

		expect(slot.channelWaveformBuf[3][0]).toBe(0);
	});
});
