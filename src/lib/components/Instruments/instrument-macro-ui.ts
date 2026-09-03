import {
	INSTRUMENT_MACRO_MAX_LENGTH,
	INSTRUMENT_MACRO_MIN_LENGTH,
	macroValueToNormalized,
	type InstrumentMacroField,
	type InstrumentMacroValue
} from '../../chips/base/instrument-macros';
import { formatRowEditorNumber } from '../../utils/row-editor-numeric';

export const MACRO_LOOP_HANDLE_WIDTH = 12;
export const MACRO_LENGTH_HANDLE_WIDTH = 16;
export const MACRO_VALUE_LABEL_HEIGHT = 16;
export const MACRO_BAR_INSET = 3;

export const MACRO_STEP_INPUT_CLASS =
	'h-full w-full min-w-0 cursor-pointer border-0 bg-transparent px-0 text-center font-mono text-[0.55rem] leading-none text-[var(--color-app-text-muted)] transition-colors duration-150 outline-none hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)] focus:cursor-text focus:bg-[var(--color-app-surface-hover)] focus:text-[var(--color-app-text-primary)] focus:outline-none';

export const MACRO_STEP_LABEL_CLASS =
	'flex h-full w-full select-none items-center justify-center font-mono text-[0.55rem] leading-none text-[var(--color-app-text-muted)]';

export function macroStepWidthPx(isExpanded: boolean): number {
	return isExpanded ? 36 : 30;
}

export function macroIconClass(isExpanded: boolean): string {
	return isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3';
}

export function instrumentMacroUsesBarChart(field: InstrumentMacroField): boolean {
	return field.kind === 'integer' || Boolean(field.enumValues?.some((option) => option.bar));
}

export function macroFieldRowHeight(field: InstrumentMacroField, isExpanded: boolean): number {
	if (instrumentMacroUsesBarChart(field)) return isExpanded ? 108 : 86;
	if (field.kind === 'boolean') return isExpanded ? 36 : 30;
	if (field.kind === 'waveform') return isExpanded ? 48 : 38;
	if (field.enumValues?.some((option) => option.icon)) return isExpanded ? 36 : 30;
	return isExpanded ? 28 : 22;
}

export function cycleInstrumentMacroEnum(
	field: InstrumentMacroField,
	current: InstrumentMacroValue
): InstrumentMacroValue {
	const options = field.enumValues;
	if (!options?.length) return field.defaultValue;
	const index = options.findIndex((option) => option.value === Number(current));
	return options[(index + 1) % options.length]?.value ?? field.defaultValue;
}

export function instrumentMacroEnumOption(
	field: InstrumentMacroField,
	value: InstrumentMacroValue
) {
	return field.enumValues?.find((option) => option.value === Number(value));
}

export function instrumentMacroEnumLabel(
	field: InstrumentMacroField,
	value: InstrumentMacroValue
): string {
	return instrumentMacroEnumOption(field, value)?.label ?? '';
}

export function instrumentMacroEnumIsActive(
	field: InstrumentMacroField,
	value: InstrumentMacroValue
): boolean {
	return Number(value) !== Number(field.defaultValue);
}

export function formatInstrumentMacroValue(
	field: InstrumentMacroField,
	value: InstrumentMacroValue,
	asHex: boolean
): string {
	if (field.kind === 'boolean') return value ? 'On' : 'Off';
	if (field.kind === 'enum') return instrumentMacroEnumLabel(field, value) || 'Off';
	if (field.kind === 'waveform') {
		try {
			const steps = JSON.parse(String(value));
			if (Array.isArray(steps)) return steps.map((s: number) => formatRowEditorNumber(s, asHex)).join(' ');
		} catch {}
		return 'Click to edit';
	}
	return formatRowEditorNumber(Number(value), asHex);
}

export function integerMacroBarStyle(
	field: InstrumentMacroField,
	value: InstrumentMacroValue,
	accent: string
): string {
	const normalized = Math.max(0, Math.min(1, macroValueToNormalized(value, field)));
	const signed =
		field.min !== undefined && field.max !== undefined && field.min < 0 && field.max > 0;
	const range = `100% - ${MACRO_BAR_INSET * 2}px`;
	if (!signed) {
		return `bottom: ${MACRO_BAR_INSET}px; left: 2px; right: 2px; height: calc((${range}) * ${normalized}); background: ${accent}`;
	}
	const zero = Math.max(0, Math.min(1, macroValueToNormalized(0, field)));
	const bottomNorm = Math.min(normalized, zero);
	const heightNorm = Math.max(Math.abs(normalized - zero), 0.01);
	return `bottom: calc(${MACRO_BAR_INSET}px + (${range}) * ${bottomNorm}); left: 2px; right: 2px; height: calc((${range}) * ${heightNorm}); background: ${accent}`;
}

export function applyMacroLoopKey(
	event: KeyboardEvent,
	loopIndex: number,
	maxIndex: number
): number | null {
	if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
		event.preventDefault();
		return loopIndex - 1;
	}
	if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
		event.preventDefault();
		return loopIndex + 1;
	}
	if (event.key === 'Home') {
		event.preventDefault();
		return 0;
	}
	if (event.key === 'End') {
		event.preventDefault();
		return maxIndex;
	}
	return null;
}

export function applyMacroLengthKey(event: KeyboardEvent, length: number): number | null {
	if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
		event.preventDefault();
		return length - 1;
	}
	if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
		event.preventDefault();
		return length + 1;
	}
	return null;
}

export function scrollMacroHandleIntoView(
	scroller: HTMLElement | null,
	handle: HTMLElement | null,
	previousLength: number | null,
	length: number
): void {
	if (previousLength === null || previousLength === length || !scroller || !handle) return;
	const scrollerRect = scroller.getBoundingClientRect();
	const handleRect = handle.getBoundingClientRect();
	const margin = 12;
	if (handleRect.right > scrollerRect.right - margin) {
		scroller.scrollLeft += handleRect.right - scrollerRect.right + margin;
	} else if (handleRect.left < scrollerRect.left + margin) {
		scroller.scrollLeft -= scrollerRect.left + margin - handleRect.left;
	}
}

export { INSTRUMENT_MACRO_MAX_LENGTH, INSTRUMENT_MACRO_MIN_LENGTH };
