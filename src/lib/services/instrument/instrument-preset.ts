import { Instrument } from '../../models/song';
import { migrateLegacyInstrument, type LegacyInstrument } from '../instrument/instrument-legacy-migration';

type InstrumentMacroBag = Record<string, { values: (boolean | number | string)[]; loop: number }>;

export type InstrumentPresetPayload = {
	chipType?: string;
	rows?: Record<string, unknown>[];
	loop?: number;
	name: string;
	macros?: InstrumentMacroBag;
	timerMacros?: InstrumentMacroBag;
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
	timerPwmPreserveOnNewNote?: boolean;
	timerPwmSweepStartPhase?: number;
	timerPwmSweepShape?: string;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLoopEnabled?: boolean;
};

type PresetInstrument = Instrument & {
	timerMacros?: InstrumentMacroBag;
	timerPwmDuty?: number;
	timerPwmSweepMin?: number;
	timerPwmSweep?: number;
	timerPwmPreserveOnNewNote?: boolean;
	timerPwmSweepStartPhase?: number;
	timerPwmSweepShape?: string;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopStart?: number;
	sampleLoopEnabled?: boolean;
};

function cloneMacros(macros: InstrumentMacroBag): InstrumentMacroBag {
	return Object.fromEntries(
		Object.entries(macros).map(([id, macro]) => [
			id,
			{ values: [...macro.values], loop: macro.loop }
		])
	);
}

export function serializeInstrumentPreset(instrument: Instrument): InstrumentPresetPayload {
	const extra = instrument as PresetInstrument;
	return {
		chipType: instrument.chipType,
		name: instrument.name,
		...(instrument.macros ? { macros: cloneMacros(instrument.macros) } : {}),
		...(extra.timerMacros ? { timerMacros: cloneMacros(extra.timerMacros) } : {}),
		...(extra.timerPwmDuty !== undefined ? { timerPwmDuty: extra.timerPwmDuty } : {}),
		...(extra.timerPwmSweepMin !== undefined ? { timerPwmSweepMin: extra.timerPwmSweepMin } : {}),
		...(extra.timerPwmSweep !== undefined ? { timerPwmSweep: extra.timerPwmSweep } : {}),
		...(extra.timerPwmPreserveOnNewNote !== undefined
			? { timerPwmPreserveOnNewNote: extra.timerPwmPreserveOnNewNote }
			: {}),
		...(extra.timerPwmSweepStartPhase !== undefined
			? { timerPwmSweepStartPhase: extra.timerPwmSweepStartPhase }
			: {}),
		...(extra.timerPwmSweepShape !== undefined ? { timerPwmSweepShape: extra.timerPwmSweepShape } : {}),
		...(extra.sampleData?.length ? { sampleData: extra.sampleData.map((value) => value & 0xff) } : {}),
		...(extra.sampleRate !== undefined ? { sampleRate: extra.sampleRate } : {}),
		...(extra.sampleStart !== undefined ? { sampleStart: extra.sampleStart } : {}),
		...(extra.sampleEnd !== undefined ? { sampleEnd: extra.sampleEnd } : {}),
		...(extra.sampleLoopStart !== undefined ? { sampleLoopStart: extra.sampleLoopStart } : {}),
		...(extra.sampleLoopEnabled !== undefined ? { sampleLoopEnabled: extra.sampleLoopEnabled } : {})
	};
}

export function parseInstrumentPreset(parsed: unknown): InstrumentPresetPayload | null {
	const item = Array.isArray(parsed) ? parsed[0] : parsed;
	if (item == null || typeof item !== 'object') return null;

	const record = item as Record<string, unknown>;
	const macros = parseInstrumentMacros(record.macros);
	const timerMacros = parseTimerMacros(record.timerMacros);
	const rows = Array.isArray(record.rows) ? (record.rows as Record<string, unknown>[]) : undefined;
	const sampleData = parseSampleData(record.sampleData);
	const pwm = parsePwmFields(record);
	const sample = parseSampleFields(record, sampleData);
	if (!rows && !macros && !timerMacros && !sampleData && Object.keys(pwm).length === 0) return null;

	return {
		...(typeof record.chipType === 'string' ? { chipType: record.chipType } : {}),
		...(rows ? { rows } : {}),
		loop: typeof record.loop === 'number' ? record.loop : 0,
		name: record.name != null ? String(record.name) : '',
		...(macros ? { macros } : {}),
		...(timerMacros ? { timerMacros } : {}),
		...pwm,
		...sample
	};
}

function parseInstrumentMacros(
	value: unknown
): Record<string, { values: (boolean | number)[]; loop: number }> | undefined {
	if (value == null || typeof value !== 'object') return undefined;
	const macros: Record<string, { values: (boolean | number)[]; loop: number }> = {};
	for (const [id, macro] of Object.entries(value as Record<string, unknown>)) {
		if (!macro || typeof macro !== 'object') continue;
		const record = macro as { values?: unknown; loop?: unknown };
		if (!Array.isArray(record.values)) continue;
		macros[id] = {
			values: record.values.map((entry) =>
				typeof entry === 'boolean' || typeof entry === 'number' ? entry : 0
			),
			loop: typeof record.loop === 'number' ? record.loop : 0
		};
	}
	return Object.keys(macros).length > 0 ? macros : undefined;
}

