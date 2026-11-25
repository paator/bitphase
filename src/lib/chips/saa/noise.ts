import type {
	InstrumentMacroValue,
	InstrumentMacroTooltipLegend,
	InstrumentMacroValueTooltip
} from '../base/instrument-macros';

const CLOCK_NAMES = ['High', 'Mid', 'Low', 'Locked'] as const;
const CLOCK_DETAILS = [
	'Fixed fast clock',
	'Fixed medium clock',
	'Fixed slow clock',
	'Locked to a channel'
] as const;

const HIGH = repeat([15, 0], 12);
const MID = repeat([15, 15, 0, 0], 6);
const LOW = repeat([15, 15, 15, 15, 0, 0, 0, 0], 3);
const CLOCK_LEVELS = [HIGH, MID, LOW];

const COLUMN_HINT =
	'0 is high, 1 is mid, 2 is low. 3 locks the clock to channel A or D.\nA blank cell keeps the current clock.';

function repeat(pattern: readonly number[], times: number): number[] {
	const levels: number[] = [];
	for (let index = 0; index < times; index++) levels.push(...pattern);
	return levels;
}

function wrapClock(offset: number): number {
	return ((offset % 4) + 4) % 4;
}

function clockOf(value: number): number | null {
	if (value === 0) return null;
	if (value === -1) return 0;
	if (!Number.isFinite(value) || value < 0) return null;
	return value & 3;
}

function legend(active: number | null): InstrumentMacroTooltipLegend[] {
	return [0, 1, 2, 3].map((index) => ({
		label: String(index),
		levels: CLOCK_LEVELS[index] ?? [],
		active: index === active,
		icon: index === 3 ? 'music' : undefined
	}));
}

function clockPicture(clock: number): Pick<InstrumentMacroValueTooltip, 'series' | 'icon'> {
	if (clock === 3) return { icon: 'music' };
	return { series: [{ levels: CLOCK_LEVELS[clock]! }] };
}

function clockDetail(clock: number, driver: 'A' | 'D'): string {
	if (clock === 3) return `Locked to channel ${driver}`;
	return CLOCK_DETAILS[clock] ?? CLOCK_DETAILS[0];
}

export function describeSaaNoise(value: number, driver: 'A' | 'D'): string {
	if (typeof value !== 'number' || value === 0) return 'blank, keeps current';
	const clock = clockOf(value);
	if (clock === null) return 'blank, keeps current';
	const name = clock === 3 ? `locked to ${driver}` : CLOCK_NAMES[clock].toLowerCase();
	if (value > 3) return `${name}, from ${value.toString(16).toUpperCase()}`;
	return name;
}

export function saaNoiseColumnTooltip(
	value: number,
	driver: 'A' | 'D'
): InstrumentMacroValueTooltip {
	const clock = clockOf(value);
	const code = value | 0;
	const heading = code === 0 ? '.' : code === -1 ? '0' : code.toString(16).toUpperCase();
	if (clock === null) {
		return {
			heading,
			detail: 'Keeps the current clock',
			legend: legend(null),
			hint: COLUMN_HINT
		};
	}
	const heard = clockDetail(clock, driver);
	return {
		heading,
		detail: code > 3 ? `${heard}. Digits above 3 use the low two bits` : heard,
		...clockPicture(clock),
		legend: legend(clock),
		hint: COLUMN_HINT
	};
}

export function saaNoiseEnableTooltip(value: InstrumentMacroValue): InstrumentMacroValueTooltip {
	const on = value === true;
	return {
		heading: on ? 'On' : 'Off',
		detail: on
			? 'This channel mixes in the group noise.'
			: 'This channel leaves the group noise out.',
		hint: 'The N column chooses the clock. 0 high, 1 mid, 2 low, 3 locked to A or D.'
	};
}

export function saaNoiseOffsetTooltip(value: InstrumentMacroValue): InstrumentMacroValueTooltip {
	const shift = typeof value === 'number' ? value | 0 : 0;
	const heading = shift > 0 ? `+${shift}` : String(shift);
	if (shift === 0) {
		return {
			heading,
			detail: 'Does not change the noise clock.',
			legend: legend(null),
			hint: 'Added to the N column while noise is on. The result wraps through 0-3.'
		};
	}
	const clock = wrapClock(shift);
	return {
		heading,
		detail: `Shifts the clock by ${heading}. From high, that is ${CLOCK_NAMES[clock]!.toLowerCase()}.`,
		...clockPicture(clock),
		legend: legend(clock),
		hint: 'Added to the current N clock, then wrapped through high, mid, low, and locked.'
	};
}

export function saaNoiseAccumulationTooltip(
	value: InstrumentMacroValue
): InstrumentMacroValueTooltip {
	const on = value === true;
	return {
		heading: on ? 'On' : 'Off',
		detail: on
			? "This step's offset stays and is added to the following noise steps."
			: "This step's offset applies once and is not kept.",
		hint: 'The running total is added to the N column while noise is on.'
	};
}
