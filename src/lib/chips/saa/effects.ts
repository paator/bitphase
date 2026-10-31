import type { StickyEffectCommand } from '../base/schema';
import { formatEffectStatusHint, type EffectStatusHint } from '../base/effect-status';

export const SAA_STEREO_INVERT_SUBCOMMAND = 1;
export const SAA_NOISE_LOCK_SUBCOMMAND = 2;

const CHIP_EFFECT = 'E'.charCodeAt(0);

function isSaaSubcommand(effect: { effect: number; delay: number }, subcommand: number): boolean {
	return effect.effect === CHIP_EFFECT && effect.delay === subcommand;
}

export function isSaaStereoInvertEffect(effect: { effect: number; delay: number }): boolean {
	return isSaaSubcommand(effect, SAA_STEREO_INVERT_SUBCOMMAND);
}

export function isSaaNoiseLockEffect(effect: { effect: number; delay: number }): boolean {
	return isSaaSubcommand(effect, SAA_NOISE_LOCK_SUBCOMMAND);
}

export function saaStickyChannelEffectGroup(effect: StickyEffectCommand): string | null {
	if (isSaaStereoInvertEffect(effect)) return 'saa-invert';
	if (isSaaNoiseLockEffect(effect)) return 'saa-noise-lock';
	return null;
}

const SAA_STEREO_INVERT_HINT: EffectStatusHint = {
	format: 'E1XY',
	name: 'Stereo Invert',
	params: 'XY: 00 off, 01 on'
};
const SAA_NOISE_LOCK_HINT: EffectStatusHint = {
	format: 'E2XY',
	name: 'Noise Lock',
	params: 'XY: 00 off, 01 lock'
};

const SAA_EFFECT_STATUS_HINTS: EffectStatusHint[] = [
	SAA_STEREO_INVERT_HINT,
	SAA_NOISE_LOCK_HINT
];

export function describeSaaEffect(effect: { effect: number; delay: number }): string | null {
	if (isSaaStereoInvertEffect(effect)) return formatEffectStatusHint(SAA_STEREO_INVERT_HINT);
	if (isSaaNoiseLockEffect(effect)) return formatEffectStatusHint(SAA_NOISE_LOCK_HINT);
	return null;
}

export function listSaaEffectStatusHints(): EffectStatusHint[] {
	return SAA_EFFECT_STATUS_HINTS;
}
