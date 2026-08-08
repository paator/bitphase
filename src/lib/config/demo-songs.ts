import type { MenuItem } from '../components/Menu/types';
import { FileImportService } from '../services/file/project/file-import';
import type { Project } from '../models/project';

const btpGlob = import.meta.glob('../../demo/*.btp', {
	query: '?url',
	import: 'default',
	eager: true
});

const labelsGlob = import.meta.glob('../../demo/labels.json', {
	query: '?raw',
	import: 'default',
	eager: true
});

function getLabels(): Record<string, string> {
	const labelsPath = Object.keys(labelsGlob)[0];
	if (!labelsPath) return {};
	const raw = labelsGlob[labelsPath];
	const content = typeof raw === 'string' ? raw : (raw as { default?: string })?.default ?? '';
	if (!content) return {};
	try {
		return JSON.parse(content) as Record<string, string>;
	} catch {
		return {};
	}
}

const labels = getLabels();

function pathToFilename(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, '/');
	return normalized.split('/').pop() ?? '';
}

function pathToDefaultLabel(relativePath: string): string {
	const filename = pathToFilename(relativePath);
	return filename.replace(/\.btp$/i, '') || filename;
}

function getDisplayLabel(path: string): string {
	const filename = pathToFilename(path);
	return labels[filename] ?? pathToDefaultLabel(path);
}

export function getDemoMenuItems(): MenuItem[] {
	const paths = Object.keys(btpGlob).sort((a, b) =>
		getDisplayLabel(a).localeCompare(getDisplayLabel(b), 'en', { sensitivity: 'base' })
	);
	return paths.map((path) => ({
		label: getDisplayLabel(path),
		type: 'normal' as const,
		action: `open-demo:${path}`
	}));
}

export async function loadDemoProject(path: string): Promise<Project | null> {
	const url = btpGlob[path];
	if (typeof url !== 'string') return null;
	const response = await fetch(url);
	if (!response.ok) return null;
	const blob = await response.blob();
	const text = await FileImportService.decompressData(blob);
	return FileImportService.reconstructFromJsonAsync(text);
}

export const EMPTY_STATE_DEMO_PATH = '../../demo/man.btp';

export function loadEmptyStateDemoProject(): Promise<Project | null> {
	return loadDemoProject(EMPTY_STATE_DEMO_PATH);
}
