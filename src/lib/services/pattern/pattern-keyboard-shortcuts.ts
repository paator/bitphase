import type { Pattern } from '../../models/song';
import type { NavigationState, NavigationContext } from './pattern-navigation';
import { PatternNavigationService } from './pattern-navigation';
import { ProgressiveSelectionService } from './progressive-selection-service';
import { ShortcutString } from '../../utils/shortcut-string';
import { keybindingsStore } from '../../stores/keybindings.svelte';
import {
	PATTERN_EDITOR_ACTION_IDS,
	GLOBAL_ACTION_IDS,
	ACTION_UNDO,
	ACTION_REDO,
	ACTION_COPY,
	ACTION_CUT,
	ACTION_PASTE,
	ACTION_PASTE_WITHOUT_ERASING,
	ACTION_SELECT_ALL,
	ACTION_INCREMENT_VALUE,
	ACTION_DECREMENT_VALUE,
	ACTION_TRANSPOSE_OCTAVE_UP,
	ACTION_TRANSPOSE_OCTAVE_DOWN,
	ACTION_APPLY_SCRIPT,
	ACTION_TOGGLE_PLAYBACK,
	ACTION_CYCLE_CHANNEL,
	ACTION_SWAP_CHANNEL_LEFT,
	ACTION_SWAP_CHANNEL_RIGHT,
	ACTION_PLAY_SOLO,
	ACTION_PAGE_UP,
	ACTION_PAGE_DOWN,
	ACTION_HOME,
	ACTION_HOME_COLUMN,
	ACTION_END,
	ACTION_END_COLUMN
} from '../../config/keybindings';

export interface PatternKeyboardShortcutsContext {
	isPlaying: boolean;
	selectedColumn: number;
	selectedRow: number;
	currentPatternOrderIndex: number;
	pattern: Pattern;
	hasSelection: () => boolean;
	onUndo: () => void;
	onRedo: () => void;
	onCopy: () => void;
	onCut: () => void;
	onPaste: () => void;
	onPasteWithoutErasing: () => void;
	onDelete: () => void;
	onSelectAll: (column: number, startRow: number, endRow: number) => void;
	onSelectProgressive: (
		startRow: number,
		endRow: number,
		startColumn: number,
		endColumn: number
	) => void;
	onTogglePlayback: () => void;
	onPausePlayback: () => void;
	onMoveRow: (delta: number) => void;
	onMoveColumn: (delta: number) => void;
	onSetSelectedRow: (row: number) => void;
	onSetSelectedColumn: (column: number) => void;
	onSetCurrentPatternOrderIndex: (index: number) => void;
	onClearSelection: () => void;
	onSetSelectionAnchor: (row: number, column: number) => void;
	onExtendSelection: (row: number, column: number) => void;
	onIncrementFieldValue: (
		delta: number,
		isOctaveIncrement?: boolean,
		keyForPreview?: string
	) => void;
	onSwapChannelLeft: () => void;
	onSwapChannelRight: () => void;
	onToggleSolo?: () => void;
	selectionStartRow: number | null;
	selectionStartColumn: number | null;
	selectionEndRow: number | null;
	selectionEndColumn: number | null;
	getPatternRowData: (pattern: Pattern, rowIndex: number) => string;
	navigationContext: NavigationContext;
}

export interface KeyboardShortcutResult {
	handled: boolean;
	shouldPreventDefault: boolean;
}

