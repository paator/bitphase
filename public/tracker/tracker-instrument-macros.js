export const INSTRUMENT_MACRO_MAX_LENGTH = 512;

export function clampInstrumentMacroLoop(loop, length) {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(loop | 0, length - 1));
}

export function sampleInstrumentMacroIndex(tick, length, loop) {
	const len = length > 0 ? length : 1;
	const t = tick | 0;
	if (t < 0) return 0;
	if (t < len) return t;
	const start = loop > 0 && loop < len ? loop : 0;
	const span = len - start;
	if (span <= 0) return len - 1;
	return start + ((t - len) % span);
}

function clampBoolean(value, fallback) {
	if (value === undefined) return Boolean(fallback);
	return Boolean(value);
}

function clampInteger(value, min, max, fallback) {
	const parsed = Number(value);
	const numeric = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
	return Math.max(min, Math.min(max, numeric));
}

const AY_AMPLITUDE_SLIDE_OFF = 0;
const AY_AMPLITUDE_SLIDE_UP = 1;
const AY_AMPLITUDE_SLIDE_DOWN = -1;
const AY_FM_OFFSET_SEMITONE = 0;
const AY_FM_OFFSET_PERIOD = 1;

const DEFAULT_AY_TIMER_WAVEFORM = [15, 0];
const DEFAULT_AY_FM_WAVEFORM = [0, 7];

function decodeTimerWaveformPayload(encoded, fallback) {
	const defaultSteps = fallback && fallback.length > 0 ? fallback : DEFAULT_AY_TIMER_WAVEFORM;
	if (!encoded) return { steps: [...defaultSteps], loop: 0 };
	try {
		const parsed = JSON.parse(encoded);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return { steps: parsed, loop: 0 };
		}
		if (parsed && typeof parsed === 'object' && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
			const length = parsed.steps.length;
			const loop = Math.max(0, Math.min(parsed.loop | 0, length - 1));
			return { steps: parsed.steps, loop };
		}
	} catch {}
	return { steps: [...defaultSteps], loop: 0 };
}

function decodeTimerWaveform(encoded) {
	return decodeTimerWaveformPayload(encoded).steps;
}

const AY_MIXER_FIELDS = [
	{ id: 'volume', kind: 'integer', min: 0, max: 15, defaultValue: 15 },
	{ id: 'tone', kind: 'boolean', defaultValue: true },
	{ id: 'noise', kind: 'boolean', defaultValue: false },
	{ id: 'envelope', kind: 'boolean', defaultValue: false },
	{ id: 'retriggerEnvelope', kind: 'boolean', defaultValue: false },
	{ id: 'toneAdd', kind: 'integer', min: -4096, max: 4095, defaultValue: 0 },
	{ id: 'toneAccumulation', kind: 'boolean', defaultValue: false },
	{ id: 'noiseAdd', kind: 'integer', min: -4096, max: 4095, defaultValue: 0 },
	{ id: 'noiseAccumulation', kind: 'boolean', defaultValue: false },
	{ id: 'envelopeAdd', kind: 'integer', min: -4096, max: 4095, defaultValue: 0 },
	{ id: 'envelopeAccumulation', kind: 'boolean', defaultValue: false },
	{ id: 'amplitudeSlide', kind: 'enum', min: AY_AMPLITUDE_SLIDE_DOWN, max: AY_AMPLITUDE_SLIDE_UP, defaultValue: AY_AMPLITUDE_SLIDE_OFF }
];

