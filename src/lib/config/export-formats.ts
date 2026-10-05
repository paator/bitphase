import type { MenuItem } from '../components/Menu/types';

export type ChipConfiguration = Record<string, number>;

export interface ExportFormat {
	label: string;
	action: string;
	isAvailable: (config: ChipConfiguration) => boolean;
}

function chipTotal(config: ChipConfiguration): number {
	let total = 0;
	for (const count of Object.values(config)) {
		total += count;
	}
	return total;
}

const EXPORT_FORMATS: ExportFormat[] = [
	{ label: 'WAV', action: 'export-wav', isAvailable: () => true },
	{ label: 'PSG', action: 'export-psg', isAvailable: (c) => c['ay'] === 1 },
	{ label: 'TAYM', action: 'export-taym', isAvailable: (c) => c['ay'] === 1 },
	{ label: 'PSG (ZIP)', action: 'export-psg-zip', isAvailable: (c) => (c['ay'] ?? 0) > 1 },
	{ label: 'TAYM (ZIP)', action: 'export-taym-zip', isAvailable: (c) => (c['ay'] ?? 0) > 1 },
	{ label: 'SNDH', action: 'export-sndh', isAvailable: (c) => c['ay'] === 1 },
	{
		label: 'VGM',
		action: 'export-vgm',
		isAvailable: (c) => {
			const ay = c['ay'] ?? 0;
			const nes = c['nes'] ?? 0;
			return ay <= 2 && nes <= 2 && ay + nes >= 1;
		}
	},
	{
		label: 'NSF',
		action: 'export-nsf',
		isAvailable: (c) => {
			const ay = c['ay'] ?? 0;
			const nes = c['nes'] ?? 0;
			return ay + nes >= 1 && ay <= 1 && nes <= 1 && chipTotal(c) === ay + nes;
		}
	}
];

export function buildChipConfiguration(chipTypes: string[]): ChipConfiguration {
	const config: ChipConfiguration = {};
	for (const type of chipTypes) {
		config[type] = (config[type] ?? 0) + 1;
	}
	return config;
}

export function getAvailableExportFormats(config: ChipConfiguration): ExportFormat[] {
	return EXPORT_FORMATS.filter((format) => format.isAvailable(config));
}

export function buildExportMenuItems(config: ChipConfiguration): MenuItem[] {
	return getAvailableExportFormats(config).map((format) => ({
		label: format.label,
		type: 'normal' as const,
		action: format.action
	}));
}
