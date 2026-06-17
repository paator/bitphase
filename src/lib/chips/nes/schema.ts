import type { ChipSchema } from '../base/schema';

export const NES_NTSC_CPU_FREQUENCY = 1_789_773;
export const NES_PAL_CPU_FREQUENCY = 1_662_607;
export const NES_DENDY_CPU_FREQUENCY = 1_773_448;

export type NesSystem = 'NTSC' | 'PAL' | 'Dendy';
export type NesApuTimingType = 'NTSC' | 'PAL';

export const NES_SYSTEM_CONFIG: Record<
	NesSystem,
	{ frequency: number; apuTimingType: NesApuTimingType }
> = {
	NTSC: { frequency: NES_NTSC_CPU_FREQUENCY, apuTimingType: 'NTSC' },
	PAL: { frequency: NES_PAL_CPU_FREQUENCY, apuTimingType: 'PAL' },
	Dendy: { frequency: NES_DENDY_CPU_FREQUENCY, apuTimingType: 'NTSC' }
};

export function resolveNesSystem(value: unknown): NesSystem {
	if (value === 'PAL' || value === 'Dendy') return value;
	return 'NTSC';
}

export function resolveNesCpuFrequency(system: unknown): number {
	return NES_SYSTEM_CONFIG[resolveNesSystem(system)].frequency;
}

export function resolveNesApuTimingType(system: unknown): NesApuTimingType {
	return NES_SYSTEM_CONFIG[resolveNesSystem(system)].apuTimingType;
}

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
				{ label: 'PAL', value: 'PAL' },
				{ label: 'Dendy', value: 'Dendy' }
			],
			defaultValue: 'NTSC',
			group: 'chip',
			notifyAudioService: true,
			computedHint: (value) => {
				const frequency = resolveNesCpuFrequency(value);
				const mhz = (frequency / 1_000_000).toFixed(4);
				const apuTimingType = resolveNesApuTimingType(value);
				return `${mhz} MHz · ${apuTimingType} type`;
			}
		}
	],
	applySettingSideEffects(key, value) {
		if (key === 'chipVariant') {
			return [{ key: 'chipFrequency', value: resolveNesCpuFrequency(value) }];
		}
		return [];
	},
	normalizeSettings(record) {
		const system = resolveNesSystem(record.chipVariant);
		return {
			...record,
			chipVariant: system,
			chipFrequency: resolveNesCpuFrequency(system)
		};
	}
};
