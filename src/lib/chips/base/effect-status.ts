import type { Chip } from '../types';
import type { Pattern } from '../../models/song';
import { isEffectLike, type EffectLike } from '../../utils/type-guards';
import { PatternEffectHandling } from '../../services/pattern/editing/pattern-effect-handling';
import {
	getChannelEffectSlotIndex,
	isEffectFieldKey
} from './channel-effect-columns';

type EffectStatusHint = {
	format: string;
	name: string;
	params: string;
};

const GENERAL_EFFECT_HINTS: Record<number, EffectStatusHint> = {
	['A'.charCodeAt(0)]: {
		format: 'AXYZ',
		name: 'Arpeggio',
		params: 'X: steps; Y: offset; Z: offset'
	},
	['V'.charCodeAt(0)]: {
		format: 'VXYZ',
		name: 'Vibrato',
		params: 'X: delay; Y: speed; Z: depth'
	},
	1: { format: '1XYZ', name: 'Slide Down', params: 'X: delay; YZ: step' },
	2: { format: '2XYZ', name: 'Slide Up', params: 'X: delay; YZ: step' },
	['P'.charCodeAt(0)]: {
		format: 'PXYZ',
		name: 'Portamento',
		params: 'X: delay; YZ: speed'
	},
	4: { format: '4.XY', name: 'Instrument Position', params: 'XY: row' },
	5: { format: '5.XY', name: 'Table Position', params: 'XY: row' },
	6: { format: '6.XY', name: 'On/Off', params: 'X: on; Y: off' },
	['D'.charCodeAt(0)]: { format: 'D.XY', name: 'Detune', params: 'XY: signed, 80=0' },
	['S'.charCodeAt(0)]: { format: 'S.XY', name: 'Speed', params: 'XY: ticks' }
};

const GENERAL_TABLE_HINTS: Record<number, EffectStatusHint> = {
	['A'.charCodeAt(0)]: {
		format: 'AXTY',
		name: 'Arpeggio',
		params: 'X: steps; Y: table'
	},
	['V'.charCodeAt(0)]: {
		format: 'VXTY',
		name: 'Vibrato',
		params: 'X: delay; Y: table'
	},
	1: { format: '1XTY', name: 'Slide Down', params: 'X: delay; Y: table' },
	2: { format: '2XTY', name: 'Slide Up', params: 'X: delay; Y: table' },
	['P'.charCodeAt(0)]: {
		format: 'PXTY',
		name: 'Portamento',
		params: 'X: delay; Y: table'
	},
	6: { format: '6.TY', name: 'On/Off', params: 'Y: table' },
	['D'.charCodeAt(0)]: { format: 'D.TY', name: 'Detune', params: 'Y: table' },
	['S'.charCodeAt(0)]: { format: 'S.TY', name: 'Speed', params: 'Y: table' }
};

export function formatEffectStatusHint(hint: EffectStatusHint): string {
	return `${hint.format}: ${hint.name} (${hint.params})`;
}

function usesTableSyntax(effect: EffectLike): boolean {
	return effect.tableIndex !== undefined && effect.tableIndex >= 0;
}

export function describeGeneralEffect(effect: EffectLike): string | null {
	if (PatternEffectHandling.isEmptyEffect(effect)) return null;
	const hint = usesTableSyntax(effect)
		? (GENERAL_TABLE_HINTS[effect.effect] ?? GENERAL_EFFECT_HINTS[effect.effect])
		: GENERAL_EFFECT_HINTS[effect.effect];
	return hint ? formatEffectStatusHint(hint) : null;
}

export function describePatternEffect(
	effect: EffectLike | null | undefined,
	chip: Pick<Chip, 'describeEffect'>
): string | null {
	if (!effect || PatternEffectHandling.isEmptyEffect(effect)) return null;
	return chip.describeEffect?.(effect) ?? describeGeneralEffect(effect);
}

export function getEffectFromPattern(
	pattern: Pattern,
	rowIndex: number,
	fieldKey: string,
	channelIndex: number
): EffectLike | null {
	if (!isEffectFieldKey(fieldKey)) return null;
	if (rowIndex < 0 || rowIndex >= pattern.length) return null;

	if (fieldKey === 'envelopeEffect') {
		const value = pattern.patternRows[rowIndex]?.envelopeEffect;
		return isEffectLike(value) ? value : null;
	}

	const slot = getChannelEffectSlotIndex(fieldKey);
	if (slot === null) return null;
	const row = pattern.channels[channelIndex]?.rows[rowIndex];
	const value = row?.effects?.[slot];
	return isEffectLike(value) ? value : null;
}
