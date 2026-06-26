import type { LoopMarkerStyle } from './loop-marker-style';

export function createLoopMarkerMeasure(
	getTable: () => HTMLTableElement | null,
	getLoopRow: () => number,
	getRowCount: () => number,
	getLayoutKey: () => unknown = () => undefined
) {
	let loopMarkerStyle = $state<LoopMarkerStyle | null>(null);

	$effect(() => {
		const table = getTable();
		const container = table?.parentElement;
		const currentLoopRow = getLoopRow();
		const rowCount = getRowCount();
		void getLayoutKey();

		if (!table || !container || currentLoopRow < 0 || currentLoopRow >= rowCount) {
			loopMarkerStyle = null;
			return;
		}

		const measureLoopMarker = () => {
			const tbody = table.querySelector('tbody');
			const loopCell = tbody?.querySelector(
				`tr:nth-child(${currentLoopRow + 1}) > td:nth-of-type(3)`
			) as HTMLTableCellElement | null;
			const lastRow = tbody?.querySelector(`tr:nth-child(${rowCount})`) as HTMLTableRowElement | null;
			if (!loopCell || !lastRow) {
				loopMarkerStyle = null;
				return;
			}
			const containerRect = container.getBoundingClientRect();
			const loopRect = loopCell.getBoundingClientRect();
			const lastRowRect = lastRow.getBoundingClientRect();
			loopMarkerStyle = {
				left: loopRect.left - containerRect.left + loopRect.width / 2,
				top: loopRect.top - containerRect.top,
				height: lastRowRect.bottom - loopRect.top
			};
		};

		measureLoopMarker();
		const observer = new ResizeObserver(measureLoopMarker);
		observer.observe(table);
		observer.observe(container);
		return () => observer.disconnect();
	});

	return {
		get style() {
			return loopMarkerStyle;
		}
	};
}
