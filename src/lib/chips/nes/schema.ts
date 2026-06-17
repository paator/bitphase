import type { ChipSchema } from '../base/schema';

export const NES_NTSC_CPU_FREQUENCY = 1_789_772;

export const NES_DEFAULT_TUNING_TABLE = Array.from({ length: 88 }, (_, index) =>
	Math.max(1, 2034 - index * 8)
);

export const NES_CHIP_SCHEMA: ChipSchema = {
	chipType: 'nes',
	defaultTuningTable: NES_DEFAULT_TUNING_TABLE,
	defaultChipVariant: 'NTSC',
	channelLabels: ['Square 1', 'Square 2', 'Triangle', 'Noise', 'DPCM'],
	template: '{note} {instrument}{table}{volume} {effect}',
	fields: {
		note: {
			key: 'note',
			type: 'note',
			length: 3,
			color: 'patternNote',
			selectable: 'atomic',
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		},
		instrument: {
			key: 'instrument',
			type: 'symbol',
			length: 2,
			color: 'patternInstrument',
			selectable: 'character',
			allowZeroValue: false,
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		},
		table: {
			key: 'table',
			type: 'symbol',
			length: 1,
			color: 'patternTable',
			selectable: 'character',
			usedForBacktracking: true,
			backtrackWhen: 'any'
		},
		volume: {
			key: 'volume',
			type: 'hex',
			length: 1,
			color: 'patternText',
			selectable: 'character',
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		},
		effect: {
			key: 'effect',
			type: 'hex',
			length: 4,
			color: 'patternEffect',
			selectable: 'character'
		}
	},
	settings: [
		{
			key: 'chipVariant',
			label: 'System',
			type: 'toggle',
			options: [
				{ label: 'NTSC', value: 'NTSC' },
				{ label: 'PAL', value: 'PAL' }
			],
			defaultValue: 'NTSC',
			group: 'chip'
		}
	]
};
