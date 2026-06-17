import type { MenuItem } from '../components/Menu/types';
import { buildEditMenuItems } from './keybindings';
import { getDemoMenuItems } from './demo-songs';
import { buildExportMenuItems, type ChipConfiguration } from './export-formats';

const demoMenuItems: MenuItem[] = getDemoMenuItems();

export const editMenuItems: MenuItem[] = buildEditMenuItems();

export function buildMenuItems(chipConfig: ChipConfiguration): MenuItem[] {
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
							items: [
								{ label: 'AY/YM', type: 'normal', action: 'new-song-ay' },
								{ label: '2A03 / 2A07', type: 'normal', action: 'new-song-nes' }
							]
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
					label: 'Appearance',
					type: 'normal',
					action: 'appearance'
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
				{ label: 'Effects', type: 'normal', action: 'effects' },
				{ label: 'TMR Checker', type: 'normal', action: 'tmr-checker' },
				{ label: 'About', type: 'normal', action: 'about' }
			]
		}
	];
}
