import type { StickyEffectCommand } from '../base/schema';
import { formatEffectStatusHint, type EffectStatusHint } from '../base/effect-status';

export const SAA_STEREO_INVERT_SUBCOMMAND = 1;
export const SAA_NOISE_LOCK_SUBCOMMAND = 2;
export const SAA_MIXER_SUBCOMMAND = 6;
export const SAA_AUTO_ENVELOPE_SUBCOMMAND = 0x0a;

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

export function isSaaMixerEffect(effect: { effect: number; delay: number }): boolean {
	return isSaaSubcommand(effect, SAA_MIXER_SUBCOMMAND);
}

export function isSaaAutoEnvelopeEffect(effect: { effect: number; delay: number }): boolean {
	return isSaaSubcommand(effect, SAA_AUTO_ENVELOPE_SUBCOMMAND);
}

export function saaStickyChannelEffectGroup(
	effect: StickyEffectCommand,
	channelIndex = 0
): string | null {
	if (isSaaStereoInvertEffect(effect)) return 'saa-invert';
	if (isSaaNoiseLockEffect(effect)) return 'saa-noise-lock';
	if (isSaaMixerEffect(effect)) return 'saa-mixer';
	if (isSaaAutoEnvelopeEffect(effect)) {
		return channelIndex < 3 ? 'saa-auto-envelope-0' : 'saa-auto-envelope-1';
	}
	return null;
}

export function saaStickyChannelEffectIsShared(group: string): boolean {
	return group.startsWith('saa-auto-envelope-');
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
const SAA_MIXER_HINT: EffectStatusHint = {
	format: 'E6XY',
	name: 'Waveform',
	params: 'XY: 1=tone, 2=noise, 04=inst'
};
const SAA_MIXER_TABLE_HINT: EffectStatusHint = {
	format: 'E6TY',
	name: 'Waveform',
	params: 'Y: table'
};
const SAA_AUTO_ENVELOPE_HINT: EffectStatusHint = {
	format: 'EAXY',
	name: 'Auto-Envelope',
	params: 'X:Y writes the clock channel'
};
const SAA_AUTO_ENVELOPE_TABLE_HINT: EffectStatusHint = {
	format: 'EATY',
	name: 'Auto-Envelope',
	params: 'Y: table'
};

const SAA_EFFECT_STATUS_HINTS: EffectStatusHint[] = [
	SAA_STEREO_INVERT_HINT,
	SAA_NOISE_LOCK_HINT,
	SAA_MIXER_HINT,
	SAA_MIXER_TABLE_HINT,
	SAA_AUTO_ENVELOPE_HINT,
	SAA_AUTO_ENVELOPE_TABLE_HINT
];

function usesTable(effect: { tableIndex?: number }): boolean {
	return effect.tableIndex !== undefined && effect.tableIndex >= 0;
}

export function describeSaaEffect(effect: {
	effect: number;
	delay: number;
	tableIndex?: number;
}): string | null {
	const table = usesTable(effect);
	if (isSaaStereoInvertEffect(effect)) return formatEffectStatusHint(SAA_STEREO_INVERT_HINT);
	if (isSaaNoiseLockEffect(effect)) return formatEffectStatusHint(SAA_NOISE_LOCK_HINT);
	if (isSaaMixerEffect(effect)) {
		return formatEffectStatusHint(table ? SAA_MIXER_TABLE_HINT : SAA_MIXER_HINT);
	}
	if (isSaaAutoEnvelopeEffect(effect)) {
		return formatEffectStatusHint(
			table ? SAA_AUTO_ENVELOPE_TABLE_HINT : SAA_AUTO_ENVELOPE_HINT
		);
	}
	return null;
}

export function listSaaEffectStatusHints(): EffectStatusHint[] {
	return SAA_EFFECT_STATUS_HINTS;
}
