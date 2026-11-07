import type { GlobalStickyRowRead, StickyEffectCommand } from '../base/schema';
import { isAyAutoEnvelopeEffect } from './effects';
import { isPatternEnvelopeShapeSet } from './instrument';

const ARPEGGIO = 'A'.charCodeAt(0);
const DETUNE = 'D'.charCodeAt(0);
const VIBRATO = 'V'.charCodeAt(0);
const SLIDE_UP = 1;
const SLIDE_DOWN = 2;
const PORTAMENTO = 'P'.charCodeAt(0);
const ON_OFF = 6;

function readEnvelopeEffect(value: unknown): StickyEffectCommand | null {
	if (!value || typeof value !== 'object') return null;
	const effect = value as StickyEffectCommand;
	if (typeof effect.effect !== 'number') return null;
	return effect;
}

function envelopeValueOf(patternRow: Record<string, unknown>): number | null {
	const value = patternRow.envelopeValue;
	if (typeof value !== 'number' || Number.isNaN(value)) return null;
	return value;
}

export function ayEnvelopeStickyEffectGroup(effect: StickyEffectCommand): string | null {
	if (effect.effect === DETUNE) return 'detune';
	if (effect.effect === ARPEGGIO) return 'envelope-arpeggio';
	if (effect.effect === VIBRATO) return 'envelope-vibrato';
	if (
		effect.effect === SLIDE_UP ||
		effect.effect === SLIDE_DOWN ||
		effect.effect === PORTAMENTO
	) {
		return 'envelope-slide';
	}
	if (effect.effect === ON_OFF) return 'envelope-on-off';
	if (isAyAutoEnvelopeEffect(effect)) {
		if (effect.tableIndex !== undefined && effect.tableIndex >= 0) return 'envelope-auto';
		const parameter = effect.parameter ?? 0;
		const numerator = (parameter >> 4) & 0xf;
		const denominator = parameter & 0xf;
		if (numerator > 0 && denominator > 0) return 'envelope-auto';
	}
	return null;
}

export function readAyEnvelopeSticky(
	patternRow: Record<string, unknown>,
	channelRows: Array<Record<string, unknown> | undefined>
): GlobalStickyRowRead {
	const effect = readEnvelopeEffect(patternRow.envelopeEffect);
	const envelopeValue = envelopeValueOf(patternRow);
	const hasPortamento =
		effect?.effect === PORTAMENTO && envelopeValue !== null && envelopeValue > 0;
	const shapeSet = channelRows.some((row) => {
		const shape = row?.envelopeShape;
		return typeof shape === 'number' && isPatternEnvelopeShapeSet(shape);
	});
	const closesEarlierGroups =
		(envelopeValue !== null && envelopeValue > 0 && !hasPortamento) ||
		(envelopeValue === 0 && shapeSet);
	return {
		group: effect ? ayEnvelopeStickyEffectGroup(effect) : null,
		effect: patternRow.envelopeEffect,
		fieldKey: 'envelopeEffect',
		survivesClose: effect?.effect === DETUNE,
		commandFields: hasPortamento && envelopeValue !== null ? { envelopeValue } : undefined,
		closesEarlierGroups,
		skipFieldKeys: hasPortamento ? ['envelopeValue'] : undefined
	};
}
