import { settingsStore } from './settings.svelte';

const EDITOR_STATE_STORAGE_KEY = 'editorState';

export type PatternEditView = 'tracker' | 'piano-roll';

interface StoredEditorState {
	octave?: number;
	step?: number;
	editView?: PatternEditView;
	pianoRollSongIndex?: number;
	pianoRollChannelIndex?: number;
	pianoRollLaneKey?: string | null;
}

interface SelectInstrumentRequest {
	instrumentId: string;
	chipType?: string;
}

class EditorStateStore {
	octave = $state(4);
	step = $state(0);
	editView = $state<PatternEditView>('tracker');
	pianoRollSongIndex = $state(0);
	pianoRollChannelIndex = $state(0);
	pianoRollLaneKey = $state<string | null>(null);
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
			if (parsed.editView === 'tracker') {
				this.editView = 'tracker';
			} else if (parsed.editView === 'piano-roll' && settingsStore.experimentalFeatures) {
				this.editView = 'piano-roll';
			}
			if (
				typeof parsed.pianoRollSongIndex === 'number' &&
				parsed.pianoRollSongIndex >= 0
			) {
				this.pianoRollSongIndex = parsed.pianoRollSongIndex;
			}
			if (
				typeof parsed.pianoRollChannelIndex === 'number' &&
				parsed.pianoRollChannelIndex >= 0
			) {
				this.pianoRollChannelIndex = parsed.pianoRollChannelIndex;
			}
			if (typeof parsed.pianoRollLaneKey === 'string' || parsed.pianoRollLaneKey === null) {
				this.pianoRollLaneKey = parsed.pianoRollLaneKey ?? null;
			}
		}
	}

	setEditView(editView: PatternEditView): void {
		if (editView === 'piano-roll' && !settingsStore.experimentalFeatures) return;
		if (this.editView === editView) return;
		this.editView = editView;
		this.saveEditorState();
	}

	setPianoRollChannel(songIndex: number, channelIndex: number): void {
		if (
			this.pianoRollSongIndex === songIndex &&
			this.pianoRollChannelIndex === channelIndex
		) {
			return;
		}
		this.pianoRollSongIndex = songIndex;
		this.pianoRollChannelIndex = channelIndex;
		this.saveEditorState();
	}

	setPianoRollLaneKey(laneKey: string | null): void {
		if (this.pianoRollLaneKey === laneKey) return;
		this.pianoRollLaneKey = laneKey;
		this.saveEditorState();
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
			JSON.stringify({
				octave: this.octave,
				step: this.step,
				editView: this.editView,
				pianoRollSongIndex: this.pianoRollSongIndex,
				pianoRollChannelIndex: this.pianoRollChannelIndex,
				pianoRollLaneKey: this.pianoRollLaneKey
			})
		);
	}

	setEnvelopeAsNote(envelopeAsNote: boolean): void {
		this.envelopeAsNote = envelopeAsNote;
		if (settingsStore.envelopeAsNote !== envelopeAsNote) {
			settingsStore.set('envelopeAsNote', envelopeAsNote);
		}
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
