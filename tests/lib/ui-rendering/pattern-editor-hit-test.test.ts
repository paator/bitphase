import { describe, expect, it } from 'vitest';
import { columnHoverFieldAtX } from '@/lib/ui-rendering/pattern-editor-hit-test';
import type { CellPosition } from '@/lib/ui-rendering/pattern-editor-text-parser';

function cell(x: number, width: number, fieldKey: string): CellPosition {
	return { x, width, charIndex: 0, fieldKey };
}

describe('columnHoverFieldAtX', () => {
	const cells = [
		cell(20, 16, 'row'),
		cell(44, 8, 'noise0'),
		cell(60, 24, 'note'),
		cell(100, 8, 'env0'),
		cell(108, 8, 'env0'),
		cell(124, 16, 'instrument')
	];

	it('covers the space around a one-digit noise column', () => {
		expect(columnHoverFieldAtX(cells, 44, 8)).toBe('noise0');
		expect(columnHoverFieldAtX(cells, 36, 8)).toBe('noise0');
		expect(columnHoverFieldAtX(cells, 55, 8)).toBe('noise0');
		expect(columnHoverFieldAtX(cells, 66, 8)).toBeNull();
	});

	it('treats both envelope digits and the gap beside them as one target', () => {
		expect(columnHoverFieldAtX(cells, 100, 8)).toBe('env0');
		expect(columnHoverFieldAtX(cells, 112, 8)).toBe('env0');
		expect(columnHoverFieldAtX(cells, 92, 8)).toBe('env0');
		expect(columnHoverFieldAtX(cells, 126, 8)).toBeNull();
	});
});
