import { beforeEach, describe, expect, it } from 'vitest';
import {
	selectionPaletteStore,
	type SelectionPaletteTabId
} from '../../../src/lib/stores/selection-palette.svelte';

describe('selectionPaletteStore', () => {
	beforeEach(() => {
		localStorage.clear();
		selectionPaletteStore.isOpen = false;
		selectionPaletteStore.activeTabId = 'instruments';
	});

	it('opens a tab', () => {
		const tab: SelectionPaletteTabId = 'instruments';
		selectionPaletteStore.selectTab(tab);
		expect(selectionPaletteStore.isOpen).toBe(true);
		expect(selectionPaletteStore.activeTabId).toBe(tab);

		selectionPaletteStore.selectTab(tab);
		expect(selectionPaletteStore.isOpen).toBe(false);
	});

	it('closes the palette', () => {
		selectionPaletteStore.selectTab('instruments');
		selectionPaletteStore.close();
		expect(selectionPaletteStore.isOpen).toBe(false);
		expect(selectionPaletteStore.activeTabId).toBe('instruments');
	});

	it('persists open state', () => {
		selectionPaletteStore.selectTab('instruments');
		const stored = JSON.parse(localStorage.getItem('selectionPalette') ?? '{}');
		expect(stored).toEqual({ isOpen: true, activeTabId: 'instruments' });
	});

	it('switches to the effects tab', () => {
		selectionPaletteStore.selectTab('instruments');
		selectionPaletteStore.selectTab('effects');
		expect(selectionPaletteStore.isOpen).toBe(true);
		expect(selectionPaletteStore.activeTabId).toBe('effects');
	});

	it('restores persisted state on init', () => {
		localStorage.setItem(
			'selectionPalette',
			JSON.stringify({ isOpen: true, activeTabId: 'instruments' })
		);
		selectionPaletteStore.init();
		expect(selectionPaletteStore.isOpen).toBe(true);
		expect(selectionPaletteStore.activeTabId).toBe('instruments');
	});

	it('restores the effects tab from storage', () => {
		localStorage.setItem(
			'selectionPalette',
			JSON.stringify({ isOpen: true, activeTabId: 'effects' })
		);
		selectionPaletteStore.init();
		expect(selectionPaletteStore.isOpen).toBe(true);
		expect(selectionPaletteStore.activeTabId).toBe('effects');
	});
});
