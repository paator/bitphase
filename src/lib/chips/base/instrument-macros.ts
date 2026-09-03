export const INSTRUMENT_MACRO_MAX_LENGTH = 512;
export const INSTRUMENT_MACRO_MIN_LENGTH = 1;

export type InstrumentMacroKind = 'boolean' | 'integer' | 'enum' | 'waveform';

export type InstrumentMacroAccent = 'volume' | 'tone' | 'noise' | 'envelope' | 'effect';

export type InstrumentMacroValue = boolean | number | string;

export type InstrumentMacro = {
	values: InstrumentMacroValue[];
	loop: number;
};

export type InstrumentMacros = Record<string, InstrumentMacro>;

export type InstrumentMacroEnumOption = {
	value: number;
	label: string;
	icon?: 'semitone' | 'period';
	bar?: boolean;
};

export type InstrumentMacroField = {
	id: string;
	label: string;
	title: string;
	kind: InstrumentMacroKind;
	accent?: InstrumentMacroAccent;
	group?: string;
	shareSequence?: boolean;
	min?: number;
	max?: number;
	defaultValue: InstrumentMacroValue;
	enumValues?: InstrumentMacroEnumOption[];
	fromRow?: (row: Record<string, unknown>) => InstrumentMacroValue;
	toRow?: (value: InstrumentMacroValue, row: Record<string, unknown>) => void;
};

export type InstrumentMacroFieldGroup = {
	id: string;
	label: string;
	fields: InstrumentMacroField[];
	shareSequence: boolean;
};

export function groupInstrumentMacroFields(
	fields: readonly InstrumentMacroField[]
): InstrumentMacroFieldGroup[] {
	const groups: InstrumentMacroFieldGroup[] = [];
	const indexById = new Map<string, number>();
	for (const field of fields) {
		const id = field.group ?? field.id;
		const existing = indexById.get(id);
		if (existing === undefined) {
			indexById.set(id, groups.length);
			groups.push({
				id,
				label: field.group ?? field.label,
				fields: [field],
				shareSequence: Boolean(field.shareSequence)
			});
			continue;
		}
		groups[existing]!.fields.push(field);
		groups[existing]!.shareSequence =
			groups[existing]!.shareSequence && Boolean(field.shareSequence);
	}
	return groups;
}

export function instrumentMacroAccentColor(accent?: InstrumentMacroAccent): string {
	if (accent === 'volume') return 'var(--color-pattern-envelope)';
	if (accent === 'noise') return 'var(--color-pattern-note-off)';
	if (accent === 'envelope') return 'var(--color-pattern-instrument)';
	if (accent === 'effect') return 'var(--color-pattern-effect)';
	return 'var(--color-pattern-note)';
}

export function clampInstrumentMacroLoop(loop: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(loop | 0, length - 1));
}

export function clampInstrumentMacroLength(length: number): number {
	return Math.max(INSTRUMENT_MACRO_MIN_LENGTH, Math.min(INSTRUMENT_MACRO_MAX_LENGTH, length | 0));
}

export function sampleInstrumentMacroIndex(tick: number, length: number, loop: number): number {
	const len = length > 0 ? length : 1;
	const t = tick | 0;
	if (t < 0) return 0;
	if (t < len) return t;
	const start = loop > 0 && loop < len ? loop : 0;
	const span = len - start;
	if (span <= 0) return len - 1;
	return start + ((t - len) % span);
}

export function createDefaultInstrumentMacro(field: InstrumentMacroField): InstrumentMacro {
	return {
		values: [cloneMacroValue(field.defaultValue)],
		loop: 0
	};
}

export function normalizeInstrumentMacro(
	macro: InstrumentMacro | undefined,
	field: InstrumentMacroField
): InstrumentMacro {
	const sourceValues = Array.isArray(macro?.values) ? macro.values : [];
	const values =
		sourceValues.length > 0
			? sourceValues
					.slice(0, INSTRUMENT_MACRO_MAX_LENGTH)
					.map((value) => clampMacroValue(value, field))
			: [cloneMacroValue(field.defaultValue)];
	return {
		values,
		loop: clampInstrumentMacroLoop(macro?.loop ?? 0, values.length)
	};
}

export function hasKnownInstrumentMacros(
	macros: InstrumentMacros | undefined,
	fields: readonly InstrumentMacroField[]
): boolean {
	return macros != null && hasKnownMacros(macros, fields);
}

export function createDefaultInstrumentMacros(
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	const macros: InstrumentMacros = {};
	for (const field of fields) {
		macros[field.id] = createDefaultInstrumentMacro(field);
	}
	return alignSharedSequenceMacros(macros, fields);
}

export function resolveInstrumentMacros(
	instrument: { macros?: InstrumentMacros },
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	const stored = instrument.macros;
	if (hasKnownInstrumentMacros(stored, fields)) {
		const resolved: InstrumentMacros = {};
		for (const field of fields) {
			resolved[field.id] = normalizeInstrumentMacro(stored![field.id], field);
		}
		return alignSharedSequenceMacros(resolved, fields);
	}
	return createDefaultInstrumentMacros(fields);
}

