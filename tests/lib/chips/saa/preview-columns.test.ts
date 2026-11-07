import { describe, expect, it } from 'vitest';
import { buildPreviewPattern } from '@/lib/chips/base/preview-row-utils';
import { SAA_CHIP_SCHEMA } from '@/lib/chips/saa/schema';
import { NoteName, type Pattern } from '@/lib/models/song';
import {
	applySaaPreviewColumns,
	filterSaaEnvelopeInput,
	filterSaaNoiseInput,
	saaPatternColumnValue
} from '@/lib/chips/saa/preview-columns';

function previewPattern(noteStrings: string[]): Pattern {
	return buildPreviewPattern({
		schema: SAA_CHIP_SCHEMA,
		instrumentId: '01',
		table: '',
		volume: 'F',
		left: 'F',
		right: 'F',
		noteStrings
	});
}

function expectNote(pattern: Pattern, channel: number, name: NoteName, octave = 0) {
	const note = pattern.channels[channel].rows[0].note;
	expect(note.name).toBe(name);
	expect(note.octave).toBe(octave);
}

describe('saa preview columns', () => {
	it('encodes blank and zero the way the N and E columns do', () => {
		expect(saaPatternColumnValue('')).toBe(0);
		expect(saaPatternColumnValue('0')).toBe(-1);
		expect(saaPatternColumnValue('3')).toBe(3);
		expect(saaPatternColumnValue('c')).toBe(12);
	});

	it('keeps noise clocks 0-3 and envelope modes 0-C', () => {
		expect(filterSaaNoiseInput('2', '')).toBe('2');
		expect(filterSaaNoiseInput('4', '1')).toBe('1');
		expect(filterSaaNoiseInput('g', '3')).toBe('3');
		expect(filterSaaNoiseInput('', '3')).toBe('');
		expect(filterSaaEnvelopeInput('C', '')).toBe('C');
		expect(filterSaaEnvelopeInput('d', 'A')).toBe('A');
		expect(filterSaaEnvelopeInput('', 'A')).toBe('');
	});

	it('writes the same noise and envelope onto both channel groups', () => {
		const pattern = previewPattern(['C-4', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF']);

		applySaaPreviewColumns(pattern, { noise: '3', envelope: '' });

		expect(pattern.patternRows[0].noise0).toBe(3);
		expect(pattern.patternRows[0].noise1).toBe(3);
		expect(pattern.patternRows[0].env0).toBe(0);
		expect(pattern.patternRows[0].env1).toBe(0);
		expectNote(pattern, 0, NoteName.C, 4);
	});

	it('plays an envelope on the third channel and clocks it from the second', () => {
		const pattern = previewPattern(['OFF', 'OFF', 'OFF', 'C-4', 'OFF', 'OFF']);

		applySaaPreviewColumns(pattern, { noise: '', envelope: 'A', clockNote: 'G-2' });

		expect(pattern.patternRows[0].env0).toBe(10);
		expect(pattern.patternRows[0].env1).toBe(10);
		for (const channel of [0, 3]) expectNote(pattern, channel, NoteName.Off);
		for (const channel of [1, 4]) {
			expectNote(pattern, channel, NoteName.G, 2);
			expect(pattern.channels[channel].rows[0].effects[0]).toMatchObject({
				effect: 'E'.charCodeAt(0),
				delay: 6,
				parameter: 0
			});
		}
		for (const channel of [2, 5]) expectNote(pattern, channel, NoteName.C, 4);
	});

	it('leaves the clock channels empty when no rate note is set', () => {
		const pattern = previewPattern(['A-3', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF']);

		applySaaPreviewColumns(pattern, { noise: '', envelope: '1' });

		expectNote(pattern, 1, NoteName.Off);
		expectNote(pattern, 2, NoteName.A, 3);
		expectNote(pattern, 4, NoteName.Off);
		expectNote(pattern, 5, NoteName.A, 3);
	});

	it('leaves channel placement alone when the envelope is off', () => {
		const pattern = previewPattern(['OFF', 'D-5', 'OFF', 'OFF', 'OFF', 'OFF']);

		applySaaPreviewColumns(pattern, { noise: '', envelope: '0', clockNote: 'C-2' });

		expect(pattern.patternRows[0].env0).toBe(-1);
		expectNote(pattern, 1, NoteName.D, 5);
	});
});
