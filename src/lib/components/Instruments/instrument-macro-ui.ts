import {
	clampInstrumentMacroLength,
	clampInstrumentMacroLoop,
	clampInstrumentMacroRelease,
	clampMacroValue,
	INSTRUMENT_MACRO_MAX_LENGTH,
	INSTRUMENT_MACRO_MIN_LENGTH,
	INSTRUMENT_MACRO_NO_RELEASE,
	setSharedSequenceLength,
	setSharedSequenceLoop,
	setSharedSequenceRelease,
	type InstrumentMacroField,
	type InstrumentMacroValue,
	type InstrumentMacros
} from '../../chips/base/instrument-macros';
import { formatRowEditorNumber, parseRowEditorNumericText } from '../../utils/row-editor-numeric';

export const MACRO_LOOP_HANDLE_WIDTH = 12;
export const MACRO_LENGTH_HANDLE_WIDTH = 16;
export const MACRO_BAR_INSET = 3;
export const MACRO_BAR_VISIBLE_SPAN = 128;
export const MACRO_BAR_SCALE_MIN_THUMB_PX = 8;
export const MACRO_BAR_SCALE_CENTER_SNAP_PX = 8;
export const MACRO_BAR_SCALE_CENTER_HOLD_PX = 14;
export const MACRO_BAR_SCALE_CENTER_HOLD_MOVES = 2;

export type ParsedMacroSequenceText = {
	values: InstrumentMacroValue[];
	loop: number;
	release: number;
};

export function macroStepWidthPx(isExpanded: boolean): number {
	return isExpanded ? 36 : 30;
}

export function macroIconClass(isExpanded: boolean): string {
	return isExpanded ? 'h-3.5 w-3.5' : 'h-3 w-3';
}

export function instrumentMacroUsesBarChart(field: InstrumentMacroField): boolean {
	return field.kind === 'integer' || Boolean(field.enumValues?.some((option) => option.bar));
}

export function instrumentMacroUsesSquareSteps(field: InstrumentMacroField): boolean {
	if (field.kind === 'boolean') return true;
	return field.kind === 'enum' && !instrumentMacroUsesBarChart(field);
}

export function macroFieldRowHeight(field: InstrumentMacroField, isExpanded: boolean): number {
	if (instrumentMacroUsesBarChart(field)) return isExpanded ? 168 : 140;
	if (instrumentMacroUsesSquareSteps(field)) return isExpanded ? 36 : 30;
	if (field.kind === 'waveform') return isExpanded ? 48 : 38;
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
			if (Array.isArray(steps))
				return steps.map((s: number) => formatRowEditorNumber(s, asHex)).join(' ');
		} catch {}
		return 'Click to edit';
	}
	return formatRowEditorNumber(Number(value), asHex);
}

export function macroBarNumericRange(field: InstrumentMacroField): { min: number; max: number } {
	return {
		min: field.min ?? 0,
		max: field.max ?? 1
	};
}

export function macroBarVisibleSpan(field: InstrumentMacroField): number {
	const { min, max } = macroBarNumericRange(field);
	const range = max - min;
	if (range <= 0) return 1;
	return Math.min(MACRO_BAR_VISIBLE_SPAN, range);
}

export function macroBarNeedsScroll(field: InstrumentMacroField): boolean {
	if (!instrumentMacroUsesBarChart(field)) return false;
	const { min, max } = macroBarNumericRange(field);
	return max - min > MACRO_BAR_VISIBLE_SPAN;
}

export function clampMacroBarViewMin(field: InstrumentMacroField, viewMin: number): number {
	const { min, max } = macroBarNumericRange(field);
	const span = macroBarVisibleSpan(field);
	return Math.max(min, Math.min(max - span, Math.round(viewMin)));
}

export function defaultMacroBarViewMin(field: InstrumentMacroField): number {
	const { min, max } = macroBarNumericRange(field);
	const span = macroBarVisibleSpan(field);
	if (min < 0 && max > 0) {
		return clampMacroBarViewMin(field, -Math.floor(span / 2));
	}
	return min;
}

export function macroBarViewMinForValues(
	field: InstrumentMacroField,
	values: readonly InstrumentMacroValue[]
): number {
	const fallback = defaultMacroBarViewMin(field);
	if (!macroBarNeedsScroll(field) || values.length === 0) return fallback;
	const span = macroBarVisibleSpan(field);
	const nums = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
	if (nums.length === 0) return fallback;
	const lo = Math.min(...nums);
	const hi = Math.max(...nums);
	if (lo >= fallback && hi <= fallback + span) return fallback;
	return clampMacroBarViewMin(field, (lo + hi) / 2 - span / 2);
}

