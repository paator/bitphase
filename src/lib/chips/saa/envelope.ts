import type { InstrumentMacroValueTooltip } from '../base/instrument-macros';

const WAVEFORM_NAMES = [
	'',
	'Hold',
	'Decay once',
	'Decay, repeating',
	'Attack once',
	'Attack, repeating',
	'Triangle once',
	'Triangle, repeating',
	'On, silent'
];

const DECAY_16 = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const ATTACK_16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const HOLD_16 = Array<number>(16).fill(15);
const SILENT_16 = Array<number>(16).fill(0);
const TRIANGLE_16 = [...ATTACK_16, ...DECAY_16];
const LEVELS_16 = [
	SILENT_16,
	HOLD_16,
	DECAY_16,
	DECAY_16,
	ATTACK_16,
	ATTACK_16,
	TRIANGLE_16,
	TRIANGLE_16,
	SILENT_16
];

const DECAY_8 = [14, 12, 10, 8, 6, 4, 2, 0];
const ATTACK_8 = [0, 2, 4, 6, 8, 10, 12, 14];
const HOLD_8 = Array<number>(8).fill(14);
const SILENT_8 = Array<number>(8).fill(0);
const TRIANGLE_8 = [...ATTACK_8, ...DECAY_8];
const LEVELS_8 = [
	SILENT_8,
	HOLD_8,
	DECAY_8,
	DECAY_8,
	ATTACK_8,
	ATTACK_8,
	TRIANGLE_8,
	TRIANGLE_8,
	SILENT_8
];

const REPEATING_WAVEFORM = new Set([1, 3, 5, 7, 8]);

function shownLevels(levels: readonly number[], repeating: boolean): number[] {
	return [...levels, ...(repeating ? levels : levels.map(() => 0))];
}

function mirrorLevels(levels: readonly number[], peak: number): number[] {
	return levels.map((level) => peak - level);
}

export function describeSaaEnvelope(value: number): string {
	if (value === 0) return 'blank, keeps current';
	if (value === -1) return 'off';
	const waveform = (value >> 4) & 0xf;
	const variant = value & 0xf;
	if (waveform < 1 || waveform > 8 || variant > 3) return 'unused, keeps current';
	const steps = (variant & 2) !== 0 ? '8 steps' : '16 steps';
	const right = (variant & 1) !== 0 ? 'right flipped' : 'right non-mirrored';
	return `${WAVEFORM_NAMES[waveform]}, ${steps}, ${right}`;
}

const SHAPE_HINT = '0 is 16 steps. Add 1 to flip the right side. Add 2 for 8 steps instead of 16.';

export function saaEnvelopeMacroTooltip(value: number): InstrumentMacroValueTooltip {
	return saaEnvelopeTooltip(value, {
		hint: `${SHAPE_HINT}\n00 follows the E column.`,
		blankHeading: '00',
		blankDetail: 'Follows the E column',
		unusedDetail: 'Unused. Follows the E column'
	});
}

export function saaEnvelopeColumnTooltip(value: number): InstrumentMacroValueTooltip {
	return saaEnvelopeTooltip(value, {
		hint: `${SHAPE_HINT}\n00 is off. A blank cell keeps the current mode.`,
		blankHeading: '..',
		blankDetail: 'Keeps the current mode',
		unusedDetail: 'Unused. Keeps the current mode'
	});
}

function saaEnvelopeTooltip(
	value: number,
	options: {
		hint: string;
		blankHeading: string;
		blankDetail: string;
		unusedDetail: string;
	}
): InstrumentMacroValueTooltip {
	const code = value | 0;
	const hex = code.toString(16).toUpperCase().padStart(2, '0');
	const waveform = (code >> 4) & 0xf;
	const variant = code & 0xf;
	const legend = LEVELS_16.slice(1).map((levels, index) => {
		const digit = index + 1;
		return {
			label: String(digit),
			levels: shownLevels(levels, REPEATING_WAVEFORM.has(digit)),
			active: digit === waveform
		};
	});
	const hint = options.hint;
	if (code === 0 || code === -1 || waveform < 1 || waveform > 8 || variant > 3) {
		return {
			heading: code === -1 ? '00' : code === 0 ? options.blankHeading : hex,
			detail: code === -1 ? 'Off' : code === 0 ? options.blankDetail : options.unusedDetail,
			legend,
			hint
		};
	}
	const coarse = (variant & 2) !== 0;
	const mirrored = (variant & 1) !== 0;
	const peak = coarse ? 14 : 15;
	const levels = shownLevels(
		coarse ? LEVELS_8[waveform]! : LEVELS_16[waveform]!,
		REPEATING_WAVEFORM.has(waveform)
	);
	return {
		heading: hex,
		detail: `${WAVEFORM_NAMES[waveform]} · ${coarse ? '8 steps' : '16 steps'} · ${mirrored ? 'right flipped' : 'right non-mirrored'}`,
		series: mirrored ? [{ levels }, { levels: mirrorLevels(levels, peak) }] : [{ levels }],
		legend,
		hint
	};
}
