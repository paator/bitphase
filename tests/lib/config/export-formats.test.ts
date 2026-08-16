import { describe, expect, it } from 'vitest';
import { buildChipConfiguration, buildExportMenuItems } from '../../../src/lib/config/export-formats';

describe('export formats', () => {
	it('shows PSG and SNDH for single AY', () => {
		const config = buildChipConfiguration(['ay']);
		const items = buildExportMenuItems(config);
		const labels = items.map((item) => item.label);

		expect(labels).toContain('WAV');
		expect(labels).toContain('PSG');
		expect(labels).toContain('TAYM');
		expect(labels).toContain('SNDH');
		expect(labels).toContain('VGM');
		expect(labels).not.toContain('PSG (ZIP)');
		expect(labels).not.toContain('TAYM (ZIP)');
	});

	it('shows PSG (ZIP) for multiple AY chips', () => {
		const config = buildChipConfiguration(['ay', 'ay']);
		const items = buildExportMenuItems(config);
		const labels = items.map((item) => item.label);

		expect(labels).toContain('WAV');
		expect(labels).toContain('PSG (ZIP)');
		expect(labels).toContain('VGM');
		expect(labels).toContain('TAYM (ZIP)');
		expect(labels).not.toContain('PSG');
		expect(labels).not.toContain('TAYM');
		expect(labels).not.toContain('SNDH');
	});

	it('shows VGM for NES and mixed chips within dual limits', () => {
		expect(buildExportMenuItems(buildChipConfiguration(['nes'])).map((i) => i.label)).toContain(
			'VGM'
		);
		expect(
			buildExportMenuItems(buildChipConfiguration(['ay', 'ay', 'nes'])).map((i) => i.label)
		).toContain('VGM');
	});

	it('hides VGM when more than two chips of the same type', () => {
		expect(
			buildExportMenuItems(buildChipConfiguration(['ay', 'ay', 'ay'])).map((i) => i.label)
		).not.toContain('VGM');
		expect(
			buildExportMenuItems(buildChipConfiguration(['nes', 'nes', 'nes'])).map((i) => i.label)
		).not.toContain('VGM');
	});
});
