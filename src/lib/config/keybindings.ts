import type { MenuItem } from '../components/Menu/types';
import { undoRedoStore } from '../stores/undo-redo.svelte';
import { clipboardStore } from '../stores/clipboard.svelte';

export const ACTION_UNDO = 'undo';
export const ACTION_REDO = 'redo';
export const ACTION_COPY = 'copy';
export const ACTION_CUT = 'cut';
export const ACTION_PASTE = 'paste';
export const ACTION_PASTE_WITHOUT_ERASING = 'paste-without-erasing';
export const ACTION_SELECT_ALL = 'select-all';
export const ACTION_INCREMENT_VALUE = 'increment-value';
export const ACTION_DECREMENT_VALUE = 'decrement-value';
export const ACTION_TRANSPOSE_OCTAVE_UP = 'transpose-octave-up';
export const ACTION_TRANSPOSE_OCTAVE_DOWN = 'transpose-octave-down';
export const ACTION_APPLY_SCRIPT = 'apply-script';
export const ACTION_TOGGLE_PLAYBACK = 'toggle-playback';
export const ACTION_PLAY_FROM_ROW = 'play-from-row';
export const ACTION_PLAY_FROM_CURSOR = 'play-from-cursor';
export const ACTION_PLAY_FROM_BEGINNING = 'play-from-beginning';
export const ACTION_PLAY_PATTERN = 'play-pattern';
export const ACTION_CYCLE_CHANNEL = 'cycle-channel';
export const ACTION_SWAP_CHANNEL_LEFT = 'swap-channel-left';
export const ACTION_SWAP_CHANNEL_RIGHT = 'swap-channel-right';
export const ACTION_TOGGLE_AUTO_ENVELOPE = 'toggle-auto-envelope';
export const ACTION_TOGGLE_ENVELOPE_AS_NOTE = 'toggle-envelope-as-note';
export const ACTION_PAGE_UP = 'page-up';
export const ACTION_PAGE_DOWN = 'page-down';
export const ACTION_HOME = 'home';
export const ACTION_HOME_COLUMN = 'home-column';
export const ACTION_END = 'end';
export const ACTION_END_COLUMN = 'end-column';
export const ACTION_OCTAVE_UP = 'octave-up';
export const ACTION_OCTAVE_DOWN = 'octave-down';
export const ACTION_SELECT_INSTRUMENT_OR_TABLE_IN_EDITOR = 'select-instrument-or-table-in-editor';
export const ACTION_PLAY_SOLO = 'play-solo';

export interface BindableAction {
	id: string;
	label: string;
	defaultShortcut: string;
}

export const BINDABLE_ACTIONS: BindableAction[] = [
	{ id: ACTION_UNDO, label: 'Undo', defaultShortcut: 'Mod+Z' },
	{ id: ACTION_REDO, label: 'Redo', defaultShortcut: 'Mod+Y' },
	{ id: ACTION_COPY, label: 'Copy', defaultShortcut: 'Mod+C' },
	{ id: ACTION_CUT, label: 'Cut', defaultShortcut: 'Mod+X' },
	{ id: ACTION_PASTE, label: 'Paste', defaultShortcut: 'Mod+V' },
	{ id: ACTION_PASTE_WITHOUT_ERASING, label: 'Magic paste', defaultShortcut: 'Mod+Shift+V' },
	{ id: ACTION_SELECT_ALL, label: 'Select All', defaultShortcut: 'Mod+A' },
	{ id: ACTION_INCREMENT_VALUE, label: 'Increment Value', defaultShortcut: '=' },
	{ id: ACTION_DECREMENT_VALUE, label: 'Decrement Value', defaultShortcut: '-' },
	{ id: ACTION_TRANSPOSE_OCTAVE_UP, label: 'Transpose Octave Up', defaultShortcut: 'Shift++' },
	{
		id: ACTION_TRANSPOSE_OCTAVE_DOWN,
		label: 'Transpose Octave Down',
		defaultShortcut: 'Shift+-'
	},
	{ id: ACTION_OCTAVE_UP, label: 'Octave Up (Editor)', defaultShortcut: '*' },
	{ id: ACTION_OCTAVE_DOWN, label: 'Octave Down (Editor)', defaultShortcut: '/' },
	{ id: ACTION_TOGGLE_PLAYBACK, label: 'Play / Pause', defaultShortcut: ' ' },
	{ id: ACTION_PLAY_FROM_CURSOR, label: 'Play from cursor', defaultShortcut: 'F7' },
	{ id: ACTION_PLAY_FROM_ROW, label: 'Play from cursor (hold)', defaultShortcut: 'Enter' },
	{ id: ACTION_PLAY_FROM_BEGINNING, label: 'Play from beginning', defaultShortcut: 'F5' },
	{ id: ACTION_PLAY_PATTERN, label: 'Play pattern (loop)', defaultShortcut: 'F6' },
	{ id: ACTION_CYCLE_CHANNEL, label: 'Cycle channel', defaultShortcut: '`' },
	{
		id: ACTION_SWAP_CHANNEL_LEFT,
		label: 'Swap channels left',
		defaultShortcut: 'Mod+Alt+ArrowLeft'
	},
	{
		id: ACTION_SWAP_CHANNEL_RIGHT,
		label: 'Swap channels right',
		defaultShortcut: 'Mod+Alt+ArrowRight'
	},
	{ id: ACTION_APPLY_SCRIPT, label: 'Apply Script...', defaultShortcut: 'Mod+Shift+S' },
	{
		id: ACTION_TOGGLE_AUTO_ENVELOPE,
		label: 'Toggle Auto Envelope',
		defaultShortcut: 'Mod+E'
	},
	{
		id: ACTION_TOGGLE_ENVELOPE_AS_NOTE,
		label: 'Toggle Envelope as Note',
		defaultShortcut: 'Mod+Shift+E'
	},
	{ id: ACTION_PAGE_UP, label: 'Page Up', defaultShortcut: 'PageUp' },
	{ id: ACTION_PAGE_DOWN, label: 'Page Down', defaultShortcut: 'PageDown' },
	{ id: ACTION_HOME, label: 'Home (first row)', defaultShortcut: 'Home' },
	{
		id: ACTION_HOME_COLUMN,
		label: 'Home (first column)',
		defaultShortcut: 'Mod+Home'
	},
	{ id: ACTION_END, label: 'End (last row)', defaultShortcut: 'End' },
	{
		id: ACTION_END_COLUMN,
		label: 'End (last column)',
		defaultShortcut: 'Mod+End'
	},
	{
		id: ACTION_SELECT_INSTRUMENT_OR_TABLE_IN_EDITOR,
		label: 'Select instrument or table in editor',
		defaultShortcut: 'Mod+LMB'
	},
	{ id: ACTION_PLAY_SOLO, label: 'Play solo / Unmute all', defaultShortcut: 'F8' }
];