function dispatchCommandAction(
	action: string,
	ctx: PatternKeyboardShortcutsContext,
	event?: KeyboardEvent
): boolean {
	switch (action) {
		case ACTION_UNDO:
			ctx.onUndo();
			return true;
		case ACTION_REDO:
			ctx.onRedo();
			return true;
		case ACTION_COPY:
			ctx.onCopy();
			return true;
		case ACTION_CUT:
			ctx.onCut();
			return true;
		case ACTION_PASTE:
			ctx.onPaste();
			return true;
		case ACTION_PASTE_WITHOUT_ERASING:
			ctx.onPasteWithoutErasing();
			return true;
		case ACTION_SELECT_ALL:
			if (!ctx.isPlaying) {
				const result = ProgressiveSelectionService.selectAll(
					ctx.pattern,
					ctx.selectedColumn,
					ctx.selectionStartRow,
					ctx.selectionStartColumn,
					ctx.selectionEndRow,
					ctx.selectionEndColumn,
					ctx.navigationContext.getCellPositions,
					ctx.getPatternRowData,
					ctx.navigationContext.schema
				);
				ctx.onSelectProgressive(
					result.startRow,
					result.endRow,
					result.startColumn,
					result.endColumn
				);
			}
			return true;
		case ACTION_INCREMENT_VALUE:
			if (!ctx.isPlaying) {
				ctx.onIncrementFieldValue(1, false, event?.key);
			}
			return true;
		case ACTION_DECREMENT_VALUE:
			if (!ctx.isPlaying) {
				ctx.onIncrementFieldValue(-1, false, event?.key);
			}
			return true;
		case ACTION_TRANSPOSE_OCTAVE_UP:
			if (!ctx.isPlaying) {
				ctx.onIncrementFieldValue(1, true, event?.key);
			}
			return true;
		case ACTION_TRANSPOSE_OCTAVE_DOWN:
			if (!ctx.isPlaying) {
				ctx.onIncrementFieldValue(-1, true, event?.key);
			}
			return true;
		case ACTION_TOGGLE_PLAYBACK:
			if (ctx.isPlaying) {
				ctx.onPausePlayback();
			} else {
				ctx.onTogglePlayback();
			}
			return true;
		case ACTION_CYCLE_CHANNEL:
			if (!ctx.isPlaying) {
				const newState = PatternNavigationService.moveToNextChannel(
					{
						selectedRow: ctx.selectedRow,
						currentPatternOrderIndex: ctx.currentPatternOrderIndex,
						selectedColumn: ctx.selectedColumn
					},
					ctx.navigationContext
				);
				ctx.onClearSelection();
				ctx.onSetSelectedColumn(newState.selectedColumn);
			}
			return true;
		case ACTION_SWAP_CHANNEL_LEFT:
			if (!ctx.isPlaying) {
				ctx.onSwapChannelLeft();
			}
			return true;
		case ACTION_SWAP_CHANNEL_RIGHT:
			if (!ctx.isPlaying) {
				ctx.onSwapChannelRight();
			}
			return true;
		case ACTION_PLAY_SOLO:
			ctx.onToggleSolo?.();
			return true;
		case ACTION_PAGE_UP:
			if (!ctx.isPlaying) {
				if (event?.shiftKey) {
					if (!ctx.hasSelection()) {
						ctx.onSetSelectionAnchor(ctx.selectedRow, ctx.selectedColumn);
					}
					const newState = PatternNavigationService.moveRow(
						{
							selectedRow: ctx.selectedRow,
							currentPatternOrderIndex: ctx.currentPatternOrderIndex,
							selectedColumn: ctx.selectedColumn
						},
						ctx.navigationContext,
						-16
					);
					ctx.onExtendSelection(newState.selectedRow, newState.selectedColumn);
					ctx.onSetSelectedRow(newState.selectedRow);
					if (newState.currentPatternOrderIndex !== ctx.currentPatternOrderIndex) {
						ctx.onSetCurrentPatternOrderIndex(newState.currentPatternOrderIndex);
					}
				} else {
					ctx.onClearSelection();
					ctx.onMoveRow(-16);
				}
			}
			return true;
		case ACTION_PAGE_DOWN:
			if (!ctx.isPlaying) {
				if (event?.shiftKey) {
					if (!ctx.hasSelection()) {
						ctx.onSetSelectionAnchor(ctx.selectedRow, ctx.selectedColumn);
					}
					const newState = PatternNavigationService.moveRow(
						{
							selectedRow: ctx.selectedRow,
							currentPatternOrderIndex: ctx.currentPatternOrderIndex,
							selectedColumn: ctx.selectedColumn
						},
						ctx.navigationContext,
						16
					);
					ctx.onExtendSelection(newState.selectedRow, newState.selectedColumn);
					ctx.onSetSelectedRow(newState.selectedRow);
					if (newState.currentPatternOrderIndex !== ctx.currentPatternOrderIndex) {
						ctx.onSetCurrentPatternOrderIndex(newState.currentPatternOrderIndex);
					}
				} else {
					ctx.onClearSelection();
					ctx.onMoveRow(16);
				}
			}
			return true;
		case ACTION_HOME:
			if (!ctx.isPlaying) {
				if (event?.shiftKey) {
					ctx.onExtendSelection(0, ctx.selectedColumn);
				} else {
					ctx.onClearSelection();
				}
				ctx.onSetSelectedRow(0);
			}
			return true;
		case ACTION_HOME_COLUMN:
			if (event?.shiftKey) {
				ctx.onExtendSelection(ctx.selectedRow, 0);
			} else {
				ctx.onClearSelection();
			}
			ctx.onSetSelectedColumn(0);
			return true;
		case ACTION_END:
			if (!ctx.isPlaying) {
				if (event?.shiftKey) {
					ctx.onExtendSelection(ctx.pattern.length - 1, ctx.selectedColumn);
				} else {
					ctx.onClearSelection();
				}
				ctx.onSetSelectedRow(ctx.pattern.length - 1);
			}
			return true;
		case ACTION_END_COLUMN: {
			const navigationState = PatternNavigationService.moveToRowEnd(
				{
					selectedRow: ctx.selectedRow,
					currentPatternOrderIndex: ctx.currentPatternOrderIndex,
					selectedColumn: ctx.selectedColumn
				},
				ctx.navigationContext
			);
			if (event?.shiftKey) {
				ctx.onExtendSelection(ctx.selectedRow, navigationState.selectedColumn);
			} else {
				ctx.onClearSelection();
			}
			ctx.onSetSelectedColumn(navigationState.selectedColumn);
			return true;
		}
		default:
			return false;
	}
}

