import { ROW_EDITOR_MAX_ROWS } from './row-editor-table-classes';

export function clampRowCount(targetCount: number, maxRows = ROW_EDITOR_MAX_ROWS): number {
	return Math.max(1, Math.min(maxRows, targetCount));
}

export function clampLoopRow(loopRow: number, rowCount: number): number {
	if (rowCount <= 0) return 0;
	return Math.min(loopRow, rowCount - 1);
}

export function cloneRowValue<T>(row: T): T {
	if (row === null || typeof row !== 'object') {
		return row;
	}
	if (Array.isArray(row)) {
		return row.map((item) => cloneRowValue(item)) as T;
	}
	const cloned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
		cloned[key] = cloneRowValue(value);
	}
	return cloned as T;
}

export function createNextRow<T>(rows: T[], createRow: () => T): T {
	if (rows.length === 0) return createRow();
	return cloneRowValue(rows[rows.length - 1]);
}

export function resizeRowList<T>(
	rows: T[],
	targetCount: number,
	createRow: () => T,
	maxRows = ROW_EDITOR_MAX_ROWS
): T[] {
	const count = clampRowCount(targetCount, maxRows);
	if (count === rows.length) return rows;
	if (count > rows.length) {
		const toAdd = count - rows.length;
		const sourceRow = rows.length > 0 ? rows[rows.length - 1] : null;
		const newRows =
			sourceRow !== null
				? Array.from({ length: toAdd }, () => cloneRowValue(sourceRow))
				: Array.from({ length: toAdd }, createRow);
		return [...rows, ...newRows];
	}
	return rows.slice(0, count);
}

export function removeRowAt<T>(rows: T[], index: number): T[] | null {
	if (rows.length <= 1) return null;
	return rows.filter((_, i) => i !== index);
}

export function removeRowsFromBottomAt<T>(rows: T[], index: number): T[] | null {
	if (rows.length <= 1) return null;
	const rowsToKeep = index + 1;
	if (rowsToKeep >= rows.length) return null;
	return rows.slice(0, rowsToKeep);
}
