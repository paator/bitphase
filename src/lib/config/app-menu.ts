import type { MenuItem } from '../components/Menu/types';
import { buildEditMenuItems } from './keybindings';
import { getDemoMenuItems } from './demo-songs';
import { buildExportMenuItems, type ChipConfiguration } from './export-formats';

const demoMenuItems: MenuItem[] = getDemoMenuItems();

export const editMenuItems: MenuItem[] = buildEditMenuItems();

export type NewSongOption = {
	label: string;
	action: string;
	examples: string;
};

export const newSongOptions: NewSongOption[] = [
	{
		label: 'AY/YM',
		action: 'new-song-ay',
		examples: 'ZX Spectrum, Amstrad CPC, Atari ST…'
	},
	{
		label: '2A03 / 2A07',
		action: 'new-song-nes',
		examples: 'NES, Famicom'
	},
	{
		label: 'SAA1099 (WIP)',
		action: 'new-song-saa',
		examples: 'SAM Coupé, Creative Music System'
	}
];

export const newSongMenuItems: MenuItem[] = newSongOptions.map((option) => ({
	label: option.label,
	type: 'normal',
	action: option.action
}));

export function buildMenuItems(
	chipConfig: ChipConfiguration,
	experimentalFeatures = false
): MenuItem[] {
	return [
		{
			label: 'File',
			items: [
				{
					label: 'New',
					type: 'expandable',
					items: [
						{ label: 'Project', type: 'normal', icon: '📁', action: 'new-project' },
						{
							label: 'Song',
							type: 'expandable',
							icon: '📁',
							items: newSongMenuItems
						}
					]
				},
				{ label: 'Open', type: 'normal', action: 'open' },
				{ label: 'Import Module', type: 'normal', action: 'import-module' },
				{ label: 'Save', type: 'normal', action: 'save' },
				{
					label: 'Export',
					type: 'expandable',
					items: buildExportMenuItems(chipConfig)
				}
			]
		},
		{
			label: 'Edit',
			items: buildEditMenuItems()
		},
		{
			label: 'View',
			items: [
				{
					label: 'Tracker',
					type: 'normal',
					action: 'edit-view-tracker'
				},
				...(experimentalFeatures
					? [
							{
								label: 'Piano roll',
								type: 'normal' as const,
								action: 'edit-view-piano-roll'
							}
						]
					: []),
				{
					label: 'Appearance',
					type: 'normal',
					action: 'appearance'
				},
				{
					label: 'Toggle expand panel',
					type: 'normal',
					action: 'toggle-expand-panel'
				}
			]
		},
		{
			label: 'Settings',
			type: 'normal',
			action: 'settings'
		},
		{
			label: 'Help',
			items: [
				{
					label: 'Demo songs',
					type: 'expandable',
					items:
						demoMenuItems.length > 0
							? demoMenuItems
							: [{ label: 'No demo songs', type: 'normal', disabled: true }]
				},
				{ label: 'Documentation', type: 'normal', action: 'documentation' },
				{ label: 'Effects', type: 'normal', action: 'effects' },
				{ label: 'About', type: 'normal', action: 'about' }
			]
		}
	];
}
