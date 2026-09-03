import { Instrument } from '../../models/song';
import {
	alignSharedSequenceMacros,
	cloneInstrumentMacros,
	createDefaultInstrumentMacro,
	type InstrumentMacroValue,
	type InstrumentMacros
} from '../base/instrument-macros';
import { AY_FM_OFFSET_PERIOD, AY_TIMER_MACRO_FIELDS, decodeTimerWaveform, encodeTimerWaveform } from './ay-timer-macros';
import {
	clampFmWaveformValue,
	defaultAyFmWaveform,
	effectiveRowEnvFmWaveformLoop,
	effectiveRowFmWaveformLoop,
	effectiveRowTimerWaveformLoop,
	effectiveInstrumentTimerPwmDuty,
	effectiveInstrumentTimerPwmSweep,
	effectiveInstrumentTimerPwmSweepMin,
	formatAyFmWaveform,
	formatAyTimerWaveform,
	instrumentSupportsTimerPwm,
	normalizeAyInstrumentFields,
	normalizeInstrumentTimerPwmFields,
	parseAyFmWaveform,
	parseAyFmWaveformPartial,
	parseAyTimerWaveform,
	parseAyTimerWaveformPartial,
	resolveAyEnvFmOffsetMode,
	resolveAyFmOffsetMode,
	sampleTimerRowFromMacros,
	clampTimerPwmDuty,
	clampTimerPwmSweep,
	clampTimerPwmSweepMin,
	clampTimerPwmSweepStartPhase,
	AY_TIMER_WAVEFORM_MIN_LENGTH,
	AY_TIMER_WAVEFORM_MAX_LENGTH,
	resolveTimerPwmSweepShape,
	type AyFmOffsetMode,
	type AyInstrumentFields,
	type AyTimerPwmSweepShape,
	type AyTimerRow
} from './instrument';

type ExtendedInstrument = Instrument & Partial<AyInstrumentFields> & { timerMacros?: InstrumentMacros };

export type TimerEditPanel = 'mix' | 'fm' | 'envFm';

export class AyTimerEffectsController {
	fields = $state(normalizeAyInstrumentFields(new Instrument('')));
	timerEditPanel = $state<TimerEditPanel>('mix');
	waveformEditorRowIndex = $state<number | null>(null);
	private waveformSnapshot: { rowIndex: number; waveform: number[] } | null = null;
	private lastInstrumentRef: Instrument | null = null;

	constructor(
		private getInstrument: () => Instrument,
		private onInstrumentChange: (instrument: Instrument) => void,
		private getAsHex: () => boolean
	) {
		this.syncFromInstrument(getInstrument());
	}

	iconSizeClass(isExpanded: boolean): string {
		return isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3';
	}

	formatNum(value: number): string {
		if (this.getAsHex()) {
			return value.toString(16).toUpperCase().padStart(1, '0');
		}
		return String(value);
	}

	handleInstrumentChange(instrument: Instrument): void {
		if (instrument === this.lastInstrumentRef) {
			return;
		}
		this.lastInstrumentRef = instrument;
		this.syncFromInstrument(instrument);
	}

	syncFromInstrument(instrument: Instrument): void {
		const normalized = normalizeAyInstrumentFields(instrument);
		this.fields = {
			timerMacros: cloneInstrumentMacros(normalized.timerMacros) ?? normalized.timerMacros,
			timerPwmDuty: normalized.timerPwmDuty,
			timerPwmSweepMin: normalized.timerPwmSweepMin,
			timerPwmSweep: normalized.timerPwmSweep,
			timerPwmPreserveOnNewNote: normalized.timerPwmPreserveOnNewNote,
			timerPwmSweepStartPhase: normalized.timerPwmSweepStartPhase,
			timerPwmSweepShape: normalized.timerPwmSweepShape
		};
		if (
			this.waveformEditorRowIndex !== null &&
			this.waveformEditorRowIndex >= this.waveformStepLimit()
		) {
			this.waveformEditorRowIndex = null;
		}
	}

	openWaveformEditor(rowIndex: number): void {
		if (rowIndex < 0 || rowIndex >= this.waveformStepLimit()) {
			return;
		}
		this.waveformSnapshot = { rowIndex, waveform: [...this.rowTimerWaveform(rowIndex)] };
		this.waveformEditorRowIndex =
			this.waveformEditorRowIndex === rowIndex ? null : rowIndex;
	}

	saveWaveformEditor(): void {
		this.waveformSnapshot = null;
		this.waveformEditorRowIndex = null;
	}

	discardWaveformEditor(): void {
		if (this.waveformSnapshot !== null) {
			this.setRowTimerWaveform(this.waveformSnapshot.rowIndex, this.waveformSnapshot.waveform);
			this.waveformSnapshot = null;
		}
		this.waveformEditorRowIndex = null;
	}

