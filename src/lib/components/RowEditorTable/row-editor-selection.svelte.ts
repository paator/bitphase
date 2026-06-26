import {
	computeSelectionFromClick,
	filterValidSelection,
	isRowSelected as checkRowSelected
} from '../../utils/row-selection';

export function createRowEditorSelection(options: {
	getSelectedIndices: () => number[];
	setSelectedIndices: (indices: number[]) => void;
	getRowCount: () => number;
	focusContainer: () => void;
}) {
	let selectionAnchor = $state<number | null>(null);

	function isRowSelected(index: number): boolean {
		return checkRowSelected(index, options.getSelectedIndices());
	}

	function handleRowSelect(index: number, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const result = computeSelectionFromClick(
			index,
			event,
			options.getSelectedIndices(),
			selectionAnchor
		);
		options.setSelectedIndices(result.indices);
		selectionAnchor = result.anchor;
		options.focusContainer();
	}

	function clearSelection(): void {
		options.setSelectedIndices([]);
		selectionAnchor = null;
	}

	$effect(() => {
		const validIndices = filterValidSelection(options.getSelectedIndices(), options.getRowCount());
		if (validIndices.length !== options.getSelectedIndices().length) {
			options.setSelectedIndices(validIndices);
		}
	});

	return {
		isRowSelected,
		handleRowSelect,
		clearSelection
	};
}
