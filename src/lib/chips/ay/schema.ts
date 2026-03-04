import type { ChipSchema } from '../base/schema';
import { PT3TuneTables, generate12TETTuningTable } from '../../models/pt3/tuning-tables';

export const AY_CHIP_SCHEMA: ChipSchema = {
	chipType: 'ay',
	defaultTuningTable: PT3TuneTables[2],
	defaultChipVariant: 'AY',
	globalTemplate: '{envelopeValue} {envelopeEffect} {noiseValue}',
	globalFields: {
		envelopeValue: {
			key: 'envelopeValue',
			type: 'hex',
			length: 4,
			color: 'patternEnvelope',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		},
		envelopeEffect: { key: 'envelopeEffect', type: 'hex', length: 4, color: 'patternEffect' },
		noiseValue: {
			key: 'noiseValue',
			type: 'hex',
			length: 2,
			color: 'patternNoise',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'any'
		}
	},
	channelLabels: ['A', 'B', 'C'],
	globalColumnLabels: {
		envelopeValue: 'Env',
		envelopeEffect: 'Efx',
		noiseValue: 'NO'
	},
	template: '{note} {instrument}{envelopeShape}{table}{volume} {effect}',
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
		envelopeShape: {
			key: 'envelopeShape',
			type: 'hex',
			length: 1,
			color: 'patternEnvelope',
			selectable: 'character',
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
			label: 'Chip Type',
			type: 'toggle',
			options: [
				{ label: 'AY', value: 'AY' },
				{ label: 'YM', value: 'YM' }
			],
			defaultValue: 'AY',
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'chipFrequency',
			label: 'Chip Frequency',
			type: 'select',
			options: [
				{ label: 'Sinclair QL (0.75 MHz)', value: 750000 },
				{ label: 'Amstrad CPC (1 MHz)', value: 1000000 },
				{ label: 'ZX Spectrum (1.7734 MHz)', value: 1773400 },
				{ label: 'Pentagon (1.75 MHz)', value: 1750000 },
				{ label: 'MSX (1.7897 MHz)', value: 1789700 },
				{ label: 'Atari ST (2 MHz)', value: 2000000 }
			],
			defaultValue: 1773400,
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'interruptFrequency',
			label: 'Interrupt Frequency',
			type: 'select',
			options: [
				{ label: 'Pentagon (48.828 Hz)', value: 48.828 },
				{ label: 'PAL (50 Hz)', value: 50 },
				{ label: 'NTSC (60 Hz)', value: 60 }
			],
			defaultValue: 50,
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'stereoLayout',
			label: 'Stereo',
			type: 'toggle',
			options: [
				{ label: 'ABC', value: 'ABC' },
				{ label: 'ACB', value: 'ACB' },
				{ label: 'CAB', value: 'CAB' },
				{ label: 'Mono', value: 'mono' }
			],
			defaultValue: 'ABC',
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'timerFrequency',
			label: 'Timer Frequency',
			type: 'select',
			options: [
				{ label: 'Same as chip frequency', value: 0 },
				{ label: 'Atari ST (2.4576 MHz)', value: 2457600 }
			],
			defaultValue: 0,
			group: 'chip',
			notifyAudioService: true,
			startNewRow: true
		},
		{
			key: 'timerScheme',
			label: 'Timer Scheme',
			type: 'toggle',
			options: [
				{ label: 'Simple', value: 'Simple' },
				{ label: 'Atari', value: 'Atari' }
			],
			defaultValue: 'Simple',
			group: 'chip',
			notifyAudioService: true
		},
		{
			key: 'tuningTableIndex',
			label: 'Tuning table',
			type: 'select',
			options: [
				{ label: 'ProTracker 3.3', value: 0 },
				{ label: 'Sound Tracker', value: 1 },
				{ label: 'ASM or PSC (1.75 MHz)', value: 2 },
				{ label: 'RealSound', value: 3 },
				{ label: 'Natural', value: 4 }
			],
			dynamicOption: {
				value: 5,
				label: (ctx) => {
					const freq = Number(ctx.chipFrequency ?? 1773400);
					const mhz = (freq / 1_000_000).toFixed(2);
					return `Custom (${mhz} MHz)`;
				}
			},
			defaultValue: 2,
			group: 'chip',
			notifyAudioService: true,
			startNewRow: true
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
			showWhen: { key: 'tuningTableIndex', value: 5 }
		}
	],
	resolveTuningTable(song) {
		const index = Number(song.tuningTableIndex ?? 2);
		const chipFreq = Number(song.chipFrequency ?? 1773400);
		const a4 = Math.min(880, Math.max(220, Number(song.a4TuningHz ?? 440)));
		return resolveAYTuningTable(index, chipFreq, a4);
	},
	tuningTableSettingKeys: ['tuningTableIndex', 'a4TuningHz', 'chipFrequency']
};

export function resolveAYTuningTable(
	index: number,
	chipFrequencyHz: number,
	a4TuningHz: number
): number[] {
	if (index >= 0 && index < PT3TuneTables.length) {
		return [...PT3TuneTables[index]];
	}
	if (index === 5) {
		return generate12TETTuningTable(chipFrequencyHz, a4TuningHz);
	}
	return [...PT3TuneTables[2]];
}
