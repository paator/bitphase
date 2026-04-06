import { describe, expect, it } from 'vitest';
import { buildChipConfiguration, buildExportMenuItems } from '../../../src/lib/config/export-formats';

describe('export formats', () => {
	it('shows PSG and SNDH for single AY', () => {
		const config = buildChipConfiguration(['ay']);
		const items = buildExportMenuItems(config);
		const labels = items.map((item) => item.label);

		expect(labels).toContain('WAV');
		expect(labels).toContain('PSG');
		expect(labels).toContain('SNDH');
		expect(labels).not.toContain('PSG (ZIP)');
	});

	it('shows PSG (ZIP) for multiple AY chips', () => {
		const config = buildChipConfiguration(['ay', 'ay']);
		const items = buildExportMenuItems(config);
		const labels = items.map((item) => item.label);

		expect(labels).toContain('WAV');
		expect(labels).toContain('PSG (ZIP)');
		expect(labels).not.toContain('PSG');
		expect(labels).not.toContain('SNDH');
	});
});
