import type { MenuItem } from '../components/Menu/types';

export type ChipConfiguration = Record<string, number>;

export interface ExportFormat {
	label: string;
	action: string;
	isAvailable: (config: ChipConfiguration) => boolean;
}

const EXPORT_FORMATS: ExportFormat[] = [
	{ label: 'WAV', action: 'export-wav', isAvailable: () => true },
	{ label: 'PSG', action: 'export-psg', isAvailable: (c) => c['ay'] === 1 },
	{ label: 'PSG (ZIP)', action: 'export-psg-zip', isAvailable: (c) => (c['ay'] ?? 0) > 1 },
	{ label: 'SNDH', action: 'export-sndh', isAvailable: (c) => c['ay'] === 1 }
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
