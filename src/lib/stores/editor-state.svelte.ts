import { settingsStore } from './settings.svelte';

const EDITOR_STATE_STORAGE_KEY = 'editorState';

interface StoredEditorState {
	octave?: number;
	step?: number;
}

interface SelectInstrumentRequest {
	instrumentId: string;
	chipType?: string;
}

class EditorStateStore {
	octave = $state(4);
	step = $state(0);
	envelopeAsNote = $state(false);
	currentInstrumentByChip = $state<Record<string, string>>({ ay: '01' });

	get currentInstrument(): string {
		return this.getCurrentInstrument('ay') ?? '01';
	}

	init(): void {
		this.envelopeAsNote = settingsStore.envelopeAsNote;
		const stored = localStorage.getItem(EDITOR_STATE_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as StoredEditorState;
			if (typeof parsed.octave === 'number' && parsed.octave >= 1 && parsed.octave <= 8) {
				this.octave = parsed.octave;
			} else if (typeof parsed.octave === 'number' && parsed.octave === 0) {
				this.octave = 1;
			}
			if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= 255) {
				this.step = parsed.step;
			}
		}
	}

	setOctave(octave: number): void {
		if (octave >= 1 && octave <= 8) {
			this.octave = octave;
			this.saveEditorState();
		}
	}

	setStep(step: number): void {
		if (step >= 0 && step <= 255) {
			this.step = step;
			this.saveEditorState();
		}
	}

	private saveEditorState(): void {
		localStorage.setItem(
			EDITOR_STATE_STORAGE_KEY,
			JSON.stringify({ octave: this.octave, step: this.step })
		);
	}

	setEnvelopeAsNote(envelopeAsNote: boolean): void {
		if (this.envelopeAsNote === envelopeAsNote) return;
		this.envelopeAsNote = envelopeAsNote;
		settingsStore.set('envelopeAsNote', envelopeAsNote);
	}

	setCurrentInstrument(instrument: string): void {
		this.setCurrentInstrumentForChip('ay', instrument);
	}

	getCurrentInstrument(chipType: string): string | null {
		return this.currentInstrumentByChip[chipType] ?? null;
	}

	setCurrentInstrumentForChip(chipType: string, instrumentId: string): void {
		this.currentInstrumentByChip[chipType] = instrumentId;
	}

	selectInstrumentRequest = $state<SelectInstrumentRequest | null>(null);

	requestSelectInstrument(instrumentId: string, chipType?: string): void {
		if (chipType) {
			this.setCurrentInstrumentForChip(chipType, instrumentId);
		} else {
			this.setCurrentInstrument(instrumentId);
		}
		this.selectInstrumentRequest = { instrumentId, chipType };
	}

	clearSelectInstrumentRequest(): void {
		this.selectInstrumentRequest = null;
	}

	currentTable = $state(0);

	setCurrentTable(tableId: number): void {
		this.currentTable = tableId;
	}

	selectTableRequest = $state<number | null>(null);

	requestSelectTable(tableId: number): void {
		this.currentTable = tableId;
		this.selectTableRequest = tableId;
	}

	clearSelectTableRequest(): void {
		this.selectTableRequest = null;
	}
}

export const editorStateStore = new EditorStateStore();
