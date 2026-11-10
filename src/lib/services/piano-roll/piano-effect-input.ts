import { PatternEffectHandling } from '../pattern/editing/pattern-effect-handling';
import { isEffectLike, type EffectLike } from '../../utils/type-guards';

export const PIANO_EFFECT_INPUT_LENGTH = 4;

export function clampPianoEffectInput(text: string): string {
	return text.replace(/\s/g, '').toUpperCase().slice(0, PIANO_EFFECT_INPUT_LENGTH);
}

export function formatPianoEffectInput(value: unknown): string {
	if (!isEffectLike(value)) return '';
	const text = PatternEffectHandling.formatEffectAsString(value);
	return text === '....' ? '' : text;
}

export function effectCommandFromFormat(format: string): string {
	return format.replace(/[XYZ]/g, (digit) => (digit === 'Y' ? '4' : '0'));
}

export function pianoEffectInputValue(text: string): EffectLike | null | undefined {
	const trimmed = text.trim().toUpperCase();
	if (!trimmed || /^[.]+$/.test(trimmed)) return null;
	return PatternEffectHandling.parseEffectFromString(trimmed) ?? undefined;
}
