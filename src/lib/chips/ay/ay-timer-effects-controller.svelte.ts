import {
	clampLoopRow,
	cloneRowValue,
	createNextRow
} from '../../components/RowEditorTable/row-list-operations';
import { Instrument } from '../../models/song';
import {
	createDefaultAyTimerRow,
	DEFAULT_AY_TIMER_WAVEFORM,
	DEFAULT_AY_SYNCBUZZER_WAVEFORM,
	DEFAULT_AY_FM_WAVEFORM,
	DEFAULT_AY_FM_PERIOD_WAVEFORM,
	defaultAyFmWaveform,
	clampFmWaveformValue,
	clampFmPeriodOffset,
	clampFmSemitone,
	isIncompleteSignedNumericToken,
	effectiveRowDetune,
	effectiveRowFmWaveformLoop,
	effectiveRowEnvFmWaveformLoop,
	panelRowFmWaveform,
	panelRowEnvFmWaveform,
	effectiveRowMixTimerWaveform,
	resolveAyFmOffsetMode,
	effectiveRowPeriod,
	effectiveInstrumentTimerPwmDuty,
	effectiveInstrumentTimerPwmSweep,
	effectiveInstrumentTimerPwmSweepMin,
	effectiveRowTimerWaveform,
	effectiveRowTimerWaveformLoop,
	instrumentSupportsTimerPwm,
	effectiveRowToneDetune,
	formatAyTimerWaveform,
	formatAyFmWaveform,
	isDefaultSidTimerWaveform,
	normalizeAyInstrumentFields,
	parseAyFmWaveform,
	parseAyFmWaveformPartial,
	normalizeInstrumentTimerPwmFields,
	parseAyTimerWaveform,
	parseAyTimerWaveformPartial,
	resolveExclusiveTimerEffects,
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

type ExtendedInstrument = Instrument & Partial<AyInstrumentFields>;

export type TimerEffectDragField = 'sid' | 'syncbuzzer' | 'fm' | 'envFm';
export type TimerEditPanel = 'mix' | 'fm' | 'envFm';

export class AyTimerEffectsController {
	fields = $state(normalizeAyInstrumentFields(new Instrument('', [])));
	timerEditPanel = $state<TimerEditPanel>('mix');
	waveformEditorRowIndex = $state<number | null>(null);
	isDragging = $state(false);
	dragPaintValue = $state<boolean | null>(null);

	private lastInstrumentId = '';
	private lastSyncedRowCount = 0;
	private lastInstrumentRef: Instrument | null = null;

	constructor(
		private getInstrument: () => Instrument,
		private onInstrumentChange: (instrument: Instrument) => void,
		private getAsHex: () => boolean
	) {
		this.syncFromInstrument(getInstrument());
	}

	timerRows = $derived(this.fields.timerRows);

	iconSizeClass(isExpanded: boolean): string {
		return isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3';
	}

	formatNum(value: number): string {
		if (this.getAsHex()) {
			return value.toString(16).toUpperCase().padStart(1, '0');
		}
		return String(value);
	}

	formatSignedNum(value: number): string {
		if (this.getAsHex()) {
			const sign = value < 0 ? '-' : '';
			return sign + Math.abs(value).toString(16).toUpperCase();
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
			timerRows: normalized.timerRows.map((row) => ({ ...row })),
			timerLoop: normalized.timerLoop,
			timerPwmDuty: normalized.timerPwmDuty,
			timerPwmSweepMin: normalized.timerPwmSweepMin,
			timerPwmSweep: normalized.timerPwmSweep,
			timerPwmPreserveOnNewNote: normalized.timerPwmPreserveOnNewNote,
			timerPwmSweepStartPhase: normalized.timerPwmSweepStartPhase,
			timerPwmSweepShape: normalized.timerPwmSweepShape
		};
		if (
			this.waveformEditorRowIndex !== null &&
			this.waveformEditorRowIndex >= this.fields.timerRows.length
		) {
			this.waveformEditorRowIndex = null;
		}
		this.lastSyncedRowCount = this.fields.timerRows.length;
		this.lastInstrumentId = instrument.id;
	}

	stopDrag(): void {
		this.isDragging = false;
		this.dragPaintValue = null;
	}

	openWaveformEditor(rowIndex: number): void {
		if (rowIndex < 0 || rowIndex >= this.fields.timerRows.length) {
			return;
		}
		this.waveformEditorRowIndex =
			this.waveformEditorRowIndex === rowIndex ? null : rowIndex;
	}

	closeWaveformEditor(): void {
		this.waveformEditorRowIndex = null;
	}

	setTimerEditPanel(panel: TimerEditPanel): void {
		this.timerEditPanel = panel;
		this.closeWaveformEditor();
	}

	private usesOffsetWaveformEditing(): boolean {
		return this.timerEditPanel === 'fm' || this.timerEditPanel === 'envFm';
	}

	private activeOffsetWaveformField(): 'fmWaveform' | 'envFmWaveform' {
		return this.timerEditPanel === 'envFm' ? 'envFmWaveform' : 'fmWaveform';
	}

	private effectiveActiveOffsetWaveform(row: AyTimerRow | undefined): number[] {
		return this.timerEditPanel === 'envFm'
			? panelRowEnvFmWaveform(row)
			: panelRowFmWaveform(row);
	}

	private commitActiveOffsetWaveform(rowIndex: number, nextWaveform: number[]): void {
		const field = this.activeOffsetWaveformField();
		this.mapTimerRow(rowIndex, (row) => ({ ...row, [field]: nextWaveform }));
	}

	private updateInstrument(updates: Partial<ExtendedInstrument>): void {
		this.onInstrumentChange({ ...this.getInstrument(), ...updates });
	}

	private commitFields(next: AyInstrumentFields): void {
		this.fields = next;
		this.updateInstrument({
			timerRows: next.timerRows,
			timerLoop: next.timerLoop,
			timerPwmDuty: next.timerPwmDuty,
			timerPwmSweepMin: next.timerPwmSweepMin,
			timerPwmSweep: next.timerPwmSweep,
			timerPwmPreserveOnNewNote: next.timerPwmPreserveOnNewNote,
			timerPwmSweepStartPhase: next.timerPwmSweepStartPhase,
			timerPwmSweepShape: next.timerPwmSweepShape
		});
	}

	private clampTimerLoop(loop: number, rowCount = this.fields.timerRows.length): number {
		return Math.max(0, clampLoopRow(loop, rowCount));
	}

	setTimerLoop(loop: number): void {
		this.commitFields({ ...this.fields, timerLoop: this.clampTimerLoop(loop) });
	}

	addTimerRow(): void {
		const rows = this.fields.timerRows;
		this.updateTimerRows([
			...rows,
			createNextRow(rows, createDefaultAyTimerRow)
		]);
	}

	setTimerRowCount(targetCount: number): void {
		const count = Math.max(1, Math.min(512, targetCount));
		const currentRows = this.fields.timerRows;
		if (count === currentRows.length) {
			return;
		}
		let nextRows: AyTimerRow[];
		if (count > currentRows.length) {
			const toAdd = count - currentRows.length;
			const sourceRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
			nextRows = [
				...currentRows,
				...(sourceRow !== null
					? Array.from({ length: toAdd }, () => cloneRowValue(sourceRow))
					: Array.from({ length: toAdd }, createDefaultAyTimerRow))
			];
		} else {
			nextRows = currentRows.slice(0, count);
		}
		this.commitFields({
			...this.fields,
			timerRows: nextRows,
			timerLoop: this.clampTimerLoop(this.fields.timerLoop, nextRows.length)
		});
	}

	removeTimerRow(index: number): void {
		if (this.fields.timerRows.length === 1) {
			return;
		}
		const nextRows = this.fields.timerRows.filter((_, rowIndex) => rowIndex !== index);
		this.commitFields({
			...this.fields,
			timerRows: nextRows,
			timerLoop: this.clampTimerLoop(this.fields.timerLoop, nextRows.length)
		});
	}

	removeTimerRowsFromBottom(index: number): void {
		if (this.fields.timerRows.length === 1) {
			return;
		}
		const rowsToKeep = index + 1;
		if (rowsToKeep >= this.fields.timerRows.length) {
			return;
		}
		const nextRows = this.fields.timerRows.slice(0, rowsToKeep);
		this.commitFields({
			...this.fields,
			timerRows: nextRows,
			timerLoop: this.clampTimerLoop(this.fields.timerLoop, nextRows.length)
		});
	}

	private updateTimerRows(nextRows: AyTimerRow[]): void {
		this.commitFields({ ...this.fields, timerRows: nextRows });
	}

	private mapTimerRow(rowIndex: number, mapRow: (row: AyTimerRow) => AyTimerRow): void {
		this.updateTimerRows(
			this.fields.timerRows.map((row, index) => (index === rowIndex ? mapRow(row) : row))
		);
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
		if (parsed === null) return;
		const pwmFields = normalizeInstrumentTimerPwmFields({
			...this.fields,
			timerPwmSweep: clampTimerPwmSweep(parsed)
		});
		this.commitFields({ ...this.fields, ...pwmFields });
	}

	updateSidRow(index: number, sid: boolean): void {
		this.mapTimerRow(index, (row) => {
			const wasSyncbuzzer = !!row.syncbuzzer;
			const resolved = resolveExclusiveTimerEffects({
				...row,
				sid,
				syncbuzzer: sid ? false : row.syncbuzzer
			});
			if (sid && wasSyncbuzzer) {
				return { ...resolved, timerWaveform: [...DEFAULT_AY_TIMER_WAVEFORM] };
			}
			return resolved;
		});
	}

	updateSyncbuzzerRow(index: number, syncbuzzer: boolean): void {
		this.mapTimerRow(index, (row) => {
			const wasSid = !!row.sid;
			const resolved = resolveExclusiveTimerEffects({
				...row,
				syncbuzzer,
				sid: syncbuzzer ? false : row.sid
			});
			if (!syncbuzzer) {
				return resolved;
			}
			if (
				wasSid ||
				isDefaultSidTimerWaveform(effectiveRowMixTimerWaveform(resolved))
			) {
				return {
					...resolved,
					timerWaveform: [...DEFAULT_AY_SYNCBUZZER_WAVEFORM]
				};
			}
			return resolved;
		});
	}

	updateFmRow(index: number, fm: boolean): void {
		this.mapTimerRow(index, (row) => {
			const resolved = resolveExclusiveTimerEffects({ ...row, fm });
			if (!fm) {
				return resolved;
			}
			const hasFmWaveform = !!(row.fmWaveform && row.fmWaveform.length > 0);
			if (!hasFmWaveform) {
				return {
					...resolved,
					fmWaveform: defaultAyFmWaveform(resolveAyFmOffsetMode(resolved))
				};
			}
			return resolved;
		});
	}

	updateEnvFmRow(index: number, envFm: boolean): void {
		this.mapTimerRow(index, (row) => {
			const resolved = resolveExclusiveTimerEffects({ ...row, envFm });
			if (!envFm) {
				return resolved;
			}
			const hasEnvFmWaveform = !!(row.envFmWaveform && row.envFmWaveform.length > 0);
			if (!hasEnvFmWaveform) {
				return {
					...resolved,
					envFmWaveform: defaultAyFmWaveform(resolveAyFmOffsetMode(resolved))
				};
			}
			return resolved;
		});
	}

	updateFmOffsetMode(index: number, mode: AyFmOffsetMode): void {
		this.mapTimerRow(index, (row) => {
			if (!this.usesOffsetWaveformEditing()) {
				return { ...row, fmOffsetMode: mode };
			}
			const currentMode = resolveAyFmOffsetMode(row);
			if (currentMode === mode) {
				return row;
			}
			const currentWaveform = this.effectiveActiveOffsetWaveform({
				...row,
				fmOffsetMode: currentMode
			});
			const usesDefaultWaveform =
				currentMode === 'semitone'
					? currentWaveform.every(
							(value, stepIndex) =>
								clampFmSemitone(value) === clampFmSemitone(DEFAULT_AY_FM_WAVEFORM[stepIndex] ?? 0)
						) && currentWaveform.length === DEFAULT_AY_FM_WAVEFORM.length
					: currentWaveform.every(
							(value, stepIndex) =>
								clampFmPeriodOffset(value) ===
								clampFmPeriodOffset(DEFAULT_AY_FM_PERIOD_WAVEFORM[stepIndex] ?? 0)
						) && currentWaveform.length === DEFAULT_AY_FM_PERIOD_WAVEFORM.length;
			const nextWaveform = usesDefaultWaveform
				? defaultAyFmWaveform(mode)
				: currentWaveform.map((value) => clampFmWaveformValue(value, mode));
			const field = this.activeOffsetWaveformField();
			return {
				...row,
				fmOffsetMode: mode,
				[field]: nextWaveform
			};
		});
	}

	toggleFmOffsetMode(index: number): void {
		if (!this.usesOffsetWaveformEditing()) return;
		const row = this.fields.timerRows[index];
		if (!row) return;
		const nextMode = resolveAyFmOffsetMode(row) === 'period' ? 'semitone' : 'period';
		this.updateFmOffsetMode(index, nextMode);
	}

	beginDragTimerEffect(index: number, field: TimerEffectDragField): void {
		const currentValue = this.timerEffectFieldValue(index, field);
		this.isDragging = true;
		this.dragPaintValue = !currentValue;
		this.applyTimerEffectField(index, field, this.dragPaintValue);
	}

	dragOverTimerEffect(index: number, field: TimerEffectDragField): void {
		if (this.isDragging && this.dragPaintValue !== null) {
			this.applyTimerEffectField(index, field, this.dragPaintValue);
		}
	}

	private timerEffectFieldValue(index: number, field: TimerEffectDragField): boolean {
		const row = this.fields.timerRows[index];
		if (!row) {
			return false;
		}
		switch (field) {
			case 'sid':
				return row.sid;
			case 'syncbuzzer':
				return !!row.syncbuzzer;
			case 'fm':
				return !!row.fm;
			case 'envFm':
				return !!row.envFm;
		}
	}

	private applyTimerEffectField(
		index: number,
		field: TimerEffectDragField,
		value: boolean
	): void {
		switch (field) {
			case 'sid':
				this.updateSidRow(index, value);
				break;
			case 'syncbuzzer':
				this.updateSyncbuzzerRow(index, value);
				break;
			case 'fm':
				this.updateFmRow(index, value);
				break;
			case 'envFm':
				this.updateEnvFmRow(index, value);
				break;
		}
	}

	updateRowDetune(index: number, text: string): void {
		let parsed = this.parseSignedNum(text);
		if (parsed === null) return;
		if (parsed < -4095) parsed = -4095;
		if (parsed > 4095) parsed = 4095;
		this.mapTimerRow(index, (row) => ({ ...row, detune: parsed }));
	}

	updateRowToneDetune(index: number, text: string): void {
		let parsed = this.parseSignedNum(text);
		if (parsed === null) return;
		if (parsed < -127) parsed = -127;
		if (parsed > 128) parsed = 128;
		this.mapTimerRow(index, (row) => ({ ...row, semitone: parsed }));
	}

	updateRowPeriod(index: number, text: string): void {
		const parsed = this.parseNum(text);
		if (parsed === null || parsed < 1) return;
		this.mapTimerRow(index, (row) => ({ ...row, period: parsed & 0xffff }));
	}

	rowTimerWaveform(rowIndex: number): number[] {
		const row = this.fields.timerRows[rowIndex];
		if (this.timerEditPanel === 'envFm') {
			return panelRowEnvFmWaveform(row);
		}
		if (this.timerEditPanel === 'fm') {
			return panelRowFmWaveform(row);
		}
		return effectiveRowTimerWaveform(row);
	}

	rowTimerWaveformLoop(rowIndex: number): number {
		const row = this.fields.timerRows[rowIndex];
		if (this.timerEditPanel === 'envFm') {
			return effectiveRowEnvFmWaveformLoop(row);
		}
		if (this.timerEditPanel === 'fm') {
			return effectiveRowFmWaveformLoop(row);
		}
		return effectiveRowTimerWaveformLoop(row);
	}

	formatRowTimerWaveform(rowIndex: number): string {
		const row = this.fields.timerRows[rowIndex];
		if (this.usesOffsetWaveformEditing()) {
			return formatAyFmWaveform(
				this.rowTimerWaveform(rowIndex),
				this.getAsHex(),
				resolveAyFmOffsetMode(row)
			);
		}
		return formatAyTimerWaveform(this.rowTimerWaveform(rowIndex), this.getAsHex());
	}

	setRowTimerWaveform(rowIndex: number, values: number[]): void {
		if (values.length === 0) {
			return;
		}
		const row = this.fields.timerRows[rowIndex];
		if (this.usesOffsetWaveformEditing()) {
			const nextWaveform = values
				.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
				.map((value) => clampFmWaveformValue(value, resolveAyFmOffsetMode(row)));
			this.commitActiveOffsetWaveform(rowIndex, nextWaveform);
			return;
		}
		const nextWaveform = values
			.slice(0, AY_TIMER_WAVEFORM_MAX_LENGTH)
			.map((value) => Math.max(0, Math.min(15, value | 0)));
		this.mapTimerRow(rowIndex, (current) => ({ ...current, timerWaveform: nextWaveform }));
	}

	setRowWaveformStep(rowIndex: number, stepIndex: number, step: number): void {
		if (stepIndex < 0) return;
		const row = this.fields.timerRows[rowIndex];
		const clamped = this.usesOffsetWaveformEditing()
			? clampFmWaveformValue(step, resolveAyFmOffsetMode(row))
			: Math.max(0, Math.min(15, step | 0));
		const nextWaveform = [...this.rowTimerWaveform(rowIndex)];
		while (nextWaveform.length <= stepIndex && nextWaveform.length < AY_TIMER_WAVEFORM_MAX_LENGTH) {
			nextWaveform.push(0);
		}
		if (stepIndex >= nextWaveform.length) return;
		if (nextWaveform[stepIndex] === clamped) return;
		nextWaveform[stepIndex] = clamped;
		if (this.usesOffsetWaveformEditing()) {
			this.commitActiveOffsetWaveform(rowIndex, nextWaveform);
			return;
		}
		this.mapTimerRow(rowIndex, (current) => ({ ...current, timerWaveform: nextWaveform }));
	}

	parseTimerWaveform(text: string, rowIndex?: number): number[] | null {
		const row = rowIndex !== undefined ? this.fields.timerRows[rowIndex] : undefined;
		if (this.usesOffsetWaveformEditing()) {
			return parseAyFmWaveform(text, this.getAsHex(), resolveAyFmOffsetMode(row));
		}
		return parseAyTimerWaveform(text, this.getAsHex());
	}

	parseTimerWaveformPartial(text: string, rowIndex?: number): number[] | null {
		const row = rowIndex !== undefined ? this.fields.timerRows[rowIndex] : undefined;
		if (this.usesOffsetWaveformEditing()) {
			return parseAyFmWaveformPartial(text, this.getAsHex(), resolveAyFmOffsetMode(row));
		}
		return parseAyTimerWaveformPartial(text, this.getAsHex());
	}

	appendRowWaveformStep(rowIndex: number, step = 0): boolean {
		const current = this.rowTimerWaveform(rowIndex);
		if (current.length >= AY_TIMER_WAVEFORM_MAX_LENGTH) {
			return false;
		}
		const row = this.fields.timerRows[rowIndex];
		const clamped = this.usesOffsetWaveformEditing()
			? clampFmWaveformValue(step, resolveAyFmOffsetMode(row))
			: Math.max(0, Math.min(15, step | 0));
		if (this.usesOffsetWaveformEditing()) {
			this.commitActiveOffsetWaveform(rowIndex, [...current, clamped]);
			return true;
		}
		this.mapTimerRow(rowIndex, (currentRow) => ({ ...currentRow, timerWaveform: [...current, clamped] }));
		return true;
	}

	canAppendRowWaveformStep(rowIndex: number): boolean {
		return this.rowTimerWaveform(rowIndex).length < AY_TIMER_WAVEFORM_MAX_LENGTH;
	}

	removeRowWaveformStep(rowIndex: number): boolean {
		const current = this.rowTimerWaveform(rowIndex);
		if (current.length <= AY_TIMER_WAVEFORM_MIN_LENGTH) {
			return false;
		}
		const nextWaveform = current.slice(0, -1);
		if (this.usesOffsetWaveformEditing()) {
			this.commitActiveOffsetWaveform(rowIndex, nextWaveform);
			return true;
		}
		this.mapTimerRow(rowIndex, (row) => ({ ...row, timerWaveform: nextWaveform }));
		return true;
	}

	canRemoveRowWaveformStep(rowIndex: number): boolean {
		return this.rowTimerWaveform(rowIndex).length > AY_TIMER_WAVEFORM_MIN_LENGTH;
	}

	rowDetune(index: number): number {
		return effectiveRowDetune(this.fields.timerRows[index]);
	}

	rowPeriod(index: number): number {
		return effectiveRowPeriod(this.fields.timerRows[index]);
	}

	rowToneDetune(index: number): number {
		return effectiveRowToneDetune(this.fields.timerRows[index]);
	}

	rowSidEnabled(index: number): boolean {
		return this.fields.timerRows[index]?.sid ?? false;
	}

	rowSyncbuzzerEnabled(index: number): boolean {
		return this.fields.timerRows[index]?.syncbuzzer ?? false;
	}

	rowFmEnabled(index: number): boolean {
		return this.fields.timerRows[index]?.fm ?? false;
	}

	rowEnvFmEnabled(index: number): boolean {
		return this.fields.timerRows[index]?.envFm ?? false;
	}

	rowUsesOffsetWaveform(index: number): boolean {
		return this.usesOffsetWaveformEditing();
	}

	rowTimerWaveformUsesEnvelopeShapes(index: number): boolean {
		return this.timerEditPanel === 'mix' && this.rowSyncbuzzerEnabled(index);
	}

	rowFmOffsetMode(index: number): AyFmOffsetMode {
		return resolveAyFmOffsetMode(this.fields.timerRows[index]);
	}

	rowTimerWaveformUsesFmSemitones(index: number): boolean {
		return this.usesOffsetWaveformEditing() && this.rowFmOffsetMode(index) === 'semitone';
	}

	rowTimerWaveformUsesFmPeriodOffsets(index: number): boolean {
		return this.usesOffsetWaveformEditing() && this.rowFmOffsetMode(index) === 'period';
	}

	private parseNum(text: string): number | null {
		const trimmed = text.trim();
		if (this.getAsHex()) {
			if (!/^[0-9a-fA-F]+$/.test(trimmed)) return null;
			return parseInt(trimmed, 16);
		}
		if (!/^\d+$/.test(trimmed)) return null;
		return parseInt(trimmed, 10);
	}

	private parseSignedNum(text: string): number | null {
		const trimmed = text.trim();
		if (isIncompleteSignedNumericToken(trimmed)) {
			return null;
		}
		if (this.getAsHex()) {
			let sign = 1;
			let temp = trimmed;
			if (temp.startsWith('-')) {
				sign = -1;
				temp = temp.substring(1);
			}
			if (temp.length === 0 || (sign < 0 && /^0+$/.test(temp))) {
				return null;
			}
			if (!/^[0-9a-fA-F]+$/.test(temp)) return null;
			return sign * parseInt(temp, 16);
		}
		if (!/^-?\d+$/.test(trimmed)) return null;
		return parseInt(trimmed, 10);
	}
}
