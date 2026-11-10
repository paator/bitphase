import { describe, expect, it, vi } from 'vitest';
import { onPointerDownOutside } from '@/lib/utils/outside-pointer';

describe('onPointerDownOutside', () => {
	it('calls the handler only for presses outside the root until removed', () => {
		const root = document.createElement('div');
		const inside = document.createElement('span');
		root.append(inside);
		document.body.append(root);
		const handler = vi.fn();
		const stop = onPointerDownOutside(() => root, handler);

		inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(handler).not.toHaveBeenCalled();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(1);

		stop();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(1);
		root.remove();
	});
});
