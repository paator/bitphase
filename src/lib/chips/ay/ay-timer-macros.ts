import type { InstrumentMacroField } from '../base/instrument-macros';

const DEFAULT_AY_TIMER_WAVEFORM = [15, 0];
const DEFAULT_AY_FM_WAVEFORM = [0, 7];

export const AY_FM_OFFSET_SEMITONE = 0;
export const AY_FM_OFFSET_PERIOD = 1;

function offsetModeToMacro(mode: unknown): number {
	return mode === 'period' ? AY_FM_OFFSET_PERIOD : AY_FM_OFFSET_SEMITONE;
}

function offsetModeFromMacro(value: unknown): 'semitone' | 'period' {
	return Number(value) === AY_FM_OFFSET_PERIOD ? 'period' : 'semitone';
}

export type TimerWaveformPayload = {
	steps: number[];
	loop: number;
};

function clampWaveformLoop(loop: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(loop | 0, length - 1));
}

export function decodeTimerWaveformPayload(
	encoded: string,
	fallback: number[] = DEFAULT_AY_TIMER_WAVEFORM
): TimerWaveformPayload {
	if (!encoded) return { steps: [...fallback], loop: 0 };
	try {
		const parsed = JSON.parse(encoded);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return { steps: parsed, loop: 0 };
		}
		if (parsed && typeof parsed === 'object' && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
			return {
				steps: parsed.steps,
				loop: clampWaveformLoop(Number(parsed.loop ?? 0), parsed.steps.length)
			};
		}
	} catch {}
	return { steps: [...fallback], loop: 0 };
}

export function encodeTimerWaveform(steps: number[], loop = 0): string {
	const values = steps.length > 0 ? steps : DEFAULT_AY_TIMER_WAVEFORM;
	const clampedLoop = clampWaveformLoop(loop, values.length);
	if (clampedLoop === 0) return JSON.stringify(values);
	return JSON.stringify({ steps: values, loop: clampedLoop });
}

export function decodeTimerWaveform(encoded: string): number[] {
	return decodeTimerWaveformPayload(encoded).steps;
}

function writeWaveformRow(
	value: unknown,
	row: Record<string, unknown>,
	stepsKey: string,
	loopKey: string,
	fallback: number[]
): void {
	const payload = decodeTimerWaveformPayload(String(value), fallback);
	row[stepsKey] = payload.steps;
	row[loopKey] = payload.loop;
}

