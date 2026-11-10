import { describe, expect, it } from 'vitest';
import {
	EffectLaneCodec,
	laneShowsNote,
	laneValueIsTyped,
	pianoLaneCodec,
	radixLaneCodec,
	typedLaneCodec,
	type PianoLaneCodecLane
} from '@/lib/services/piano-roll/piano-lane-codec';

const tuning = Array.from({ length: 12 }, (_, index) => (index + 1) * 160);

function lane(overrides: Partial<PianoLaneCodecLane>): PianoLaneCodecLane {
	return { kind: 'value', fieldType: 'hex', length: 4, ...overrides };
}

describe('piano lane codec', () => {
	it('types long hex lanes and symbol lanes, and keeps short hex lanes as bars', () => {
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'symbol', length: 2 })).toBe(true);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'symbol', length: 1 })).toBe(true);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'hex', length: 1 })).toBe(false);
		expect(laneValueIsTyped({ kind: 'value', fieldType: 'hex', length: 4 })).toBe(true);
		expect(laneValueIsTyped({ kind: 'effect', fieldType: 'hex', length: 4 })).toBe(false);
	});

	it('edits hex values', () => {
		const codec = radixLaneCodec({ fieldType: 'hex', length: 4, allowZeroValue: true })!;
		expect(codec.clamp('12gg')).toBe('12');
		expect(codec.format(255)).toBe('00FF');
		expect(codec.parse('ff')).toBe(255);
		expect(codec.parse('0000')).toBe(-1);
		expect(codec.parse('')).toBe(0);
	});

	it('keeps a typed instrument to its symbol length', () => {
		const codec = radixLaneCodec({ fieldType: 'symbol', length: 2, allowZeroValue: false })!;
		expect(codec.clamp('1a3')).toBe('1A');
		expect(codec.clamp(' z9')).toBe('Z9');
		expect(codec.clamp('..')).toBe('..');
		expect(codec.format(3)).toBe('03');
		expect(codec.format(0)).toBe('');
		expect(codec.parse('3')).toBe(3);
		expect(codec.parse('0A')).toBe(10);
		expect(codec.parse('')).toBe(0);
		expect(codec.parse('..')).toBe(0);
		const short = radixLaneCodec({ fieldType: 'symbol', length: 1 })!;
		expect(short.format(10)).toBe('A');
		expect(short.parse('a')).toBe(10);
		expect(short.parse('0')).toBe(0);
		expect(radixLaneCodec({ fieldType: 'dec', length: 2 })).toBeNull();
	});

	it('edits an envelope period as a note when that view is on', () => {
		expect(laneShowsNote({ noteEquivalent: true }, true)).toBe(true);
		expect(laneShowsNote({ noteEquivalent: true }, false)).toBe(false);
		const envelope = lane({ noteEquivalent: true, allowZeroValue: true });
		const codec = typedLaneCodec(envelope, { envelopeAsNote: true, tuningTable: tuning })!;
		expect(codec.maxLength).toBe(3);
		expect(codec.parse('C-1')).toBe(10);
		expect(codec.parse('c1')).toBe(10);
		expect(codec.format(10)).toBe('C-1');
		expect(codec.parse('')).toBe(0);
		expect(codec.parse('C-')).toBeUndefined();
		const hex = typedLaneCodec(envelope, { envelopeAsNote: false, tuningTable: tuning })!;
		expect(hex.maxLength).toBe(4);
		expect(hex.format(10)).toBe('000A');
		const untuned = typedLaneCodec(envelope, { envelopeAsNote: true })!;
		expect(untuned.format(10)).toBe('000A');
		expect(untuned.parse('C-1')).toBeUndefined();
	});

	it('edits effect commands', () => {
		const codec = new EffectLaneCodec();
		expect(codec.clamp(' v1 48 ')).toBe('V148');
		expect(codec.parse('')).toBeNull();
		const parsed = codec.parse('V148');
		expect(parsed).toMatchObject({ effect: 'V'.charCodeAt(0), delay: 1, parameter: 0x48 });
		expect(codec.format(parsed)).toBe('V148');
	});

	it('picks a codec for each lane kind', () => {
		const context = { envelopeAsNote: false };
		expect(pianoLaneCodec(lane({ kind: 'effect' }), context)).toBeInstanceOf(EffectLaneCodec);
		expect(pianoLaneCodec(lane({ length: 4 }), context)?.maxLength).toBe(4);
		expect(pianoLaneCodec(lane({ length: 1 }), context)).toBeNull();
		expect(pianoLaneCodec(null, context)).toBeNull();
	});
});
