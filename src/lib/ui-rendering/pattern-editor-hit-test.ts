import type { CellPosition } from './pattern-editor-text-parser';

const COLUMN_HOVER_FIELDS = new Set(['env0', 'env1', 'noise0', 'noise1']);

export type ColumnHoverField = 'env0' | 'env1' | 'noise0' | 'noise1';

export function getColumnAtX(cellPositions: CellPosition[], x: number): number {
	let closestColumn = 0;
	let minDistance = Infinity;
	for (let i = 0; i < cellPositions.length; i++) {
		const cell = cellPositions[i];
		if (cell.x === undefined) continue;
		const cellCenter = cell.x + (cell.width ?? 0) / 2;
		const distance = Math.abs(x - cellCenter);
		if (distance < minDistance) {
			minDistance = distance;
			closestColumn = i;
		}
	}
	return closestColumn;
}

export function columnHoverFieldAtX(
	cells: readonly CellPosition[],
	x: number,
	pad: number
): ColumnHoverField | null {
	let best: { fieldKey: ColumnHoverField; distance: number } | null = null;
	let index = 0;
	while (index < cells.length) {
		const fieldKey = cells[index]?.fieldKey;
		if (!fieldKey || !COLUMN_HOVER_FIELDS.has(fieldKey)) {
			index += 1;
			continue;
		}
		let end = index;
		while (end + 1 < cells.length && cells[end + 1]?.fieldKey === fieldKey) end += 1;
		const first = cells[index];
		const last = cells[end];
		if (first && last) {
			const spanLeft = first.x;
			const spanRight = last.x + last.width;
			const prev = index > 0 ? cells[index - 1] : undefined;
			const next = end + 1 < cells.length ? cells[end + 1] : undefined;
			const left = prev ? prev.x + prev.width : spanLeft - pad;
			const right = next ? next.x : spanRight + pad;
			if (x >= left && x < right) {
				const distance = Math.abs(x - (spanLeft + spanRight) / 2);
				if (!best || distance < best.distance) {
					best = { fieldKey: fieldKey as ColumnHoverField, distance };
				}
			}
		}
		index = end + 1;
	}
	return best?.fieldKey ?? null;
}
