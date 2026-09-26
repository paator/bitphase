import type { ChipSetting } from '../chips/base/schema';

export const PROJECT_FIELDS: ChipSetting[] = [
	{
		key: 'title',
		label: 'Title',
		type: 'text',
		group: 'project'
	},
	{
		key: 'author',
		label: 'Author',
		type: 'text',
		group: 'project'
	},
	{
		key: 'defaultPatternLength',
		label: 'Default Pattern Length',
		type: 'number',
		defaultValue: 64,
		group: 'project',
		min: 1,
		max: 256,
		step: 1,
		startNewRow: true
	},
	{
		key: 'tempo',
		label: 'Tempo',
		type: 'number',
		defaultValue: 0,
		group: 'project',
		min: 0,
		max: 255,
		step: 1,
		notifyAudioService: true
	},
	{
		key: 'initialSpeed',
		label: 'Initial Speed',
		type: 'number',
		defaultValue: 3,
		group: 'project',
		min: 1,
		max: 255,
		step: 1
	}
];
