import { describe, expect, it } from 'vitest';
import {
	buildPreviewPattern,
	clampVolumeInput,
	filterVolumeInput,
	notesForProcessor,
	parseClampedHex,
	parseTableChar,
	previewVolumeValue,
	sanitizeHexInput,
	sanitizeTableInput
} from '@/lib/chips/base/preview-row-utils';
import { AY_CHIP_SCHEMA } from '@/lib/chips/ay/schema';
import { NES_CHIP_SCHEMA } from '@/lib/chips/nes/schema';
import { NoteName } from '@/lib/models/song';

describe('preview-row-utils', () => {
	it('parses and sanitizes hex input', () => {
		expect(parseClampedHex('00FF', 4, 0xffff)).toBe(0xff);
		expect(parseClampedHex('zzzz', 4, 0xffff)).toBe(0);
		expect(parseClampedHex('20', 2, 0x1f)).toBe(0x1f);
		expect(sanitizeHexInput('ab12zz', 4)).toBe('AB12');
	});

	it('parses table display characters', () => {
		expect(parseTableChar('')).toBe(0);
		expect(parseTableChar('0')).toBe(-1);
		expect(parseTableChar('1')).toBe(1);
		expect(parseTableChar('A')).toBe(10);
		expect(sanitizeTableInput('g')).toBe('G');
		expect(sanitizeTableInput('!')).toBe('');
	});

	it('clamps volume to 1-F', () => {
		expect(filterVolumeInput('A', 'F')).toBe('A');
		expect(filterVolumeInput('0', 'F')).toBe('F');
		expect(filterVolumeInput('', 'F')).toBe('');
		expect(clampVolumeInput('')).toBe('F');
		expect(clampVolumeInput('0')).toBe('F');
		expect(clampVolumeInput('c')).toBe('C');
		expect(previewVolumeValue('')).toBe(15);
		expect(previewVolumeValue('0')).toBe(1);
		expect(previewVolumeValue('A')).toBe(10);
	});

	it('splits notes across processors by channel count', () => {
		expect(notesForProcessor(['C-4', 'D-4', 'E-4', 'F-4'], 0, 3)).toEqual([
			'C-4',
			'D-4',
			'E-4'
		]);
		expect(notesForProcessor(['C-4', 'D-4', 'E-4', 'F-4'], 1, 3)).toEqual([
			'F-4',
			'OFF',
			'OFF'
		]);
	});

	it('builds an AY preview pattern with three channels', () => {
		const pattern = buildPreviewPattern({
			schema: AY_CHIP_SCHEMA,
			instrumentId: '02',
			table: 'A',
			volume: 'C',
			noteStrings: ['C-4', 'E-4']
		});

		expect(pattern.channels).toHaveLength(3);
		expect(pattern.channels[0].rows[0].instrument).toBe(2);
		expect(pattern.channels[0].rows[0].table).toBe(10);
		expect(pattern.channels[0].rows[0].volume).toBe(12);
		expect(pattern.channels[0].rows[0].note.name).toBe(NoteName.C);
		expect(pattern.channels[1].rows[0].note.name).toBe(NoteName.E);
		expect(pattern.channels[2].rows[0].note.name).toBe(NoteName.Off);
	});

	it('builds an NES preview pattern with all schema channels', () => {
		const pattern = buildPreviewPattern({
			schema: NES_CHIP_SCHEMA,
			instrumentId: '01',
			table: '1',
			volume: 'F',
			noteStrings: ['C-4', 'D-4', 'E-4', 'F-4', 'G-4']
		});

		expect(pattern.channels).toHaveLength(5);
		expect(pattern.channels[4].rows[0].note.name).toBe(NoteName.G);
		expect(pattern.channels[0].rows[0].envelopeShape).toBeUndefined();
	});
});