export const AY_TIMER_MACRO_FIELDS: InstrumentMacroField[] = [
	{
		id: 'sid',
		label: 'SID',
		title: 'SID effect (tone × volume). Mutually exclusive with Syncbuzzer.',
		kind: 'boolean',
		accent: 'effect',
		group: 'SID / Syncbuzzer',
		shareSequence: true,
		defaultValue: false,
		fromRow: (row) => Boolean(row['sid']),
		toRow: (value, row) => {
			row['sid'] = Boolean(value);
		}
	},
	{
		id: 'syncbuzzer',
		label: 'Syncbuzzer',
		title: 'Syncbuzzer (rapid envelope shape retrigger). Mutually exclusive with SID.',
		kind: 'boolean',
		accent: 'effect',
		group: 'SID / Syncbuzzer',
		shareSequence: true,
		defaultValue: false,
		fromRow: (row) => Boolean(row['syncbuzzer']),
		toRow: (value, row) => {
			row['syncbuzzer'] = Boolean(value);
		}
	},
	{
		id: 'fm',
		label: 'FM',
		title: 'FM (rapid tone offset switching). Can run together with SID or Syncbuzzer.',
		kind: 'boolean',
		accent: 'tone',
		group: 'FM',
		shareSequence: true,
		defaultValue: false,
		fromRow: (row) => Boolean(row['fm']),
		toRow: (value, row) => {
			row['fm'] = Boolean(value);
		}
	},
	{
		id: 'fmOffsetMode',
		label: 'Offset',
		title: 'FM steps as semitones or raw period offsets. Click to switch.',
		kind: 'enum',
		accent: 'tone',
		group: 'FM',
		shareSequence: true,
		min: AY_FM_OFFSET_SEMITONE,
		max: AY_FM_OFFSET_PERIOD,
		defaultValue: AY_FM_OFFSET_SEMITONE,
		enumValues: [
			{ value: AY_FM_OFFSET_SEMITONE, label: 'Semitone', icon: 'semitone' },
			{ value: AY_FM_OFFSET_PERIOD, label: 'Period', icon: 'period' }
		],
		fromRow: (row) => offsetModeToMacro(row['fmOffsetMode']),
		toRow: (value, row) => {
			row['fmOffsetMode'] = offsetModeFromMacro(value);
		}
	},
	{
		id: 'fmWaveform',
		label: 'FM Steps',
		title: 'FM semitone or period offsets (click to edit)',
		kind: 'waveform',
		accent: 'tone',
		group: 'FM',
		shareSequence: true,
		defaultValue: JSON.stringify(DEFAULT_AY_FM_WAVEFORM),
		fromRow: (row) =>
			encodeTimerWaveform(
				(row['fmWaveform'] as number[]) ?? DEFAULT_AY_FM_WAVEFORM,
				Number(row['fmWaveformLoop'] ?? 0)
			),
		toRow: (value, row) => {
			writeWaveformRow(value, row, 'fmWaveform', 'fmWaveformLoop', DEFAULT_AY_FM_WAVEFORM);
		}
	},
	{
		id: 'envFm',
		label: 'Env FM',
		title: 'Envelope FM (rapid envelope period offset switching). Can run together with SID or Syncbuzzer.',
		kind: 'boolean',
		accent: 'envelope',
		group: 'Env FM',
		shareSequence: true,
		defaultValue: false,
		fromRow: (row) => Boolean(row['envFm']),
		toRow: (value, row) => {
			row['envFm'] = Boolean(value);
		}
	},
	{
		id: 'envFmOffsetMode',
		label: 'Offset',
		title: 'Envelope FM steps as semitones or raw period offsets. Click to switch.',
		kind: 'enum',
		accent: 'envelope',
		group: 'Env FM',
		shareSequence: true,
		min: AY_FM_OFFSET_SEMITONE,
		max: AY_FM_OFFSET_PERIOD,
		defaultValue: AY_FM_OFFSET_SEMITONE,
		enumValues: [
			{ value: AY_FM_OFFSET_SEMITONE, label: 'Semitone', icon: 'semitone' },
			{ value: AY_FM_OFFSET_PERIOD, label: 'Period', icon: 'period' }
		],
		fromRow: (row) => offsetModeToMacro(row['envFmOffsetMode'] ?? row['fmOffsetMode']),
		toRow: (value, row) => {
			row['envFmOffsetMode'] = offsetModeFromMacro(value);
		}
	},
	{
		id: 'envFmWaveform',
		label: 'EFM Steps',
		title: 'Envelope FM semitone or period offsets (click to edit)',
		kind: 'waveform',
		accent: 'envelope',
		group: 'Env FM',
		shareSequence: true,
		defaultValue: JSON.stringify(DEFAULT_AY_FM_WAVEFORM),
		fromRow: (row) =>
			encodeTimerWaveform(
				(row['envFmWaveform'] as number[]) ?? DEFAULT_AY_FM_WAVEFORM,
				Number(row['envFmWaveformLoop'] ?? 0)
			),
		toRow: (value, row) => {
			writeWaveformRow(value, row, 'envFmWaveform', 'envFmWaveformLoop', DEFAULT_AY_FM_WAVEFORM);
		}
	},
	{
		id: 'timerWaveform',
		label: 'Steps',
		title: 'SID / Syncbuzzer waveform steps (click to edit)',
		kind: 'waveform',
		accent: 'effect',
		group: 'SID / Syncbuzzer',
		shareSequence: true,
		defaultValue: JSON.stringify(DEFAULT_AY_TIMER_WAVEFORM),
		fromRow: (row) =>
			encodeTimerWaveform(
				(row['timerWaveform'] as number[]) ?? DEFAULT_AY_TIMER_WAVEFORM,
				Number(row['timerWaveformLoop'] ?? 0)
			),
		toRow: (value, row) => {
			writeWaveformRow(value, row, 'timerWaveform', 'timerWaveformLoop', DEFAULT_AY_TIMER_WAVEFORM);
		}
	},
	{
		id: 'semitone',
		label: 'Semitone Δ',
		title: 'Detune in semitones applied to timer base period (affects all effects)',
		kind: 'integer',
		accent: 'tone',
		min: -127,
		max: 128,
		defaultValue: 0,
		fromRow: (row) => Number(row['semitone'] ?? 0),
		toRow: (value, row) => {
			row['semitone'] = Number(value);
		}
	},
	{
		id: 'detune',
		label: 'Period Δ',
		title: 'Raw detune added to timer base period (affects all effects)',
		kind: 'integer',
		accent: 'tone',
		min: -4095,
		max: 4095,
		defaultValue: 1,
		fromRow: (row) => Number(row['detune'] ?? 1),
		toRow: (value, row) => {
			row['detune'] = Number(value);
		}
	}
];
