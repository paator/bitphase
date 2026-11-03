import { describe, expect, it, vi } from 'vitest';
import { TrackerWorkletSlot } from '../../public/tracker/tracker-worklet-slot.js';

class PreviewSlot extends TrackerWorkletSlot {
	constructor() {
		super({ postMessage() {} }, 0);
		this.initialized = true;
		this.state = {
			wasmModule: {},
			timeline: { songEndPending: false, _songEndRow: -1 },
			reset: vi.fn(),
			channelSoundEnabled: []
		};
		this.registerState = {
			channelCount: 1,
			reset: vi.fn()
		};
		this.patternProcessor = {
			parsePatternRow: vi.fn(),
			processTables: vi.fn()
		};
		this.audioDriver = {
			processInstruments: vi.fn()
		};
		this._applyRegisterStateToEngine = vi.fn();
	}
}

function patternWith(globals) {
	return {
		length: 1,
		patternRows: [{ ...globals }],
		channels: [{ rows: [{ note: { name: 2, octave: 4 }, instrument: 1 }] }]
	};
}

describe('TrackerWorkletSlot preview identity', () => {
	it('restarts preview when a global column value changes', () => {
		const slot = new PreviewSlot();
		slot.handlePreviewRow({ pattern: patternWith({ noise0: 0, env0: 0 }), rowIndex: 0 });
		slot.patternProcessor.parsePatternRow.mockClear();
		slot.state.reset.mockClear();

		slot.handlePreviewRow({ pattern: patternWith({ noise0: 2, env0: 0 }), rowIndex: 0 });

		expect(slot.state.reset).toHaveBeenCalled();
		expect(slot.patternProcessor.parsePatternRow).toHaveBeenCalled();
	});

	it('keeps a held preview when the global columns are unchanged', () => {
		const slot = new PreviewSlot();
		const pattern = patternWith({ noise0: 1, env0: 3 });
		slot.handlePreviewRow({ pattern, rowIndex: 0 });
		slot.state.reset.mockClear();
		slot.patternProcessor.parsePatternRow.mockClear();

		slot.handlePreviewRow({ pattern, rowIndex: 0 });

		expect(slot.state.reset).not.toHaveBeenCalled();
		expect(slot.patternProcessor.parsePatternRow).not.toHaveBeenCalled();
	});
});