	closeWaveformEditor(): void {
		this.discardWaveformEditor();
	}

	setTimerEditPanel(panel: TimerEditPanel): void {
		this.timerEditPanel = panel;
		this.closeWaveformEditor();
	}

	private usesOffsetWaveformEditing(): boolean {
		return this.timerEditPanel === 'fm' || this.timerEditPanel === 'envFm';
	}

	private activeWaveformFieldId(): 'timerWaveform' | 'fmWaveform' | 'envFmWaveform' {
		if (this.timerEditPanel === 'envFm') return 'envFmWaveform';
		if (this.timerEditPanel === 'fm') return 'fmWaveform';
		return 'timerWaveform';
	}

	private offsetModeFieldId(): 'fmOffsetMode' | 'envFmOffsetMode' {
		return this.timerEditPanel === 'envFm' ? 'envFmOffsetMode' : 'fmOffsetMode';
	}

	private offsetModeForRow(row: AyTimerRow): AyFmOffsetMode {
		return this.timerEditPanel === 'envFm'
			? resolveAyEnvFmOffsetMode(row)
			: resolveAyFmOffsetMode(row);
	}

	private waveformStepLimit(): number {
		const fieldId =
			this.timerEditPanel === 'fm' ? 'fm' : this.timerEditPanel === 'envFm' ? 'envFm' : 'sid';
		return this.fields.timerMacros[fieldId]?.values.length ?? 1;
	}

	private setMacroStepValue(fieldId: string, stepIndex: number, value: InstrumentMacroValue): void {
		this.setMacroStepValues({ [fieldId]: value }, stepIndex);
	}

	private setMacroStepValues(
		updates: Record<string, InstrumentMacroValue>,
		stepIndex: number
	): void {
		let nextMacros = { ...this.fields.timerMacros };
		for (const [fieldId, value] of Object.entries(updates)) {
			const macro =
				nextMacros[fieldId] ??
				createDefaultInstrumentMacro(
					AY_TIMER_MACRO_FIELDS.find((field) => field.id === fieldId)!
				);
			if (stepIndex < 0 || stepIndex >= macro.values.length) continue;
			const values = [...macro.values];
			values[stepIndex] = value;
			nextMacros = { ...nextMacros, [fieldId]: { ...macro, values } };
		}
		this.commitFields({
			...this.fields,
			timerMacros: alignSharedSequenceMacros(nextMacros, AY_TIMER_MACRO_FIELDS)
		});
	}

	private updateInstrument(updates: Partial<ExtendedInstrument>): void {
		this.onInstrumentChange({ ...this.getInstrument(), ...updates });
	}

	private commitFields(next: AyInstrumentFields): void {
		this.fields = next;
		this.updateInstrument({
			timerMacros: cloneInstrumentMacros(next.timerMacros),
			timerPwmDuty: next.timerPwmDuty,
			timerPwmSweepMin: next.timerPwmSweepMin,
			timerPwmSweep: next.timerPwmSweep,
			timerPwmPreserveOnNewNote: next.timerPwmPreserveOnNewNote,
			timerPwmSweepStartPhase: next.timerPwmSweepStartPhase,
			timerPwmSweepShape: next.timerPwmSweepShape
		});
	}

	instrumentSupportsTimerPwm(): boolean {
		return instrumentSupportsTimerPwm(this.fields);
	}

	timerPwmDuty(): number {
		return effectiveInstrumentTimerPwmDuty(this.fields);
	}

	timerPwmSweepMin(): number {
		return effectiveInstrumentTimerPwmSweepMin(this.fields);
	}

	timerPwmSweep(): number {
		return effectiveInstrumentTimerPwmSweep(this.fields);
	}

	timerPwmPreserveOnNewNote(): boolean {
		return this.fields.timerPwmPreserveOnNewNote;
	}

	setTimerPwmPreserveOnNewNote(preserve: boolean): void {
		if (!this.instrumentSupportsTimerPwm()) return;
		this.commitFields({ ...this.fields, timerPwmPreserveOnNewNote: preserve });
	}

	timerPwmSweepStartPhase(): number {
		return this.fields.timerPwmSweepStartPhase;
	}

	setTimerPwmSweepStartPhase(phase: number): void {
		if (!this.instrumentSupportsTimerPwm() || this.timerPwmSweep() <= 0) return;
		this.commitFields({
			...this.fields,
			timerPwmSweepStartPhase: clampTimerPwmSweepStartPhase(phase)
		});
	}

	timerPwmSweepShape(): AyTimerPwmSweepShape {
		return this.fields.timerPwmSweepShape;
	}