export function macroBarViewStep(field: InstrumentMacroField): number {
	return Math.max(1, Math.round(macroBarVisibleSpan(field) / 16));
}

export function integerFromMacroBarNormalized(
	field: InstrumentMacroField,
	normalized: number,
	viewMin: number
): InstrumentMacroValue {
	const span = macroBarVisibleSpan(field);
	const clamped = Math.max(0, Math.min(1, normalized));
	return clampMacroValue(Math.round(viewMin + clamped * span), field);
}

export function macroBarZeroNormalized(
	field: InstrumentMacroField,
	viewMin: number
): number | null {
	if (field.min === undefined || field.max === undefined || field.min >= 0 || field.max <= 0) {
		return null;
	}
	const span = macroBarVisibleSpan(field);
	const zero = (0 - viewMin) / span;
	if (zero < 0 || zero > 1) return null;
	return zero;
}

export function macroBarViewMinFromTrackY(
	field: InstrumentMacroField,
	normalizedFromTop: number
): number {
	const span = macroBarVisibleSpan(field);
	const { min, max } = macroBarNumericRange(field);
	const scrollable = Math.max(0, max - min - span);
	const t = Math.max(0, Math.min(1, normalizedFromTop));
	return clampMacroBarViewMin(field, min + (1 - t) * scrollable);
}

export function macroBarScaleThumbRatio(field: InstrumentMacroField): number {
	const span = macroBarVisibleSpan(field);
	const { min, max } = macroBarNumericRange(field);
	return span / Math.max(span, max - min);
}

export function macroBarScaleThumbT(field: InstrumentMacroField, viewMin: number): number {
	const span = macroBarVisibleSpan(field);
	const { min, max } = macroBarNumericRange(field);
	const scrollable = Math.max(0, max - min - span);
	if (scrollable <= 0) return 0;
	return (clampMacroBarViewMin(field, viewMin) - min) / scrollable;
}

export function macroBarScaleThumbLayout(
	field: InstrumentMacroField,
	viewMin: number,
	trackHeight: number,
	minThumbPx = MACRO_BAR_SCALE_MIN_THUMB_PX
): { top: number; height: number } {
	const height = Math.min(
		trackHeight,
		Math.max(minThumbPx, macroBarScaleThumbRatio(field) * trackHeight)
	);
	const top = (1 - macroBarScaleThumbT(field, viewMin)) * (trackHeight - height);
	return { top, height };
}

export function macroBarScaleCenterViewMin(field: InstrumentMacroField): number {
	const { min, max } = macroBarNumericRange(field);
	const span = macroBarVisibleSpan(field);
	if (min < 0 && max > 0) return defaultMacroBarViewMin(field);
	return clampMacroBarViewMin(field, (min + max - span) / 2);
}

export function macroBarScaleCenterT(field: InstrumentMacroField): number {
	return macroBarScaleThumbT(field, macroBarScaleCenterViewMin(field));
}

export function snapMacroBarViewMinToCenterTick(
	field: InstrumentMacroField,
	viewMin: number,
	pointerY: number,
	trackTop: number,
	trackHeight: number
): number {
	const next = clampMacroBarViewMin(field, viewMin);
	if (
		macroBarScalePointerNearCenter(
			field,
			pointerY,
			trackTop,
			trackHeight,
			MACRO_BAR_SCALE_CENTER_SNAP_PX
		)
	) {
		return macroBarScaleCenterViewMin(field);
	}
	return next;
}

export function macroBarScaleThumbCenterY(
	field: InstrumentMacroField,
	viewMin: number,
	trackTop: number,
	trackHeight: number
): number {
	const layout = macroBarScaleThumbLayout(field, viewMin, trackHeight);
	return trackTop + layout.top + layout.height / 2;
}

export function macroBarScaleCenterPointerY(
	field: InstrumentMacroField,
	trackTop: number,
	trackHeight: number
): number {
	return macroBarScaleThumbCenterY(
		field,
		macroBarScaleCenterViewMin(field),
		trackTop,
		trackHeight
	);
}

