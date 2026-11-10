import type { EffectLike } from '../../utils/type-guards';

export type PianoEffectGesture =
	| { kind: 'slide-up'; amount: number }
	| { kind: 'slide-down'; amount: number }
	| { kind: 'portamento'; amount: number; fromPitch: number | null }
	| { kind: 'vibrato'; speed: number; depth: number }
	| { kind: 'arpeggio'; steps: number[] }
	| { kind: 'volume'; up: number; down: number }
	| { kind: 'delay'; portion: number };

const SLIDE_DOWN = 1;
const SLIDE_UP = 2;
const NOTE_DELAY = 7;
const VOLUME_SLIDE = 8;
const ARPEGGIO = 'A'.charCodeAt(0);
const VIBRATO = 'V'.charCodeAt(0);
const PORTAMENTO = 'P'.charCodeAt(0);

function usesTable(effect: EffectLike): boolean {
	return effect.tableIndex !== undefined && effect.tableIndex >= 0;
}

function slideAmount(parameter: number, table: boolean): number {
	if (table || parameter <= 0) return 0.45;
	return Math.max(0.22, Math.min(1, parameter / 48));
}

export function generalPianoEffectGesture(effect: EffectLike): PianoEffectGesture | null {
	const table = usesTable(effect);
	const parameter = effect.parameter ?? 0;
	switch (effect.effect) {
		case SLIDE_UP:
			return { kind: 'slide-up', amount: slideAmount(parameter, table) };
		case SLIDE_DOWN:
			return { kind: 'slide-down', amount: slideAmount(parameter, table) };
		case PORTAMENTO:
			return { kind: 'portamento', amount: slideAmount(parameter, table), fromPitch: null };
		case VIBRATO:
			return {
				kind: 'vibrato',
				speed:
					table || ((parameter >> 4) & 0xf) === 0 ? 0.45 : ((parameter >> 4) & 0xf) / 15,
				depth:
					table || (parameter & 0xf) === 0 ? 0.55 : Math.max(0.25, (parameter & 0xf) / 15)
			};
		case ARPEGGIO: {
			const steps = [(parameter >> 4) & 0xf, parameter & 0xf].filter((step) => step > 0);
			if (steps.length === 0) return table ? { kind: 'arpeggio', steps: [4, 7] } : null;
			return { kind: 'arpeggio', steps };
		}
		case VOLUME_SLIDE: {
			const up = ((parameter >> 4) & 0xf) / 15;
			const down = (parameter & 0xf) / 15;
			if (up === 0 && down === 0) return table ? { kind: 'volume', up: 0, down: 0.7 } : null;
			return { kind: 'volume', up, down };
		}
		case NOTE_DELAY: {
			const ticks = parameter & 0xff;
			if (ticks <= 0) return null;
			return { kind: 'delay', portion: Math.max(0.12, Math.min(0.55, ticks / 16)) };
		}
		default:
			return null;
	}
}

export function pianoEffectGestureFor(
	effect: EffectLike,
	chip?: {
		pianoEffectGesture?: (effect: EffectLike) => PianoEffectGesture | null;
	} | null
): PianoEffectGesture | null {
	return chip?.pianoEffectGesture?.(effect) ?? generalPianoEffectGesture(effect);
}
