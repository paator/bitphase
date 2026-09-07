const STORAGE_KEY = 'selectionPalette';

export const SELECTION_PALETTE_TAB_IDS = ['instruments', 'effects'] as const;

export type SelectionPaletteTabId = (typeof SELECTION_PALETTE_TAB_IDS)[number];

interface StoredSelectionPalette {
	isOpen?: boolean;
	activeTabId?: string;
}

function isSelectionPaletteTabId(value: string): value is SelectionPaletteTabId {
	return (SELECTION_PALETTE_TAB_IDS as readonly string[]).includes(value);
}

class SelectionPaletteStore {
	isOpen = $state(false);
	activeTabId = $state<SelectionPaletteTabId>('instruments');

	init(): void {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return;
		try {
			const parsed = JSON.parse(stored) as StoredSelectionPalette;
			if (typeof parsed.isOpen === 'boolean') {
				this.isOpen = parsed.isOpen;
			}
			if (
				typeof parsed.activeTabId === 'string' &&
				isSelectionPaletteTabId(parsed.activeTabId)
			) {
				this.activeTabId = parsed.activeTabId;
			}
		} catch {
			return;
		}
	}

	selectTab(tabId: SelectionPaletteTabId): void {
		if (this.isOpen && this.activeTabId === tabId) {
			this.close();
			return;
		}
		this.activeTabId = tabId;
		this.isOpen = true;
		this.save();
	}

	close(): void {
		this.isOpen = false;
		this.save();
	}

	private save(): void {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				isOpen: this.isOpen,
				activeTabId: this.activeTabId
			})
		);
	}
}

export const selectionPaletteStore = new SelectionPaletteStore();
