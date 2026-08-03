import type { TreeNode } from '../components/TreeView/types';
import { parseInstrumentPreset } from '../services/instrument/instrument-preset';

const glob = import.meta.glob('../../presets/instruments/**/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
});

export type InstrumentPresetData = {
	load: () => Promise<string>;
};

function pathToCategoryAndLabel(relativePath: string): { category: string; labelFromFilename: string } {
	const normalized = relativePath.replace(/\\/g, '/');
	const parts = normalized.split('/');
	const filename = parts[parts.length - 1] ?? '';
	const category = parts[parts.length - 2] ?? 'Other';
	const labelFromFilename = filename.replace(/\.json$/i, '') || filename;
	return { category, labelFromFilename };
}

function getNameFromPresetContent(raw: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	return parseInstrumentPreset(parsed)?.name || null;
}

export function getInstrumentPresetTree(): TreeNode<InstrumentPresetData>[] {
	const byCategory = new Map<string, TreeNode<InstrumentPresetData>[]>();

	for (const path of Object.keys(glob)) {
		const { category, labelFromFilename } = pathToCategoryAndLabel(path);
		const raw = glob[path];
		const content = typeof raw === 'string' ? raw : (raw as { default?: string })?.default ?? '';
		const label = (content && getNameFromPresetContent(content)) ?? labelFromFilename;
		const load = async (): Promise<string> =>
			content ? Promise.resolve(content) : Promise.reject(new Error(`Preset not found: ${path}`));
		const id = path.replace(/[/\\]/g, '_');
		const node: TreeNode<InstrumentPresetData> = { id, label, data: { load } };

		const list = byCategory.get(category) ?? [];
		list.push(node);
		byCategory.set(category, list);
	}

	const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	return categories.map(([category, children]) => ({
		id: `cat_${category}`,
		label: category.charAt(0).toUpperCase() + category.slice(1),
		children: children.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
	}));
}
