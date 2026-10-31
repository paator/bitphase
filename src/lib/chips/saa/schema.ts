import type { ChipSchema } from '../base/schema';
import { saaStickyChannelEffectGroup } from './effects';

export const SAA_SAM_CLOCK = 8_000_000;
export const SAA_CMS_CLOCK = 7_159_090;

const TUNING_TABLE_LENGTH = 96;
const A4_NOTE_INDEX = 45;

export function saaToneFrequency(clockHz: number, octave: number, freqByte: number): number {
	const divisor = 511 - freqByte;
	if (divisor <= 0 || clockHz <= 0) return 0;
	return ((clockHz / 512) * 2 ** octave) / divisor;
}

export function resolveSaaTuningTable(clockHz: number, a4Hz: number): number[] {
	const table: number[] = [];
	for (let note = 0; note < TUNING_TABLE_LENGTH; note++) {
		const target = a4Hz * 2 ** ((note - A4_NOTE_INDEX) / 12);
		let bestPacked = 0;
		let bestError = Number.POSITIVE_INFINITY;
		for (let octave = 0; octave < 8; octave++) {
			if (target <= 0) break;
			const span = ((clockHz / 512) * 2 ** octave) / target;
			let freqByte = Math.round(511 - span);
			if (freqByte < 0) freqByte = 0;
			if (freqByte > 255) freqByte = 255;
			const frequency = saaToneFrequency(clockHz, octave, freqByte);
			if (frequency <= 0) continue;
			const error = Math.abs(Math.log(frequency / target));
			if (error < bestError) {
				bestError = error;
				bestPacked = (octave << 8) | freqByte;
			}
		}
		table.push(bestPacked);
	}
	return table;
}

const SAA_DEFAULT_TUNING_TABLE = resolveSaaTuningTable(SAA_SAM_CLOCK, 440);

export const SAA_CHIP_SCHEMA: ChipSchema = {
	chipType: 'saa',
	defaultTuningTable: SAA_DEFAULT_TUNING_TABLE,
	stickyChannelEffectGroup: saaStickyChannelEffectGroup,
	channelLabels: ['A', 'B', 'C', 'D', 'E', 'F'],
	template: '{note} {instrument}{table}{left}{right} {effect}',
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
		left: {
			key: 'left',
			type: 'hex',
			length: 1,
			color: 'patternText',
			selectable: 'character',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'nonZero'
		},
		right: {
			key: 'right',
			type: 'hex',
			length: 1,
			color: 'patternText',
			selectable: 'character',
			allowZeroValue: true,
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
	globalFields: {
		noise0: {
			key: 'noise0',
			type: 'hex',
			length: 1,
			color: 'patternNoise',
			selectable: 'character',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'any'
		},
		noise1: {
			key: 'noise1',
			type: 'hex',
			length: 1,
			color: 'patternNoise',
			selectable: 'character',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'any'
		},
		env0: {
			key: 'env0',
			type: 'hex',
			length: 1,
			color: 'patternEnvelope',
			selectable: 'character',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'any'
		},
		env1: {
			key: 'env1',
			type: 'hex',
			length: 1,
			color: 'patternEnvelope',
			selectable: 'character',
			allowZeroValue: true,
			usedForBacktracking: true,
			backtrackWhen: 'any'
		}
	},
	globalAnchors: [
		{ field: 'noise0', beforeChannel: 0 },
		{ field: 'env0', beforeChannel: 2 },
		{ field: 'noise1', beforeChannel: 3 },
		{ field: 'env1', beforeChannel: 5 }
	],
	globalColumnLabels: {
		noise0: 'N',
		noise1: 'N',
		env0: 'E',
		env1: 'E'
	},
	settings: [
		{
			key: 'chipFrequency',
			label: 'Chip Frequency',
			type: 'select',
			options: [
				{ label: 'SAM Coupé (8 MHz)', value: SAA_SAM_CLOCK },
				{ label: 'CMS / Game Blaster (7.159 MHz)', value: SAA_CMS_CLOCK }
			],
			defaultValue: SAA_SAM_CLOCK,
			group: 'chip',
			notifyAudioService: true
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
			min: 1,
			max: 1000,
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
		const clock = Number(song.chipFrequency ?? SAA_SAM_CLOCK);
		const a4 = Math.min(880, Math.max(220, Number(song.a4TuningHz ?? 440)));
		return resolveSaaTuningTable(clock, a4);
	},
	tuningTableSettingKeys: ['a4TuningHz', 'chipFrequency']
};