export function macroBarScaleThumbNearCenter(
	field: InstrumentMacroField,
	viewMin: number,
	trackHeight: number,
	radiusPx = MACRO_BAR_SCALE_CENTER_SNAP_PX
): boolean {
	const centerY = macroBarScaleThumbCenterY(
		field,
		macroBarScaleCenterViewMin(field),
		0,
		trackHeight
	);
	const thumbY = macroBarScaleThumbCenterY(field, viewMin, 0, trackHeight);
	return Math.abs(thumbY - centerY) <= radiusPx;
}

export function macroBarScaleShouldCatchCenter(
	field: InstrumentMacroField,
	fromViewMin: number,
	nextViewMin: number
): boolean {
	const center = macroBarScaleCenterViewMin(field);
	if (fromViewMin === center) return false;
	const next = clampMacroBarViewMin(field, nextViewMin);
	return (fromViewMin - center) * (next - center) <= 0;
}

export function macroBarScaleShouldHoldCenter(travelPx: number, holdMoves: number): boolean {
	return (
		holdMoves < MACRO_BAR_SCALE_CENTER_HOLD_MOVES || travelPx <= MACRO_BAR_SCALE_CENTER_HOLD_PX
	);
}

export function macroBarScalePointerNearCenter(
	field: InstrumentMacroField,
	pointerY: number,
	trackTop: number,
	trackHeight: number,
	radiusPx: number
): boolean {
	return (
		Math.abs(pointerY - macroBarScaleCenterPointerY(field, trackTop, trackHeight)) <= radiusPx
	);
}

export function macroBarScaleUnitsPerPx(field: InstrumentMacroField, trackHeight: number): number {
	const span = macroBarVisibleSpan(field);
	const { min, max } = macroBarNumericRange(field);
	return Math.max(0, max - min - span) / Math.max(1, trackHeight);
}

export function macroBarViewMinFromDragDelta(
	field: InstrumentMacroField,
	grabViewMin: number,
	grabY: number,
	pointerY: number,
	trackHeight: number
): number {
	return clampMacroBarViewMin(
		field,
		grabViewMin + (grabY - pointerY) * macroBarScaleUnitsPerPx(field, trackHeight)
	);
}

export function macroBarScaleUnsnapFromCenter(
	field: InstrumentMacroField,
	pointerY: number,
	centerY: number
): number {
	const center = macroBarScaleCenterViewMin(field);
	return clampMacroBarViewMin(field, center + (pointerY < centerY ? 1 : -1));
}

export function snapMacroBarViewMinCrossingCenter(
	field: InstrumentMacroField,
	fromViewMin: number,
	viewMin: number
): number {
	const center = macroBarScaleCenterViewMin(field);
	const next = clampMacroBarViewMin(field, viewMin);
	if (fromViewMin === center) return next;
	if ((fromViewMin - center) * (next - center) <= 0) return center;
	return next;
}

export function panMacroBarViewMin(
	field: InstrumentMacroField,
	viewMin: number,
	clientY: number,
	rowTop: number,
	rowBottom: number
): number {
	if (!macroBarNeedsScroll(field)) return viewMin;
	if (clientY < rowTop) return clampMacroBarViewMin(field, viewMin + 1);
	if (clientY > rowBottom) return clampMacroBarViewMin(field, viewMin - 1);
	return viewMin;
}

export type MacroBarOverflow = 'up' | 'down' | null;

export function macroBarOverflowDirection(
	field: InstrumentMacroField,
	value: InstrumentMacroValue,
	viewMin = defaultMacroBarViewMin(field)
): MacroBarOverflow {
	const span = macroBarVisibleSpan(field);
	const n = Number(value);
	const signed =
		field.min !== undefined && field.max !== undefined && field.min < 0 && field.max > 0;
	const valueNorm = (n - viewMin) / span;
	if (!signed) {
		if (valueNorm > 1) return null;
		if (valueNorm <= 0) return n > 0 || viewMin > (field.min ?? 0) ? 'down' : null;
		return null;
	}
	const zeroNorm = (0 - viewMin) / span;
	const bottomNorm = Math.max(0, Math.min(1, Math.min(valueNorm, zeroNorm)));
	const topNorm = Math.max(0, Math.min(1, Math.max(valueNorm, zeroNorm)));
	if (topNorm - bottomNorm > 0 || (valueNorm >= 0 && valueNorm <= 1)) return null;
	return n >= viewMin + span ? 'up' : 'down';
}

