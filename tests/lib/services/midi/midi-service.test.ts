import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MidiService } from '../../../../src/lib/services/midi/midi-service';

describe('MidiService', () => {
	let service: MidiService;
	let fakeInput: { onmidimessage: ((event: MIDIMessageEvent) => void) | null };
	let requestMIDIAccessMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		service = new MidiService();
		fakeInput = { id: 'test-input', name: 'Test Input', onmidimessage: null as ((e: MIDIMessageEvent) => void) | null };
		requestMIDIAccessMock = vi.fn().mockResolvedValue({
			inputs: new Map([['test-input', fakeInput]]),
			onstatechange: null as (() => void) | null
		});
		Object.defineProperty(globalThis, 'navigator', {
			value: { requestMIDIAccess: requestMIDIAccessMock },
			writable: true,
			configurable: true
		});
	});

	afterEach(() => {
		service.dispose();
	});

	describe('isSupported', () => {
		it('returns true when navigator has requestMIDIAccess', () => {
			expect(MidiService.isSupported()).toBe(true);
			expect(service.isSupported()).toBe(true);
		});

		it('returns false when navigator lacks requestMIDIAccess', () => {
			Object.defineProperty(globalThis, 'navigator', {
				value: {},
				writable: true,
				configurable: true
			});
			expect(MidiService.isSupported()).toBe(false);
		});
	});

	describe('addNoteListener', () => {
		it('returns an unsubscribe function', () => {
			const listener = vi.fn();
			const remove = service.addNoteListener(listener);
			expect(typeof remove).toBe('function');
		});

		it('removes listener when unsubscribe is called', async () => {
			await service.requestAccess();
			service.setSelectedInputId('test-input');
			const listener = vi.fn();
			const remove = service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60, 100])
			} as MIDIMessageEvent);
			expect(listener).toHaveBeenCalledWith(60, 100);
			listener.mockClear();
			remove();
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60, 100])
			} as MIDIMessageEvent);
			expect(listener).not.toHaveBeenCalled();
		});

		it('allows multiple listeners to be notified', async () => {
			await service.requestAccess();
			service.setSelectedInputId('test-input');
			const listener1 = vi.fn();
			const listener2 = vi.fn();
			service.addNoteListener(listener1);
			service.addNoteListener(listener2);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60, 100])
			} as MIDIMessageEvent);
			expect(listener1).toHaveBeenCalledWith(60, 100);
			expect(listener2).toHaveBeenCalledWith(60, 100);
		});
	});

	describe('requestAccess', () => {
		it('returns false when not supported', async () => {
			Object.defineProperty(globalThis, 'navigator', {
				value: {},
				writable: true,
				configurable: true
			});
			const unsupportedService = new MidiService();
			const result = await unsupportedService.requestAccess();
			expect(result).toBe(false);
		});

		it('returns true when supported', async () => {
			const result = await service.requestAccess();
			expect(result).toBe(true);
			expect(requestMIDIAccessMock).toHaveBeenCalled();
		});

		it('getInputs returns list after access', async () => {
			await service.requestAccess();
			const inputs = service.getInputs();
			expect(inputs).toHaveLength(1);
			expect(inputs[0]).toEqual({ id: 'test-input', name: 'Test Input' });
		});

		it('attaches only to selected input', async () => {
			await service.requestAccess();
			expect(fakeInput.onmidimessage).toBeNull();
			service.setSelectedInputId('test-input');
			expect(fakeInput.onmidimessage).not.toBeNull();
		});
	});

	describe('note-on and note-off', () => {
		beforeEach(async () => {
			await service.requestAccess();
			service.setSelectedInputId('test-input');
		});

		it('invokes listener with midiNote and velocity on note-on (0x90)', () => {
			const listener = vi.fn();
			service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60, 100])
			} as MIDIMessageEvent);
			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenCalledWith(60, 100);
		});

		it('invokes listener with velocity 0 on note-off (0x80)', () => {
			const listener = vi.fn();
			service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x80, 60, 0])
			} as MIDIMessageEvent);
			expect(listener).toHaveBeenCalledWith(60, 0);
		});

		it('invokes listener with velocity 0 on note-on with zero velocity', () => {
			const listener = vi.fn();
			service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60, 0])
			} as MIDIMessageEvent);
			expect(listener).toHaveBeenCalledWith(60, 0);
		});

		it('does not invoke listener for non-note message', () => {
			const listener = vi.fn();
			service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0xb0, 60, 100])
			} as MIDIMessageEvent);
			expect(listener).not.toHaveBeenCalled();
		});

		it('does not invoke when data has fewer than 3 bytes', () => {
			const listener = vi.fn();
			service.addNoteListener(listener);
			fakeInput.onmidimessage!({
				data: new Uint8Array([0x90, 60])
			} as MIDIMessageEvent);
			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('dispose', () => {
		it('detaches inputs and clears listeners', async () => {
			await service.requestAccess();
			service.setSelectedInputId('test-input');
			service.dispose();
			expect(fakeInput.onmidimessage).toBeNull();
		});
	});
});
