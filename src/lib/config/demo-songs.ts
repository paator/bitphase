import type { MenuItem } from '../components/Menu/types';
import { FileImportService } from '../services/file/project/file-import';
import type { Project } from '../models/project';
import labels from '../../demo/labels.json';

const btpGlob = import.meta.glob('../../demo/*.btp', {
	query: '?url',
	import: 'default',
	eager: true
});

export function getDemoMenuItems(): MenuItem[] {
	const songs = Object.keys(btpGlob)
		.map((path) => {
			const file = path.split('/').pop() ?? '';
			const meta = (labels as Record<string, { label?: string; group?: string }>)[file];
			return {
				path,
				label: meta?.label ?? file.replace(/\.btp$/i, ''),
				group: meta?.group ?? 'Other'
			};
		})
		.sort(
			(a, b) =>
				a.group.localeCompare(b.group) ||
				a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
		);

	const items: MenuItem[] = [];
	let lastGroup = '';
	for (const song of songs) {
		if (song.group !== lastGroup) {
			if (lastGroup) items.push({ label: '', type: 'divider' });
			items.push({ label: song.group, type: 'header' });
			lastGroup = song.group;
		}
		items.push({
			label: song.label,
			type: 'normal',
			action: `open-demo:${song.path}`
		});
	}
	return items;
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