export function integerMacroBarStyle(
	field: InstrumentMacroField,
	value: InstrumentMacroValue,
	accent: string,
	viewMin = defaultMacroBarViewMin(field)
): string {
	const span = macroBarVisibleSpan(field);
	const signed =
		field.min !== undefined && field.max !== undefined && field.min < 0 && field.max > 0;
	const range = `100% - ${MACRO_BAR_INSET * 2}px`;
	const valueNorm = (Number(value) - viewMin) / span;
	if (!signed) {
		const heightNorm = Math.max(0, Math.min(1, valueNorm));
		return `bottom: ${MACRO_BAR_INSET}px; left: 2px; right: 2px; height: calc((${range}) * ${heightNorm}); background: ${accent}`;
	}
	const zeroNorm = (0 - viewMin) / span;
	const bottomNorm = Math.max(0, Math.min(1, Math.min(valueNorm, zeroNorm)));
	const topNorm = Math.max(0, Math.min(1, Math.max(valueNorm, zeroNorm)));
	const inView = valueNorm >= 0 && valueNorm <= 1;
	const heightNorm = Math.max(topNorm - bottomNorm, inView ? 0.01 : 0);
	return `bottom: calc(${MACRO_BAR_INSET}px + (${range}) * ${bottomNorm}); left: 2px; right: 2px; height: calc((${range}) * ${heightNorm}); background: ${accent}`;
}

export function instrumentMacroFlagFields(
	fields: readonly InstrumentMacroField[]
): InstrumentMacroField[] {
	if (fields.some((field) => field.kind === 'integer')) return [];
	const flags = fields.filter((field) => field.kind === 'boolean');
	return flags.length > 1 ? flags : [];
}

export function instrumentMacroSequenceTextFields(
	fields: readonly InstrumentMacroField[]
): InstrumentMacroField[] {
	const integers = fields.filter((field) => field.kind === 'integer');
	if (integers.length > 0) return integers;
	if (instrumentMacroFlagFields(fields).length > 1) return [];
	return fields.filter((field) => field.kind === 'boolean');
}

export function instrumentMacroFlagField(flags: readonly InstrumentMacroField[]): InstrumentMacroField {
	return {
		id: 'flags',
		label: 'Flags',
		title: flags.map((field, bit) => `${field.label} ${1 << bit}`).join(', '),
		kind: 'integer',
		min: 0,
		max: flags.length === 0 ? 0 : (1 << flags.length) - 1,
		defaultValue: 0
	};
}

export function instrumentMacroFlagMasks(
	macros: InstrumentMacros,
	flags: readonly InstrumentMacroField[]
): number[] {
	const length = Math.max(
		1,
		...flags.map((field) => macros[field.id]?.values.length ?? 0)
	);
	return Array.from({ length }, (_, index) => {
		let mask = 0;
		flags.forEach((field, bit) => {
			if (macros[field.id]?.values[index]) mask |= 1 << bit;
		});
		return mask;
	});
}

export function applyInstrumentMacroFlagText(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[],
	text: string
): InstrumentMacros | null {
	const flags = instrumentMacroFlagFields(fields);
	if (flags.length === 0) return null;
	const parsed = parseMacroSequenceText(text, instrumentMacroFlagField(flags), false);
	if (!parsed) return null;
	const anchor = macros[flags[0]!.id];
	const masks = instrumentMacroFlagMasks(macros, flags);
	if (
		anchor &&
		instrumentMacroSequenceEquals(
			masks,
			anchor.loop,
			clampInstrumentMacroRelease(anchor.release, masks.length),
			parsed
		)
	) {
		return macros;
	}
	const resized = setSharedSequenceLength(macros, fields, parsed.values.length);
	const withValues: InstrumentMacros = { ...resized };
	for (const [bit, field] of flags.entries()) {
		const current = withValues[field.id];
		if (!current) continue;
		withValues[field.id] = {
			...current,
			values: parsed.values.map((mask) => ((Number(mask) >> bit) & 1) === 1)
		};
	}
	return setSharedSequenceRelease(
		setSharedSequenceLoop(withValues, fields, parsed.loop),
		fields,
		parsed.release
	);
}

