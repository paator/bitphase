const NOTE_ON_STATUS_MIN = 0x90;
const NOTE_ON_STATUS_MAX = 0x9f;
const NOTE_OFF_STATUS_MIN = 0x80;
const NOTE_OFF_STATUS_MAX = 0x8f;

export type MidiNoteListener = (midiNote: number, velocity: number) => void;

export interface MidiInputInfo {
	id: string;
	name: string;
}

export class MidiService {
	private access: MIDIAccess | null = null;
	private selectedInputId: string | null = null;
	private listeners = new Set<MidiNoteListener>();
	private boundHandler = (event: MIDIMessageEvent) => this.handleMessage(event);

	static isSupported(): boolean {
		return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
	}

	isSupported(): boolean {
		return MidiService.isSupported();
	}

	hasAccess(): boolean {
		return this.access !== null;
	}

	async requestAccess(): Promise<boolean> {
		if (!MidiService.isSupported()) {
			return false;
		}
		try {
			this.access = await navigator.requestMIDIAccess();
			this.attachSelectedInput();
			this.access.onstatechange = () => this.attachSelectedInput();
			return true;
		} catch {
			return false;
		}
	}

	getInputs(): MidiInputInfo[] {
		if (!this.access) return [];
		return Array.from(this.access.inputs.values()).map((input) => ({
			id: input.id,
			name: input.name || input.id || `MIDI Input ${input.id.slice(0, 8)}`
		}));
	}

	setSelectedInputId(id: string | null): void {
		this.selectedInputId = id;
		this.attachSelectedInput();
	}

	getSelectedInputId(): string | null {
		return this.selectedInputId;
	}

	addNoteListener(listener: MidiNoteListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose(): void {
		this.detachAllInputs();
		if (this.access) {
			this.access.onstatechange = null;
		}
		this.access = null;
		this.selectedInputId = null;
		this.listeners.clear();
	}

	private attachSelectedInput(): void {
		this.detachAllInputs();
		if (!this.access || this.selectedInputId === null) return;
		const input = this.access.inputs.get(this.selectedInputId);
		if (input) {
			input.onmidimessage = this.boundHandler;
		}
	}

	private detachAllInputs(): void {
		if (!this.access) return;
		for (const input of this.access.inputs.values()) {
			input.onmidimessage = null;
		}
	}

	private handleMessage(event: MIDIMessageEvent): void {
		const data = event.data;
		if (!data || data.length < 3 || this.listeners.size === 0) return;
		const status = data[0];
		const midiNote = data[1];
		const velocity = data[2];
		const isNoteOn = status >= NOTE_ON_STATUS_MIN && status <= NOTE_ON_STATUS_MAX;
		const isNoteOff =
			(status >= NOTE_OFF_STATUS_MIN && status <= NOTE_OFF_STATUS_MAX) ||
			(isNoteOn && velocity === 0);
		if (!isNoteOn && !isNoteOff) return;
		const effectiveVelocity = isNoteOff ? 0 : velocity;
		for (const listener of this.listeners) {
			listener(midiNote, effectiveVelocity);
		}
	}
}

export const midiService = new MidiService();