const AY_TIMER_FIELDS = [
	{
		id: 'sid',
		kind: 'boolean',
		defaultValue: false,
		toRow: (value, row) => {
			row.sid = Boolean(value);
		}
	},
	{
		id: 'syncbuzzer',
		kind: 'boolean',
		defaultValue: false,
		toRow: (value, row) => {
			row.syncbuzzer = Boolean(value);
		}
	},
	{
		id: 'fm',
		kind: 'boolean',
		defaultValue: false,
		toRow: (value, row) => {
			row.fm = Boolean(value);
		}
	},
	{
		id: 'fmOffsetMode',
		kind: 'enum',
		min: AY_FM_OFFSET_SEMITONE,
		max: AY_FM_OFFSET_PERIOD,
		defaultValue: AY_FM_OFFSET_SEMITONE,
		toRow: (value, row) => {
			row.fmOffsetMode = Number(value) === AY_FM_OFFSET_PERIOD ? 'period' : 'semitone';
		}
	},
	{
		id: 'fmWaveform',
		kind: 'waveform',
		defaultValue: JSON.stringify(DEFAULT_AY_FM_WAVEFORM),
		toRow: (value, row) => {
			const payload = decodeTimerWaveformPayload(String(value), DEFAULT_AY_FM_WAVEFORM);
			row.fmWaveform = payload.steps;
			row.fmWaveformLoop = payload.loop;
		}
	},
	{
		id: 'envFm',
		kind: 'boolean',
		defaultValue: false,
		toRow: (value, row) => {
			row.envFm = Boolean(value);
		}
	},
	{
		id: 'envFmOffsetMode',
		kind: 'enum',
		min: AY_FM_OFFSET_SEMITONE,
		max: AY_FM_OFFSET_PERIOD,
		defaultValue: AY_FM_OFFSET_SEMITONE,
		toRow: (value, row) => {
			row.envFmOffsetMode = Number(value) === AY_FM_OFFSET_PERIOD ? 'period' : 'semitone';
		}
	},
	{
		id: 'envFmWaveform',
		kind: 'waveform',
		defaultValue: JSON.stringify(DEFAULT_AY_FM_WAVEFORM),
		toRow: (value, row) => {
			const payload = decodeTimerWaveformPayload(String(value), DEFAULT_AY_FM_WAVEFORM);
			row.envFmWaveform = payload.steps;
			row.envFmWaveformLoop = payload.loop;
		}
	},
	{
		id: 'timerWaveform',
		kind: 'waveform',
		defaultValue: JSON.stringify(DEFAULT_AY_TIMER_WAVEFORM),
		toRow: (value, row) => {
			const payload = decodeTimerWaveformPayload(String(value), DEFAULT_AY_TIMER_WAVEFORM);
			row.timerWaveform = payload.steps;
			row.timerWaveformLoop = payload.loop;
		}
	},
	{
		id: 'semitone',
		kind: 'integer',
		min: -127,
		max: 128,
		defaultValue: 0,
		toRow: (value, row) => {
			row.semitone = Number(value);
		}
	},
	{
		id: 'detune',
		kind: 'integer',
		min: -4095,
		max: 4095,
		defaultValue: 1,
		toRow: (value, row) => {
			row.detune = Number(value);
		}
	}
];

const NES_APU_FIELDS = [
	{ id: 'volumeOrRate', kind: 'integer', min: 0, max: 15, defaultValue: 15 },
	{ id: 'envelope', kind: 'boolean', defaultValue: false },
	{ id: 'retrigger', kind: 'boolean', defaultValue: false },
	{ id: 'pulseWidth', kind: 'integer', min: 0, max: 3, defaultValue: 2 },
	{ id: 'toneAdd', kind: 'integer', min: -4096, max: 4095, defaultValue: 0 },
	{ id: 'toneAccumulation', kind: 'boolean', defaultValue: false },
	{ id: 'sweep', kind: 'boolean', defaultValue: false },
	{ id: 'sweepRate', kind: 'integer', min: 0, max: 7, defaultValue: 0 },
	{ id: 'sweepShift', kind: 'integer', min: -7, max: 7, defaultValue: 0 },
	{ id: 'soundLength', kind: 'integer', min: 0, max: 511, defaultValue: 0 }
];

function readField(row, field) {
	if (field.id === 'amplitudeSlide') {
		if (!row?.amplitudeSliding) return AY_AMPLITUDE_SLIDE_OFF;
		return row.amplitudeSlideUp ? AY_AMPLITUDE_SLIDE_UP : AY_AMPLITUDE_SLIDE_DOWN;
	}
	return clampFieldValue(row?.[field.id], field);
}

function writeField(row, field, value) {
	if (field.toRow) {
		field.toRow(clampFieldValue(value, field), row);
		return;
	}
	if (field.id === 'amplitudeSlide') {
		row.amplitudeSliding = value !== AY_AMPLITUDE_SLIDE_OFF;
		row.amplitudeSlideUp = value === AY_AMPLITUDE_SLIDE_UP;
		return;
	}
	row[field.id] = clampFieldValue(value, field);
}

