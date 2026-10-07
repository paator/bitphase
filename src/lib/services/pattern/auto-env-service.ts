import { NoteName, type Pattern } from '../../models/song';
import { isPitchedNoteName } from '../../utils/note-utils';
import type { AutoEnvRatio } from '../../stores/auto-env.svelte';

export class AutoEnvService {
	static calculateEnvelopeValue(
		noteIndex: number,
		envelopeShape: number,
		tuningTable: number[],
		ratio: AutoEnvRatio
	): number | null {
		if (noteIndex < 0 || noteIndex >= tuningTable.length) {
			return null;
		}

		const divisor = this.getEnvelopeDivisor(envelopeShape);
		if (divisor === null) {
			return null;
		}

		const noteFreq = tuningTable[noteIndex];
		const envelopeValue = Math.round(
			(noteFreq * ratio.numerator) / ratio.denominator / divisor
		);

		return envelopeValue;
	}

	static applyAutoEnvelope(
		pattern: Pattern,
		rowIndex: number,
		channelIndex: number,
		tuningTable: number[],
		ratio: AutoEnvRatio
	): Pattern | null {
		if (rowIndex < 0 || rowIndex >= pattern.length) {
			return null;
		}

		if (channelIndex < 0 || channelIndex >= pattern.channels.length) {
			return null;
		}

		const channel = pattern.channels[channelIndex];
		const row = channel.rows[rowIndex];
		const noteValue = row.note;

		if (!noteValue || typeof noteValue !== 'object' || !('octave' in noteValue)) {
			return null;
		}

		const note = noteValue as { name: number; octave: number };
		if (!isPitchedNoteName(note.name as NoteName)) {
			return null;
		}

		const noteIndex = (note.octave - 1) * 12 + (note.name - 2);

		const envelopeShape =
			typeof row.envelopeShape === 'number'
				? row.envelopeShape
				: parseInt(String(row.envelopeShape) || '0');

		const envelopeValue = this.calculateEnvelopeValue(
			noteIndex,
			envelopeShape,
			tuningTable,
			ratio
		);

		if (envelopeValue === null) {
			return null;
		}

		const patternRow = pattern.patternRows[rowIndex];
		if (
			typeof patternRow.envelopeValue === 'number' &&
			patternRow.envelopeValue === envelopeValue
		) {
			return null;
		}

		const updatedPattern = structuredClone(pattern);
		updatedPattern.patternRows[rowIndex].envelopeValue = envelopeValue;

		return updatedPattern;
	}

	static applyAutoEnvelopeIfEligible(
		pattern: Pattern,
		rowIndex: number,
		fieldInfo:
			| { channelIndex: number; fieldType?: string; fieldKey?: string }
			| null
			| undefined,
		tuningTable: number[],
		ratio: AutoEnvRatio,
		enabled: boolean
	): Pattern {
		if (!enabled || !fieldInfo || fieldInfo.channelIndex < 0) {
			return pattern;
		}
		if (fieldInfo.fieldType !== 'note' && fieldInfo.fieldKey !== 'envelopeShape') {
			return pattern;
		}
		return (
			this.applyAutoEnvelope(pattern, rowIndex, fieldInfo.channelIndex, tuningTable, ratio) ??
			pattern
		);
	}

	private static getEnvelopeDivisor(envelopeShape: number): number | null {
		switch (envelopeShape) {
			case 8:
			case 12:
				return 16;
			case 10:
			case 14:
				return 32;
			default:
				return null;
		}
	}
}
