import type { ChipSchema } from '../base/schema';
import { generate12TETTuningTable } from '../../models/pt3/tuning-tables';

export const NES_NTSC_CPU_FREQUENCY = 1_789_773;
export const NES_PAL_CPU_FREQUENCY = 1_662_607;
export const NES_DENDY_CPU_FREQUENCY = 1_773_448;
export const NES_MAX_TUNING_PERIOD = 2047;

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

export function resolveNesTuningTable(cpuFrequencyHz: number, a4TuningHz: number): number[] {
	return generate12TETTuningTable(cpuFrequencyHz, a4TuningHz, NES_MAX_TUNING_PERIOD);
}

export const NES_DEFAULT_TUNING_TABLE = resolveNesTuningTable(NES_NTSC_CPU_FREQUENCY, 440);

export const NES_CHIP_SCHEMA: ChipSchema = {
	chipType: 'nes',
	defaultTuningTable: NES_DEFAULT_TUNING_TABLE,
	defaultChipVariant: 'NTSC',
	channelLabels: ['Pulse 1', 'Pulse 2', 'Triangle', 'Noise', 'DPCM'],
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
		},
		{
			key: 'interruptFrequency',
			label: 'Interrupt Frequency',
			type: 'select',
			options: [
				{ label: 'PAL (50 Hz)', value: 50 },
				{ label: 'NTSC (60 Hz)', value: 60 }
			],
			defaultValue: 50,
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'a4TuningHz',
			label: 'A4 (Hz)',
			type: 'number',
			min: 220,
			max: 880,
			defaultValue: 440,
			group: 'chip',
			notifyAudioService: true,
			startNewRow: true
		}
	],
	resolveTuningTable(song) {
		const cpuFreq = Number(song.chipFrequency ?? NES_NTSC_CPU_FREQUENCY);
		const a4 = Math.min(880, Math.max(220, Number(song.a4TuningHz ?? 440)));
		return resolveNesTuningTable(cpuFreq, a4);
	},
	tuningTableSettingKeys: ['a4TuningHz', 'chipFrequency'],
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
