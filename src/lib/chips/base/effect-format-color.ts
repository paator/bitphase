export const EFFECT_FORMAT_COLORS = {
	code: 'var(--color-pattern-effect)',
	delay: 'var(--color-pattern-envelope)',
	parameter: 'var(--color-pattern-note)',
	literal: 'var(--color-app-text-muted)',
	table: 'var(--color-pattern-table)',
	name: 'var(--color-app-text-primary)',
	body: 'var(--color-app-text-secondary)'
} as const;

export type EffectColorSegment = {
	text: string;
	color: string;
};

export function getEffectFormatCharColors(format: string): string[] {
	const tableSyntax = format.includes('T');
	return [...format].map((ch, index) => {
		if (ch === '.') return EFFECT_FORMAT_COLORS.literal;
		if (ch === 'T') return EFFECT_FORMAT_COLORS.table;
		if (index === 0) return EFFECT_FORMAT_COLORS.code;
		if (index === 1) return EFFECT_FORMAT_COLORS.delay;
		if (tableSyntax) return EFFECT_FORMAT_COLORS.table;
		return EFFECT_FORMAT_COLORS.parameter;
	});
}

export function mergeEffectColorSegments(
	chars: Array<{ text: string; color: string }>
): EffectColorSegment[] {
	const segments: EffectColorSegment[] = [];
	for (const char of chars) {
		const last = segments[segments.length - 1];
		if (last && last.color === char.color) {
			last.text += char.text;
		} else {
			segments.push({ text: char.text, color: char.color });
		}
	}
	return segments;
}

export function getEffectFormatColorSegments(format: string): EffectColorSegment[] {
	const colors = getEffectFormatCharColors(format);
	return mergeEffectColorSegments(
		[...format].map((ch, index) => ({ text: ch, color: colors[index]! }))
	);
}

export function getEffectParamColorSegments(format: string, params: string): EffectColorSegment[] {
	const colors = getEffectFormatCharColors(format);
	const placeholderColors = new Map<string, string>();
	for (let i = 0; i < format.length; i++) {
		const ch = format[i]!;
		if (ch === '.' || placeholderColors.has(ch)) continue;
		placeholderColors.set(ch, colors[i]!);
	}
	return mergeEffectColorSegments(
		[...params].map((ch) => ({
			text: ch,
			color: placeholderColors.get(ch) ?? EFFECT_FORMAT_COLORS.body
		}))
	);
}

export function getEffectStatusHintColorSegments(hint: {
	format: string;
	name: string;
	params: string;
}): EffectColorSegment[] {
	return [
		...getEffectFormatColorSegments(hint.format),
		{ text: ': ', color: EFFECT_FORMAT_COLORS.literal },
		{ text: hint.name, color: EFFECT_FORMAT_COLORS.name },
		{ text: ' (', color: EFFECT_FORMAT_COLORS.literal },
		...getEffectParamColorSegments(hint.format, hint.params),
		{ text: ')', color: EFFECT_FORMAT_COLORS.literal }
	];
}