	setTimerPwmSweepShape(shape: AyTimerPwmSweepShape): void {
		if (!this.instrumentSupportsTimerPwm() || this.timerPwmSweep() <= 0) return;
		this.commitFields({
			...this.fields,
			timerPwmSweepShape: resolveTimerPwmSweepShape(shape)
		});
	}

	setTimerPwmDuty(duty: number): void {
		if (!this.instrumentSupportsTimerPwm()) return;
		const pwmFields = normalizeInstrumentTimerPwmFields({
			...this.fields,
			timerPwmDuty: clampTimerPwmDuty(duty)
		});
		this.commitFields({ ...this.fields, ...pwmFields });
	}

	setTimerPwmSweepMin(min: number): void {
		if (!this.instrumentSupportsTimerPwm() || this.fields.timerPwmSweep <= 0) return;
		const pwmFields = normalizeInstrumentTimerPwmFields({
			...this.fields,
			timerPwmSweepMin: clampTimerPwmSweepMin(min, this.fields.timerPwmDuty)
		});
		this.commitFields({ ...this.fields, ...pwmFields });
	}

	parseTimerPwmNum(text: string): number | null {
		return this.parseNum(text);
	}

	usesHexNumerals(): boolean {
		return this.getAsHex();
	}

	updateTimerPwmSweep(text: string): void {
		if (!this.instrumentSupportsTimerPwm()) return;
		const parsed = this.parseNum(text);
		if (parsed === null || parsed < 0) return;
		const pwmFields = normalizeInstrumentTimerPwmFields({
			...this.fields,
			timerPwmSweep: clampTimerPwmSweep(parsed)
		});
		this.commitFields({ ...this.fields, ...pwmFields });
	}

	rowTimerWaveform(stepIndex: number): number[] {
		const fieldId = this.activeWaveformFieldId();
		const encoded = this.fields.timerMacros[fieldId]?.values[stepIndex];
		return decodeTimerWaveform(String(encoded ?? ''));
	}

	rowTimerWaveformLoop(stepIndex: number): number {
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		if (this.timerEditPanel === 'envFm') {
			return effectiveRowEnvFmWaveformLoop(row);
		}
		if (this.timerEditPanel === 'fm') {
			return effectiveRowFmWaveformLoop(row);
		}
		return effectiveRowTimerWaveformLoop(row);
	}

	formatRowTimerWaveform(stepIndex: number): string {
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		if (this.usesOffsetWaveformEditing()) {
			return formatAyFmWaveform(
				this.rowTimerWaveform(stepIndex),
				this.getAsHex(),
				this.offsetModeForRow(row)
			);
		}
		return formatAyTimerWaveform(this.rowTimerWaveform(stepIndex), this.getAsHex());
	}

	setRowTimerWaveform(stepIndex: number, values: number[]): void {
		if (values.length === 0) return;
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		const nextWaveform = this.usesOffsetWaveformEditing()
			? values
					.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
					.map((value) => clampFmWaveformValue(value, this.offsetModeForRow(row)))
			: values
					.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
					.map((value) => Math.max(0, Math.min(15, value | 0)));
		this.setMacroStepValue(
			this.activeWaveformFieldId(),
			stepIndex,
			encodeTimerWaveform(nextWaveform, this.rowTimerWaveformLoop(stepIndex))
		);
	}

	setRowWaveformStep(stepIndex: number, waveformStepIndex: number, step: number): void {
		if (waveformStepIndex < 0) return;
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		const clamped = this.usesOffsetWaveformEditing()
			? clampFmWaveformValue(step, this.offsetModeForRow(row))
			: Math.max(0, Math.min(15, step | 0));
		const nextWaveform = [...this.rowTimerWaveform(stepIndex)];
		while (nextWaveform.length <= waveformStepIndex && nextWaveform.length < AY_TIMER_WAVEFORM_MAX_LENGTH) {
			nextWaveform.push(0);
		}
		if (waveformStepIndex >= nextWaveform.length) return;
		if (nextWaveform[waveformStepIndex] === clamped) return;
		nextWaveform[waveformStepIndex] = clamped;
		this.setRowTimerWaveform(stepIndex, nextWaveform);
	}