function parseTimerMacros(value: unknown): InstrumentMacroBag | undefined {
	if (value == null || typeof value !== 'object') return undefined;
	const macros: InstrumentMacroBag = {};
	for (const [id, macro] of Object.entries(value as Record<string, unknown>)) {
		if (!macro || typeof macro !== 'object') continue;
		const record = macro as { values?: unknown; loop?: unknown };
		if (!Array.isArray(record.values)) continue;
		macros[id] = {
			values: record.values.map((entry) =>
				typeof entry === 'boolean' || typeof entry === 'number' || typeof entry === 'string'
					? entry
					: 0
			),
			loop: typeof record.loop === 'number' ? record.loop : 0
		};
	}
	return Object.keys(macros).length > 0 ? macros : undefined;
}

function parseSampleData(value: unknown): number[] | undefined {
	if (!Array.isArray(value) || value.length === 0) return undefined;
	return value.map((entry) => (typeof entry === 'number' ? entry & 0xff : 0));
}

function parsePwmFields(record: Record<string, unknown>): Partial<InstrumentPresetPayload> {
	const pwm: Partial<InstrumentPresetPayload> = {};
	if (typeof record.timerPwmDuty === 'number') pwm.timerPwmDuty = record.timerPwmDuty;
	if (typeof record.timerPwmSweepMin === 'number') pwm.timerPwmSweepMin = record.timerPwmSweepMin;
	if (typeof record.timerPwmSweep === 'number') pwm.timerPwmSweep = record.timerPwmSweep;
	if (typeof record.timerPwmPreserveOnNewNote === 'boolean') {
		pwm.timerPwmPreserveOnNewNote = record.timerPwmPreserveOnNewNote;
	}
	if (typeof record.timerPwmSweepStartPhase === 'number') {
		pwm.timerPwmSweepStartPhase = record.timerPwmSweepStartPhase;
	}
	if (typeof record.timerPwmSweepShape === 'string') {
		pwm.timerPwmSweepShape = record.timerPwmSweepShape;
	}
	return pwm;
}

function parseSampleFields(
	record: Record<string, unknown>,
	sampleData: number[] | undefined
): Partial<InstrumentPresetPayload> {
	const sample: Partial<InstrumentPresetPayload> = {};
	if (sampleData) sample.sampleData = sampleData;
	if (typeof record.sampleRate === 'number') sample.sampleRate = record.sampleRate;
	if (typeof record.sampleStart === 'number') sample.sampleStart = record.sampleStart;
	if (typeof record.sampleEnd === 'number') sample.sampleEnd = record.sampleEnd;
	if (typeof record.sampleLoopStart === 'number') sample.sampleLoopStart = record.sampleLoopStart;
	if (typeof record.sampleLoopEnabled === 'boolean') {
		sample.sampleLoopEnabled = record.sampleLoopEnabled;
	}
	return sample;
}

export function instrumentFromPreset(
	payload: InstrumentPresetPayload,
	id: string,
	chipType: string
): Instrument {
	const instrument = new Instrument(id, payload.name, chipType);
	if (payload.macros) {
		instrument.macros = Object.fromEntries(
			Object.entries(payload.macros).map(([macroId, macro]) => [
				macroId,
				{ values: [...macro.values], loop: macro.loop }
			])
		);
	}
	const extras: Partial<LegacyInstrument> & Record<string, unknown> = {};
	if (payload.rows) extras.rows = payload.rows.map((row) => ({ ...row }));
	if (payload.loop !== undefined) extras.loop = payload.loop;
	if (chipType === 'ay' && payload.timerMacros) {
		extras.timerMacros = cloneMacros(payload.timerMacros);
	}
	if (chipType === 'ay') {
		if (payload.timerPwmDuty !== undefined) extras.timerPwmDuty = payload.timerPwmDuty;
		if (payload.timerPwmSweepMin !== undefined) extras.timerPwmSweepMin = payload.timerPwmSweepMin;
		if (payload.timerPwmSweep !== undefined) extras.timerPwmSweep = payload.timerPwmSweep;
		if (payload.timerPwmPreserveOnNewNote !== undefined) {
			extras.timerPwmPreserveOnNewNote = payload.timerPwmPreserveOnNewNote;
		}
		if (payload.timerPwmSweepStartPhase !== undefined) {
			extras.timerPwmSweepStartPhase = payload.timerPwmSweepStartPhase;
		}
		if (payload.timerPwmSweepShape !== undefined) {
			extras.timerPwmSweepShape = payload.timerPwmSweepShape;
		}
	}
	if (payload.sampleData) extras.sampleData = [...payload.sampleData];
	if (payload.sampleRate !== undefined) extras.sampleRate = payload.sampleRate;
	if (payload.sampleStart !== undefined) extras.sampleStart = payload.sampleStart;
	if (payload.sampleEnd !== undefined) extras.sampleEnd = payload.sampleEnd;
	if (payload.sampleLoopStart !== undefined) extras.sampleLoopStart = payload.sampleLoopStart;
	if (payload.sampleLoopEnabled !== undefined) extras.sampleLoopEnabled = payload.sampleLoopEnabled;
	return migrateLegacyInstrument({ ...instrument, ...extras });
}

export function applyInstrumentPreset(
	instruments: Instrument[],
	payload: InstrumentPresetPayload,
	id: string,
	chipType: string
): Instrument[] | null {
	const index = instruments.findIndex((instrument) => instrument.id === id);
	if (index < 0) return null;

	const updated = [...instruments];
	updated[index] = instrumentFromPreset(payload, id, chipType);
	return updated;
}
