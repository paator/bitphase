import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternKeyboardShortcutsService } from '../../../../src/lib/services/pattern/pattern-keyboard-shortcuts';
import type { PatternKeyboardShortcutsContext } from '../../../../src/lib/services/pattern/pattern-keyboard-shortcuts';
import { Pattern } from '../../../../src/lib/models/song';
import { keybindingsStore } from '../../../../src/lib/stores/keybindings.svelte';

function createContext(
	overrides: Partial<PatternKeyboardShortcutsContext> = {}
): PatternKeyboardShortcutsContext {
	const pattern = new Pattern(0, 64);
	return {
		isPlaying: false,
		selectedColumn: 2,
		selectedRow: 10,
		currentPatternOrderIndex: 0,
		pattern,
		hasSelection: () => false,
		onUndo: vi.fn(),
		onRedo: vi.fn(),
		onCopy: vi.fn(),
		onCut: vi.fn(),
		onPaste: vi.fn(),
		onPasteWithoutErasing: vi.fn(),
		onDelete: vi.fn(),
		onSelectAll: vi.fn(),
		onSelectProgressive: vi.fn(),
		onTogglePlayback: vi.fn(),
		onPausePlayback: vi.fn(),
		onMoveRow: vi.fn(),
		onMoveColumn: vi.fn(),
		onSetSelectedRow: vi.fn(),
		onSetSelectedColumn: vi.fn(),
		onSetCurrentPatternOrderIndex: vi.fn(),
		onClearSelection: vi.fn(),
		onSetSelectionAnchor: vi.fn(),
		onExtendSelection: vi.fn(),
		onIncrementFieldValue: vi.fn(),
		onSwapChannelLeft: vi.fn(),
		onSwapChannelRight: vi.fn(),
		onInsertPatternRow: vi.fn(),
		onRemovePatternRow: vi.fn(),
		selectionStartRow: null,
		selectionStartColumn: null,
		selectionEndRow: null,
		selectionEndColumn: null,
		getPatternRowData: () => '',
		navigationContext: {
			patterns: [pattern],
			patternOrder: [0],
			currentPattern: pattern,
			converter: {} as never,
			formatter: {} as never,
			schema: {
				chipType: 'ay',
				template: '',
				fields: {},
				globalFields: {}
			},
			getCellPositions: () => []
		},
		...overrides
	};
}

function keyEvent(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
	return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
}

describe('PatternKeyboardShortcutsService selection navigation', () => {
	beforeEach(() => {
		keybindingsStore.resetAll();
	});

	it('extends selection to last row with Shift+End', () => {
		const ctx = createContext();
		const result = PatternKeyboardShortcutsService.handleKeyDown(
			keyEvent('End', { shiftKey: true }),
			ctx
		);

		expect(result.handled).toBe(true);
		expect(ctx.onSetSelectionAnchor).toHaveBeenCalledWith(10, 2);
		expect(ctx.onExtendSelection).toHaveBeenCalledWith(63, 2);
		expect(ctx.onSetSelectedRow).toHaveBeenCalledWith(63);
		expect(ctx.onClearSelection).not.toHaveBeenCalled();
	});

	it('extends selection to first row with Shift+Home', () => {
		const ctx = createContext();
		const result = PatternKeyboardShortcutsService.handleKeyDown(
			keyEvent('Home', { shiftKey: true }),
			ctx
		);

		expect(result.handled).toBe(true);
		expect(ctx.onSetSelectionAnchor).toHaveBeenCalledWith(10, 2);
		expect(ctx.onExtendSelection).toHaveBeenCalledWith(0, 2);
		expect(ctx.onSetSelectedRow).toHaveBeenCalledWith(0);
	});

	it('clears selection when End is pressed without Shift', () => {
		const ctx = createContext();
		PatternKeyboardShortcutsService.handleKeyDown(keyEvent('End'), ctx);

		expect(ctx.onClearSelection).toHaveBeenCalled();
		expect(ctx.onExtendSelection).not.toHaveBeenCalled();
		expect(ctx.onSetSelectedRow).toHaveBeenCalledWith(63);
	});

	it('inserts a pattern row with Mod+I', () => {
		const ctx = createContext();
		const result = PatternKeyboardShortcutsService.handleKeyDown(
			keyEvent('i', { ctrlKey: true }),
			ctx
		);

		expect(result.handled).toBe(true);
		expect(result.shouldPreventDefault).toBe(true);
		expect(ctx.onInsertPatternRow).toHaveBeenCalledOnce();
	});

	it('removes a pattern row with Mod+R', () => {
		const ctx = createContext();
		const result = PatternKeyboardShortcutsService.handleKeyDown(
			keyEvent('r', { ctrlKey: true }),
			ctx
		);

		expect(result.handled).toBe(true);
		expect(result.shouldPreventDefault).toBe(true);
		expect(ctx.onRemovePatternRow).toHaveBeenCalledOnce();
	});

	it('does not insert or remove pattern rows while playing', () => {
		const ctx = createContext({ isPlaying: true });
		PatternKeyboardShortcutsService.handleKeyDown(keyEvent('i', { ctrlKey: true }), ctx);
		PatternKeyboardShortcutsService.handleKeyDown(keyEvent('r', { ctrlKey: true }), ctx);

		expect(ctx.onInsertPatternRow).not.toHaveBeenCalled();
		expect(ctx.onRemovePatternRow).not.toHaveBeenCalled();
	});
});