export function resolveTimerInstrumentMacros(
	instrument: { timerMacros?: InstrumentMacros },
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	const stored = instrument.timerMacros;
	if (hasKnownInstrumentMacros(stored, fields)) {
		const resolved: InstrumentMacros = {};
		for (const field of fields) {
			resolved[field.id] = normalizeInstrumentMacro(stored![field.id], field);
		}
		return alignSharedSequenceMacros(resolved, fields);
	}
	return createDefaultInstrumentMacros(fields);
}

export function instrumentRowsToMacros(
	rows: Record<string, unknown>[],
	loop: number,
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	const source = rows.length > 0 ? rows : [createDefaultRow(fields)];
	const clampedLoop = clampInstrumentMacroLoop(loop, source.length);
	const macros: InstrumentMacros = {};
	for (const field of fields) {
		macros[field.id] = {
			values: source.map((row) => readMacroField(row, field)),
			loop: clampedLoop
		};
	}
	return macros;
}

export function macrosToInstrumentRows(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[]
): Record<string, unknown>[] {
	const length = Math.max(
		INSTRUMENT_MACRO_MIN_LENGTH,
		...fields.map((field) => macros[field.id]?.values.length ?? 0)
	);
	return Array.from({ length }, (_, index) => {
		const row = createDefaultRow(fields);
		for (const field of fields) {
			const macro = macros[field.id];
			const values = macro?.values ?? [field.defaultValue];
			const value = values[Math.min(index, values.length - 1)] ?? field.defaultValue;
			writeMacroField(row, field, value);
		}
		return row;
	});
}

export function sampleInstrumentRowFromMacros(
	macros: InstrumentMacros,
	tick: number,
	fields: readonly InstrumentMacroField[]
): Record<string, unknown> {
	const row = createDefaultRow(fields);
	for (const field of fields) {
		const macro = macros[field.id];
		const values = macro?.values ?? [field.defaultValue];
		const index = sampleInstrumentMacroIndex(tick, values.length, macro?.loop ?? 0);
		writeMacroField(row, field, values[index] ?? field.defaultValue);
	}
	return row;
}

export function instrumentMacroUpdates(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[]
): { macros: InstrumentMacros } {
	const normalized: InstrumentMacros = {};
	for (const field of fields) {
		normalized[field.id] = normalizeInstrumentMacro(macros[field.id], field);
	}
	return {
		macros: alignSharedSequenceMacros(normalized, fields)
	};
}

export function cloneInstrumentMacros(
	macros: InstrumentMacros | undefined
): InstrumentMacros | undefined {
	if (!macros) return undefined;
	const cloned: InstrumentMacros = {};
	for (const [id, macro] of Object.entries(macros)) {
		cloned[id] = {
			values: [...macro.values],
			loop: macro.loop
		};
	}
	return cloned;
}

export function resizeInstrumentMacro(
	macro: InstrumentMacro,
	field: InstrumentMacroField,
	targetLength: number
): InstrumentMacro {
	const length = clampInstrumentMacroLength(targetLength);
	const values = [...macro.values];
	if (length > values.length) {
		const fill = values[values.length - 1] ?? field.defaultValue;
		while (values.length < length) {
			values.push(cloneMacroValue(fill));
		}
	} else if (length < values.length) {
		values.length = length;
	}
	return {
		values,
		loop: clampInstrumentMacroLoop(macro.loop, values.length)
	};
}

export function setInstrumentMacroValue(
	macro: InstrumentMacro,
	field: InstrumentMacroField,
	index: number,
	value: InstrumentMacroValue
): InstrumentMacro {
	if (index < 0 || index >= macro.values.length) return macro;
	const next = clampMacroValue(value, field);
	if (macro.values[index] === next) return macro;
	const values = [...macro.values];
	values[index] = next;
	return { ...macro, values };
}

export function setInstrumentMacroLoop(macro: InstrumentMacro, index: number): InstrumentMacro {
	return {
		...macro,
		loop: clampInstrumentMacroLoop(index, macro.values.length)
	};
}

export function alignSharedSequenceMacros(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	let next = macros;
	for (const group of groupInstrumentMacroFields(fields)) {
		if (!group.shareSequence) continue;
		next = syncSharedSequenceGroup(next, group.fields);
	}
	return next;
}

export function setSharedSequenceLength(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[],
	length: number
): InstrumentMacros {
	const aligned = syncSharedSequenceGroup(macros, fields);
	const next: InstrumentMacros = { ...aligned };
	for (const field of fields) {
		const current = next[field.id] ?? createDefaultInstrumentMacro(field);
		next[field.id] = resizeInstrumentMacro(current, field, length);
	}
	return syncSharedSequenceGroup(next, fields);
}

