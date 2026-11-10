import { formatHex, formatSymbol, parseHex, parseSymbol } from '../../chips/base/field-formatters';
import { NoteName } from '../../models/song';
import {
	envelopePeriodToNoteString,
	noteStringToEnvelopePeriod
} from '../../utils/envelope-note-conversion';
import { parseNoteFromString } from '../../utils/note-utils';
import { EMPTY_NOTE, OFF_NOTE, RELEASE_NOTE } from './piano-note-events';
import {
	clampPianoEffectInput,
	formatPianoEffectInput,
	PIANO_EFFECT_INPUT_LENGTH,
	pianoEffectInputValue
} from './piano-effect-input';
import type { PianoRollLane } from './piano-roll-schema';

export type PianoFieldValue = string | number | null | Record<string, unknown>;

export interface PianoLaneCodec<T extends PianoFieldValue = PianoFieldValue> {
	readonly maxLength: number;
	clamp(text: string): string;
	parse(text: string): T | undefined;
	format(value: unknown): string;
}

export type PianoLaneCodecLane = Pick<
	PianoRollLane,
	'kind' | 'fieldType' | 'length' | 'allowZeroValue' | 'noteEquivalent'
>;

export interface PianoLaneCodecContext {
	envelopeAsNote: boolean;
	tuningTable?: readonly number[];
}

interface RadixAlphabet {
	invalid: RegExp;
	digits: RegExp;
	format(
		value: number | string | null | undefined,
		length: number,
		allowZeroValue?: boolean
	): string;
	parse(digits: string, length: number, allowZeroValue?: boolean): number | null;
}

const RADIX_ALPHABETS: Partial<Record<PianoLaneCodecLane['fieldType'], RadixAlphabet>> = {
	hex: {
		invalid: /[^0-9A-F.]/g,
		digits: /^[0-9A-F]+$/,
		format: formatHex,
		parse: parseHex
	},
	symbol: {
		invalid: /[^0-9A-Z.]/g,
		digits: /^[0-9A-Z]+$/,
		format: formatSymbol,
		parse: (digits, length, allowZeroValue) =>
			parseSymbol(digits, length, allowZeroValue === true)
	}
};

const NOTE_INPUT_LENGTH = 3;
const MIN_TYPED_HEX_LENGTH = 4;

function isBlank(text: string): boolean {
	return /^\.+$/.test(text);
}

export class RadixLaneCodec implements PianoLaneCodec<number> {
	constructor(
		private readonly alphabet: RadixAlphabet,
		readonly maxLength: number,
		private readonly allowZeroValue?: boolean
	) {}

	clamp(text: string): string {
		return text
			.toUpperCase()
			.replace(this.alphabet.invalid, '')
			.slice(0, Math.max(1, this.maxLength));
	}

	parse(text: string): number | undefined {
		const cleaned = this.clamp(text);
		if (!cleaned || isBlank(cleaned)) return 0;
		const digits = cleaned.replace(/\./g, '0');
		if (!this.alphabet.digits.test(digits)) return undefined;
		return (
			this.alphabet.parse(
				digits.padStart(this.maxLength, '0'),
				this.maxLength,
				this.allowZeroValue
			) ?? undefined
		);
	}

	format(value: unknown): string {
		const raw =
			typeof value === 'number' || typeof value === 'string' || value == null ? value : null;
		const text = this.alphabet.format(raw, this.maxLength, this.allowZeroValue);
		return isBlank(text) ? '' : text;
	}
}

export class EnvelopeNoteLaneCodec implements PianoLaneCodec<number> {
	readonly maxLength = NOTE_INPUT_LENGTH;

	constructor(
		private readonly period: PianoLaneCodec<number>,
		private readonly tuningTable: readonly number[]
	) {}

	clamp(text: string): string {
		return text
			.toUpperCase()
			.replace(/[^A-G0-9#-]/g, '')
			.slice(0, NOTE_INPUT_LENGTH);
	}

	parse(text: string): number | undefined {
		const cleaned = this.clamp(text).replace(/^([A-G])(\d)$/, '$1-$2');
		if (
			!cleaned ||
			cleaned === EMPTY_NOTE ||
			cleaned === OFF_NOTE ||
			cleaned === RELEASE_NOTE
		) {
			return 0;
		}
		if (!this.tuningTable.length) return undefined;
		const parsed = parseNoteFromString(cleaned);
		if (parsed.noteName < NoteName.C || parsed.noteName > NoteName.B) return undefined;
		return noteStringToEnvelopePeriod(cleaned, [...this.tuningTable], parsed.octave);
	}

	format(value: unknown): string {
		if (typeof value === 'number' && value > 0 && this.tuningTable.length > 0) {
			const note = envelopePeriodToNoteString(value, [...this.tuningTable]);
			if (note) return note;
		}
		return this.period.format(value);
	}
}

export class EffectLaneCodec implements PianoLaneCodec<Record<string, unknown> | null> {
	readonly maxLength = PIANO_EFFECT_INPUT_LENGTH;

	clamp(text: string): string {
		return clampPianoEffectInput(text);
	}

	parse(text: string): Record<string, unknown> | null | undefined {
		const value = pianoEffectInputValue(this.clamp(text));
		if (!value) return value;
		return {
			effect: value.effect,
			delay: value.delay,
			parameter: value.parameter,
			tableIndex: value.tableIndex
		};
	}

	format(value: unknown): string {
		return formatPianoEffectInput(value);
	}
}

export function laneValueIsTyped(
	lane: Pick<PianoLaneCodecLane, 'kind' | 'fieldType' | 'length'> | null | undefined
): boolean {
	if (!lane || lane.kind !== 'value') return false;
	if (lane.fieldType === 'symbol') return lane.length >= 1;
	return lane.fieldType === 'hex' && lane.length >= MIN_TYPED_HEX_LENGTH;
}

export function laneShowsNote(
	lane: Pick<PianoRollLane, 'noteEquivalent'> | null | undefined,
	envelopeAsNote: boolean
): boolean {
	return !!lane?.noteEquivalent && envelopeAsNote;
}

export function radixLaneCodec(
	lane: Pick<PianoLaneCodecLane, 'fieldType' | 'length' | 'allowZeroValue'>
): RadixLaneCodec | null {
	const alphabet = RADIX_ALPHABETS[lane.fieldType];
	return alphabet ? new RadixLaneCodec(alphabet, lane.length, lane.allowZeroValue) : null;
}

export function typedLaneCodec(
	lane: PianoLaneCodecLane,
	context: PianoLaneCodecContext
): PianoLaneCodec<number> | null {
	const radix = radixLaneCodec(lane);
	if (!radix) return null;
	if (laneShowsNote(lane, context.envelopeAsNote)) {
		return new EnvelopeNoteLaneCodec(radix, context.tuningTable ?? []);
	}
	return radix;
}

export function pianoLaneCodec(
	lane: PianoLaneCodecLane | null | undefined,
	context: PianoLaneCodecContext
): PianoLaneCodec | null {
	if (!lane) return null;
	if (lane.kind === 'effect') return new EffectLaneCodec();
	return laneValueIsTyped(lane) ? typedLaneCodec(lane, context) : null;
}