export const GLOBAL_ACTION_IDS = new Set([
	ACTION_APPLY_SCRIPT,
	ACTION_TOGGLE_PLAYBACK,
	ACTION_PLAY_FROM_ROW,
	ACTION_PLAY_FROM_CURSOR,
	ACTION_PLAY_FROM_BEGINNING,
	ACTION_PLAY_PATTERN,
	ACTION_TOGGLE_AUTO_ENVELOPE,
	ACTION_TOGGLE_ENVELOPE_AS_NOTE,
	ACTION_OCTAVE_UP,
	ACTION_OCTAVE_DOWN
]);

export const PATTERN_EDITOR_ACTION_IDS = new Set(
	BINDABLE_ACTIONS.filter(
		(a) =>
			a.id !== ACTION_APPLY_SCRIPT &&
			a.id !== ACTION_PLAY_FROM_ROW &&
			a.id !== ACTION_PLAY_FROM_CURSOR &&
			a.id !== ACTION_PLAY_FROM_BEGINNING &&
			a.id !== ACTION_PLAY_PATTERN
	).map((a) => a.id)
);

const DISABLED_GETTERS: Partial<Record<string, () => boolean>> = {
	[ACTION_UNDO]: () => !undoRedoStore.canUndo,
	[ACTION_REDO]: () => !undoRedoStore.canRedo,
	[ACTION_PASTE]: () => !clipboardStore.hasData,
	[ACTION_PASTE_WITHOUT_ERASING]: () => !clipboardStore.hasData
};

const EDIT_MENU_ACTION_IDS = [
	ACTION_UNDO,
	ACTION_REDO,
	ACTION_COPY,
	ACTION_CUT,
	ACTION_PASTE,
	ACTION_PASTE_WITHOUT_ERASING,
	ACTION_INCREMENT_VALUE,
	ACTION_DECREMENT_VALUE,
	ACTION_TRANSPOSE_OCTAVE_UP,
	ACTION_TRANSPOSE_OCTAVE_DOWN,
	ACTION_SWAP_CHANNEL_LEFT,
	ACTION_SWAP_CHANNEL_RIGHT,
	ACTION_APPLY_SCRIPT
] as const;

const actionById = Object.fromEntries(BINDABLE_ACTIONS.map((a) => [a.id, a]));

const dividerAfter = new Set([ACTION_PASTE_WITHOUT_ERASING, ACTION_DECREMENT_VALUE]);

export function buildEditMenuItems(): MenuItem[] {
	const items: MenuItem[] = [];
	for (const id of EDIT_MENU_ACTION_IDS) {
		const action = actionById[id];
		if (!action) continue;
		items.push({
			label: action.label,
			type: 'normal',
			action: action.id,
			disabled: DISABLED_GETTERS[action.id]
		});
		if (dividerAfter.has(id)) {
			items.push({ label: 'divider', type: 'divider' });
		}
	}
	return items;
}