function clampFieldValue(value, field) {
	if (field.kind === 'boolean') {
		return clampBoolean(value, field.defaultValue);
	}
	if (field.kind === 'waveform') {
		return typeof value === 'string' ? value : String(value ?? field.defaultValue);
	}
	if (field.id === 'amplitudeSlide') {
		if (value === AY_AMPLITUDE_SLIDE_UP || value === AY_AMPLITUDE_SLIDE_DOWN) return value;
		return AY_AMPLITUDE_SLIDE_OFF;
	}
	if (field.kind === 'enum') {
		return clampInteger(
			value,
			field.min ?? Number.MIN_SAFE_INTEGER,
			field.max ?? Number.MAX_SAFE_INTEGER,
			field.defaultValue
		);
	}
	return clampInteger(value, field.min, field.max, field.defaultValue);
}

function createDefaultRow(fields) {
	const row = {};
	for (const field of fields) {
		writeField(row, field, field.defaultValue);
	}
	return row;
}

function hasKnownMacros(macros, fields) {
	if (!macros || typeof macros !== 'object') return false;
	return fields.some((field) => macros[field.id] != null);
}

function normalizeMacro(macro, field) {
	const sourceValues = Array.isArray(macro?.values) ? macro.values : [];
	const values =
		sourceValues.length > 0
			? sourceValues
					.slice(0, INSTRUMENT_MACRO_MAX_LENGTH)
					.map((value) => clampFieldValue(value, field))
			: [field.defaultValue];
	return {
		values,
		loop: clampInstrumentMacroLoop(macro?.loop ?? 0, values.length)
	};
}

function createDefaultMacros(fields) {
	const macros = {};
	for (const field of fields) {
		macros[field.id] = normalizeMacro(undefined, field);
	}
	return macros;
}

function resolveMacros(instrument, fields) {
	const stored = instrument?.macros;
	if (hasKnownMacros(stored, fields)) {
		const resolved = {};
		for (const field of fields) {
			resolved[field.id] = normalizeMacro(stored[field.id], field);
		}
		return resolved;
	}
	return createDefaultMacros(fields);
}

function resolveTimerMacros(instrument) {
	const stored = instrument?.timerMacros;
	if (hasKnownMacros(stored, AY_TIMER_FIELDS)) {
		const resolved = {};
		for (const field of AY_TIMER_FIELDS) {
			resolved[field.id] = normalizeMacro(stored[field.id], field);
		}
		return resolved;
	}
	return createDefaultMacros(AY_TIMER_FIELDS);
}

function sampleRow(macros, tick, fields) {
	const row = createDefaultRow(fields);
	for (const field of fields) {
		const macro = macros[field.id];
		const values = macro?.values ?? [field.defaultValue];
		const index = sampleInstrumentMacroIndex(tick, values.length, macro?.loop ?? 0);
		writeField(row, field, values[index] ?? field.defaultValue);
	}
	return row;
}

function resolveSidSyncbuzzerExclusive(row) {
	if (row.sid && row.syncbuzzer) {
		return { ...row, syncbuzzer: false };
	}
	if (row.sid) {
		return { ...row, syncbuzzer: false };
	}
	if (row.syncbuzzer) {
		return { ...row, sid: false };
	}
	return row;
}

export function resolveAyMixerMacros(instrument) {
	return resolveMacros(instrument, AY_MIXER_FIELDS);
}

export function resolveAyTimerMacros(instrument) {
	return resolveTimerMacros(instrument);
}

export function sampleAyMixerRow(instrument, tick) {
	return sampleRow(resolveAyMixerMacros(instrument), tick, AY_MIXER_FIELDS);
}

export function sampleAyTimerRow(instrument, tick) {
	return resolveSidSyncbuzzerExclusive(sampleRow(resolveAyTimerMacros(instrument), tick, AY_TIMER_FIELDS));
}

export function resolveNesApuMacros(instrument) {
	return resolveMacros(instrument, NES_APU_FIELDS);
}

export function sampleNesApuRow(instrument, tick) {
	return sampleRow(resolveNesApuMacros(instrument), tick, NES_APU_FIELDS);
}