	parseTimerWaveform(text: string, stepIndex?: number): number[] | null {
		const row =
			stepIndex !== undefined
				? sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex)
				: undefined;
		if (this.usesOffsetWaveformEditing()) {
			return parseAyFmWaveform(
				text,
				this.getAsHex(),
				row ? this.offsetModeForRow(row) : 'semitone'
			);
		}
		return parseAyTimerWaveform(text, this.getAsHex());
	}

	parseTimerWaveformPartial(text: string, stepIndex?: number): number[] | null {
		const row =
			stepIndex !== undefined
				? sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex)
				: undefined;
		if (this.usesOffsetWaveformEditing()) {
			return parseAyFmWaveformPartial(
				text,
				this.getAsHex(),
				row ? this.offsetModeForRow(row) : 'semitone'
			);
		}
		return parseAyTimerWaveformPartial(text, this.getAsHex());
	}

	appendRowWaveformStep(stepIndex: number, step = 0): boolean {
		const current = this.rowTimerWaveform(stepIndex);
		if (current.length >= AY_TIMER_WAVEFORM_MAX_LENGTH) {
			return false;
		}
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		const clamped = this.usesOffsetWaveformEditing()
			? clampFmWaveformValue(step, this.offsetModeForRow(row))
			: Math.max(0, Math.min(15, step | 0));
		this.setRowTimerWaveform(stepIndex, [...current, clamped]);
		return true;
	}

	canAppendRowWaveformStep(stepIndex: number): boolean {
		return this.rowTimerWaveform(stepIndex).length < AY_TIMER_WAVEFORM_MAX_LENGTH;
	}

	removeRowWaveformStep(stepIndex: number): boolean {
		const current = this.rowTimerWaveform(stepIndex);
		if (current.length <= AY_TIMER_WAVEFORM_MIN_LENGTH) {
			return false;
		}
		this.setRowTimerWaveform(stepIndex, current.slice(0, -1));
		return true;
	}

	canRemoveRowWaveformStep(stepIndex: number): boolean {
		return this.rowTimerWaveform(stepIndex).length > AY_TIMER_WAVEFORM_MIN_LENGTH;
	}

	rowSidEnabled(stepIndex: number): boolean {
		return sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex).sid ?? false;
	}

	rowSyncbuzzerEnabled(stepIndex: number): boolean {
		return sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex).syncbuzzer ?? false;
	}

	rowFmEnabled(stepIndex: number): boolean {
		return sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex).fm ?? false;
	}

	rowEnvFmEnabled(stepIndex: number): boolean {
		return sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex).envFm ?? false;
	}

	rowUsesOffsetWaveform(_stepIndex: number): boolean {
		return this.usesOffsetWaveformEditing();
	}

	rowTimerWaveformUsesEnvelopeShapes(stepIndex: number): boolean {
		return this.timerEditPanel === 'mix' && this.rowSyncbuzzerEnabled(stepIndex);
	}

	rowFmOffsetMode(stepIndex: number) {
		return this.offsetModeForRow(sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex));
	}

	updateFmOffsetMode(stepIndex: number, mode: AyFmOffsetMode): void {
		if (!this.usesOffsetWaveformEditing()) return;
		const row = sampleTimerRowFromMacros(this.fields.timerMacros, stepIndex);
		const currentMode = this.offsetModeForRow(row);
		if (currentMode === mode) return;
		const currentWaveform = this.rowTimerWaveform(stepIndex);
		const currentDefault = defaultAyFmWaveform(currentMode);
		const usesDefaultWaveform =
			currentWaveform.length === currentDefault.length &&
			currentWaveform.every(
				(value, index) =>
					clampFmWaveformValue(value, currentMode) ===
					clampFmWaveformValue(currentDefault[index] ?? 0, currentMode)
			);
		const nextWaveform = usesDefaultWaveform
			? defaultAyFmWaveform(mode)
			: currentWaveform.map((value) => clampFmWaveformValue(value, mode));
		this.setMacroStepValues(
			{
				[this.offsetModeFieldId()]: mode === 'period' ? AY_FM_OFFSET_PERIOD : 0,
				[this.activeWaveformFieldId()]: encodeTimerWaveform(
					nextWaveform,
					this.rowTimerWaveformLoop(stepIndex)
				)
			},
			stepIndex
		);
	}

	toggleFmOffsetMode(stepIndex: number): void {
		this.updateFmOffsetMode(
			stepIndex,
			this.rowFmOffsetMode(stepIndex) === 'period' ? 'semitone' : 'period'
		);
	}

	rowTimerWaveformUsesFmSemitones(stepIndex: number): boolean {
		return this.usesOffsetWaveformEditing() && this.rowFmOffsetMode(stepIndex) === 'semitone';
	}

	rowTimerWaveformUsesFmPeriodOffsets(stepIndex: number): boolean {
		return this.usesOffsetWaveformEditing() && this.rowFmOffsetMode(stepIndex) === 'period';
	}

	private parseNum(text: string): number | null {
		const trimmed = text.trim();
		if (!trimmed) return null;
		const parsed = this.getAsHex() ? parseInt(trimmed, 16) : Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
}