export class PatternKeyboardShortcutsService {
	static handleKeyDown(
		event: KeyboardEvent,
		shortcutsContext: PatternKeyboardShortcutsContext
	): KeyboardShortcutResult {
		const isModifier = event.shiftKey;
		const key = event.key.toLowerCase();

		const shortcut = ShortcutString.fromEvent(event);
		const action = keybindingsStore.getActionForShortcut(shortcut);
		if (action !== null) {
			if (PATTERN_EDITOR_ACTION_IDS.has(action)) {
				const result = dispatchCommandAction(action, shortcutsContext, event);
				if (result) {
					return { handled: true, shouldPreventDefault: true };
				}
			}
			if (GLOBAL_ACTION_IDS.has(action)) {
				return { handled: true, shouldPreventDefault: false };
			}
		}

		if (
			(event.ctrlKey || event.metaKey) &&
			!isModifier &&
			event.key !== 'Home' &&
			event.key !== 'End'
		) {
			return { handled: false, shouldPreventDefault: false };
		}

		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			shortcutsContext.hasSelection()
		) {
			shortcutsContext.onDelete();
			return { handled: true, shouldPreventDefault: true };
		}

		switch (event.key) {
			case 'ArrowUp':
				if (!shortcutsContext.isPlaying) {
					if (event.shiftKey) {
						if (!shortcutsContext.hasSelection()) {
							shortcutsContext.onSetSelectionAnchor(
								shortcutsContext.selectedRow,
								shortcutsContext.selectedColumn
							);
						}
						const newState = PatternNavigationService.moveRow(
							{
								selectedRow: shortcutsContext.selectedRow,
								currentPatternOrderIndex: shortcutsContext.currentPatternOrderIndex,
								selectedColumn: shortcutsContext.selectedColumn
							},
							shortcutsContext.navigationContext,
							-1
						);
						shortcutsContext.onExtendSelection(
							newState.selectedRow,
							newState.selectedColumn
						);
						shortcutsContext.onSetSelectedRow(newState.selectedRow);
						if (
							newState.currentPatternOrderIndex !==
							shortcutsContext.currentPatternOrderIndex
						) {
							shortcutsContext.onSetCurrentPatternOrderIndex(
								newState.currentPatternOrderIndex
							);
						}
					} else {
						shortcutsContext.onClearSelection();
						shortcutsContext.onMoveRow(-1);
					}
				}
				return { handled: true, shouldPreventDefault: true };
			case 'ArrowDown':
				if (!shortcutsContext.isPlaying) {
					if (event.shiftKey) {
						if (!shortcutsContext.hasSelection()) {
							shortcutsContext.onSetSelectionAnchor(
								shortcutsContext.selectedRow,
								shortcutsContext.selectedColumn
							);
						}
						const newState = PatternNavigationService.moveRow(
							{
								selectedRow: shortcutsContext.selectedRow,
								currentPatternOrderIndex: shortcutsContext.currentPatternOrderIndex,
								selectedColumn: shortcutsContext.selectedColumn
							},
							shortcutsContext.navigationContext,
							1
						);
						shortcutsContext.onExtendSelection(
							newState.selectedRow,
							newState.selectedColumn
						);
						shortcutsContext.onSetSelectedRow(newState.selectedRow);
						if (
							newState.currentPatternOrderIndex !==
							shortcutsContext.currentPatternOrderIndex
						) {
							shortcutsContext.onSetCurrentPatternOrderIndex(
								newState.currentPatternOrderIndex
							);
						}
					} else {
						shortcutsContext.onClearSelection();
						shortcutsContext.onMoveRow(1);
					}
				}
				return { handled: true, shouldPreventDefault: true };
			case 'ArrowLeft':
				if (event.shiftKey) {
					if (!shortcutsContext.hasSelection()) {
						shortcutsContext.onSetSelectionAnchor(
							shortcutsContext.selectedRow,
							shortcutsContext.selectedColumn
						);
					}
					const newState = PatternNavigationService.moveColumnByDelta(
						{
							selectedRow: shortcutsContext.selectedRow,
							currentPatternOrderIndex: shortcutsContext.currentPatternOrderIndex,
							selectedColumn: shortcutsContext.selectedColumn
						},
						shortcutsContext.navigationContext,
						-1
					);
					shortcutsContext.onExtendSelection(
						newState.selectedRow,
						newState.selectedColumn
					);
					shortcutsContext.onSetSelectedColumn(newState.selectedColumn);
				} else {
					shortcutsContext.onClearSelection();
					shortcutsContext.onMoveColumn(-1);
				}
				return { handled: true, shouldPreventDefault: true };
			case 'ArrowRight':
				if (event.shiftKey) {
					if (!shortcutsContext.hasSelection()) {
						shortcutsContext.onSetSelectionAnchor(
							shortcutsContext.selectedRow,
							shortcutsContext.selectedColumn
						);
					}
					const newState = PatternNavigationService.moveColumnByDelta(
						{
							selectedRow: shortcutsContext.selectedRow,
							currentPatternOrderIndex: shortcutsContext.currentPatternOrderIndex,
							selectedColumn: shortcutsContext.selectedColumn
						},
						shortcutsContext.navigationContext,
						1
					);
					shortcutsContext.onExtendSelection(
						newState.selectedRow,
						newState.selectedColumn
					);
					shortcutsContext.onSetSelectedColumn(newState.selectedColumn);
				} else {
					shortcutsContext.onClearSelection();
					shortcutsContext.onMoveColumn(1);
				}
				return { handled: true, shouldPreventDefault: true };
			case '+':
			case '=':
				if (!shortcutsContext.isPlaying) {
					shortcutsContext.onIncrementFieldValue(1, isModifier, event.key);
				}
				return { handled: true, shouldPreventDefault: true };
			case '-':
			case '_':
				if (!shortcutsContext.isPlaying) {
					shortcutsContext.onIncrementFieldValue(-1, isModifier, event.key);
				}
				return { handled: true, shouldPreventDefault: true };
		}

		return { handled: false, shouldPreventDefault: false };
	}
}