export function setSharedSequenceLoop(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[],
	index: number
): InstrumentMacros {
	const aligned = syncSharedSequenceGroup(macros, fields);
	const length = aligned[fields[0]?.id ?? '']?.values.length ?? INSTRUMENT_MACRO_MIN_LENGTH;
	const loop = clampInstrumentMacroLoop(index, length);
	const next: InstrumentMacros = { ...aligned };
	for (const field of fields) {
		const current = next[field.id] ?? createDefaultInstrumentMacro(field);
		next[field.id] = { ...current, loop };
	}
	return next;
}

function syncSharedSequenceGroup(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[]
): InstrumentMacros {
	if (fields.length === 0) return macros;
	let length = INSTRUMENT_MACRO_MIN_LENGTH;
	let loop = 0;
	for (const field of fields) {
		const macro = macros[field.id];
		const len = macro?.values.length ?? 0;
		if (len > length) {
			length = len;
			loop = macro?.loop ?? 0;
		}
	}
	length = clampInstrumentMacroLength(length);
	loop = clampInstrumentMacroLoop(loop, length);
	const next: InstrumentMacros = { ...macros };
	for (const field of fields) {
		const current = normalizeInstrumentMacro(macros[field.id], field);
		const resized = resizeInstrumentMacro(current, field, length);
		next[field.id] = { ...resized, loop };
	}
	return next;
}

export function clampMacroValue(value: unknown, field: InstrumentMacroField): InstrumentMacroValue {
	if (field.kind === 'boolean') {
		return Boolean(value);
	}
	if (field.kind === 'waveform') {
		return typeof value === 'string' ? value : String(value ?? field.defaultValue);
	}
	const parsed = Number(value);
	const numeric = Number.isFinite(parsed) ? Math.round(parsed) : Number(field.defaultValue);
	if (field.kind === 'enum' && field.enumValues?.length) {
		return field.enumValues.some((option) => option.value === numeric)
			? numeric
			: Number(field.defaultValue);
	}
	const min = field.min ?? Number.MIN_SAFE_INTEGER;
	const max = field.max ?? Number.MAX_SAFE_INTEGER;
	return Math.max(min, Math.min(max, numeric));
}

export function macroValueToNormalized(
	value: InstrumentMacroValue,
	field: InstrumentMacroField
): number {
	if (field.kind === 'boolean') {
		return value ? 1 : 0;
	}
	if (field.kind === 'waveform') {
		return 0;
	}
	if (field.kind === 'enum' && field.enumValues?.length) {
		if (field.min !== undefined && field.max !== undefined && field.max > field.min) {
			return (Number(value) - field.min) / (field.max - field.min);
		}
		const index = field.enumValues.findIndex((option) => option.value === value);
		if (index < 0) return 0;
		return field.enumValues.length <= 1 ? 0 : index / (field.enumValues.length - 1);
	}
	const min = field.min ?? 0;
	const max = field.max ?? 1;
	if (max <= min) return 0;
	return (Number(value) - min) / (max - min);
}

export function normalizedToMacroValue(
	normalized: number,
	field: InstrumentMacroField
): InstrumentMacroValue {
	const clamped = Math.max(0, Math.min(1, normalized));
	if (field.kind === 'boolean') {
		return clamped >= 0.5;
	}
	if (field.kind === 'waveform') {
		return String(field.defaultValue);
	}
	if (field.kind === 'enum' && field.enumValues?.length) {
		if (field.min !== undefined && field.max !== undefined && field.max > field.min) {
			return clampMacroValue(
				Math.round(field.min + clamped * (field.max - field.min)),
				field
			);
		}
		const index = Math.round(clamped * (field.enumValues.length - 1));
		return field.enumValues[index]?.value ?? Number(field.defaultValue);
	}
	const min = field.min ?? 0;
	const max = field.max ?? 1;
	return clampMacroValue(Math.round(min + clamped * (max - min)), field);
}

function hasKnownMacros(
	macros: InstrumentMacros,
	fields: readonly InstrumentMacroField[]
): boolean {
	return fields.some((field) => macros[field.id] != null);
}

function readMacroField(
	row: Record<string, unknown>,
	field: InstrumentMacroField
): InstrumentMacroValue {
	if (field.fromRow) {
		return clampMacroValue(field.fromRow(row), field);
	}
	return clampMacroValue(row[field.id], field);
}

function writeMacroField(
	row: Record<string, unknown>,
	field: InstrumentMacroField,
	value: InstrumentMacroValue
): void {
	const clamped = clampMacroValue(value, field);
	if (field.toRow) {
		field.toRow(clamped, row);
		return;
	}
	row[field.id] = clamped;
}

function createDefaultRow(fields: readonly InstrumentMacroField[]): Record<string, unknown> {
	const row: Record<string, unknown> = {};
	for (const field of fields) {
		writeMacroField(row, field, field.defaultValue);
	}
	return row;
}

function cloneMacroValue(value: InstrumentMacroValue): InstrumentMacroValue {
	return value;
}