export function formatMacroSequenceText(
	values: readonly InstrumentMacroValue[],
	loop: number,
	field: InstrumentMacroField,
	asHex: boolean,
	release: number = INSTRUMENT_MACRO_NO_RELEASE
): string {
	const tokens =
		values.length > 0
			? values.map((value) => formatMacroSequenceToken(value, field, asHex))
			: [formatMacroSequenceToken(field.defaultValue, field, asHex)];
	const loopAt = clampInstrumentMacroLoop(loop, tokens.length);
	const releaseAt = clampInstrumentMacroRelease(release, tokens.length);
	const parts: string[] = [];
	for (let index = 0; index < tokens.length; index++) {
		if (index === loopAt) parts.push('|');
		if (index === releaseAt) parts.push('/');
		parts.push(tokens[index]!);
	}
	return parts.join(' ');
}

function formatMacroSequenceToken(
	value: InstrumentMacroValue,
	field: InstrumentMacroField,
	asHex: boolean
): string {
	if (field.kind === 'boolean') return value ? '1' : '0';
	if (field.kind === 'enum' && field.enumValues?.length) {
		const option = field.enumValues.find((item) => item.value === value);
		if (option?.label) return option.label;
	}
	return formatRowEditorNumber(Number(value), asHex);
}

function parseMacroSequenceToken(
	token: string,
	field: InstrumentMacroField,
	asHex: boolean
): number | null {
	if (field.kind === 'enum' && field.enumValues?.length) {
		const labelMatch = field.enumValues.find(
			(option) =>
				option.label.length > 0 && option.label.toLowerCase() === token.toLowerCase()
		);
		if (labelMatch) return labelMatch.value;
	}
	const parsed = parseRowEditorNumericText(token, asHex, { min: field.min, max: field.max });
	if (parsed === null) return null;
	if (field.kind === 'enum' && field.enumValues?.length) {
		return field.enumValues.some((option) => option.value === parsed) ? parsed : null;
	}
	return parsed;
}

export function parseMacroSequenceText(
	text: string,
	field: InstrumentMacroField,
	asHex: boolean
): ParsedMacroSequenceText | null {
	const tokens = text
		.trim()
		.replace(/[|/]/g, ' $& ')
		.split(/\s+/)
		.filter((token) => token.length > 0);
	if (tokens.length === 0) return null;
	const values: number[] = [];
	let loop: number | null = null;
	let release: number | null = null;
	for (const token of tokens) {
		if (token === '|') {
			if (loop !== null || values.length >= INSTRUMENT_MACRO_MAX_LENGTH) return null;
			loop = values.length;
			continue;
		}
		if (token === '/') {
			if (release !== null || values.length >= INSTRUMENT_MACRO_MAX_LENGTH) return null;
			release = values.length;
			continue;
		}
		const value = parseMacroSequenceToken(token, field, asHex);
		if (value === null) return null;
		values.push(value);
	}
	if (values.length === 0 || (release !== null && release >= values.length)) return null;
	const clampedValues = values
		.slice(0, clampInstrumentMacroLength(values.length))
		.map((value) => clampMacroValue(value, field));
	return {
		values: clampedValues,
		loop: clampInstrumentMacroLoop(loop ?? 0, clampedValues.length),
		release: clampInstrumentMacroRelease(
			release ?? INSTRUMENT_MACRO_NO_RELEASE,
			clampedValues.length
		)
	};
}

export function instrumentMacroSequenceEquals(
	values: readonly InstrumentMacroValue[],
	loop: number,
	release: number,
	parsed: ParsedMacroSequenceText
): boolean {
	if (
		parsed.loop !== loop ||
		parsed.release !== release ||
		parsed.values.length !== values.length
	) {
		return false;
	}
	return parsed.values.every((value, index) => value === values[index]);
}

export function applyInstrumentMacroSequenceText(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[],
	field: InstrumentMacroField,
	text: string,
	asHex: boolean
): InstrumentMacros | null {
	const parsed = parseMacroSequenceText(text, field, asHex);
	if (!parsed) return null;
	const current = macros[field.id];
	if (
		current &&
		instrumentMacroSequenceEquals(
			current.values,
			current.loop,
			clampInstrumentMacroRelease(current.release, current.values.length),
			parsed
		)
	) {
		return macros;
	}
	const resized = setSharedSequenceLength(macros, fields, parsed.values.length);
	const withValues = {
		...resized,
		[field.id]: { values: parsed.values, loop: parsed.loop, release: parsed.release }
	};
	return setSharedSequenceRelease(
		setSharedSequenceLoop(withValues, fields, parsed.loop),
		fields,
		parsed.release
	);
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
