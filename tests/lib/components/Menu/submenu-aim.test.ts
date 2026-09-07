import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getPointerAimState,
	isPointInTriangle,
	SubmenuAim,
	SUBMENU_AIM_DELAY_MS
} from '@/lib/components/Menu/submenu-aim';

describe('isPointInTriangle', () => {
	const a = { x: 0, y: 0 };
	const b = { x: 10, y: 0 };
	const c = { x: 0, y: 10 };

	it('includes points inside the triangle', () => {
		expect(isPointInTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true);
	});

	it('includes vertices and edges', () => {
		expect(isPointInTriangle(a, a, b, c)).toBe(true);
		expect(isPointInTriangle({ x: 5, y: 0 }, a, b, c)).toBe(true);
	});

	it('excludes points outside the triangle', () => {
		expect(isPointInTriangle({ x: 8, y: 8 }, a, b, c)).toBe(false);
		expect(isPointInTriangle({ x: -1, y: 2 }, a, b, c)).toBe(false);
	});
});

describe('getPointerAimState', () => {
	const submenu = { left: 200, top: 40, bottom: 240 };

	it('is clear when no submenu is open', () => {
		expect(getPointerAimState({ x: 10, y: 10 }, { x: 20, y: 20 }, null)).toBe('clear');
	});

	it('is aiming when the pointer moves through the safety triangle', () => {
		expect(getPointerAimState({ x: 40, y: 50 }, { x: 90, y: 90 }, submenu)).toBe('aiming');
	});

	it('is clear when the pointer moves straight down instead of toward the submenu', () => {
		expect(getPointerAimState({ x: 40, y: 50 }, { x: 40, y: 120 }, submenu)).toBe('clear');
	});

	it('is clear when the pointer has not moved', () => {
		expect(getPointerAimState({ x: 40, y: 50 }, { x: 40, y: 50 }, submenu)).toBe('clear');
	});

	it('is arrived when the pointer reaches the submenu', () => {
		expect(getPointerAimState({ x: 40, y: 50 }, { x: 210, y: 80 }, submenu)).toBe('arrived');
	});

	it('is clear when the pointer passes the submenu horizontally but misses it vertically', () => {
		expect(getPointerAimState({ x: 40, y: 50 }, { x: 210, y: 400 }, submenu)).toBe('clear');
	});
});

describe('SubmenuAim', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('activates immediately when no submenu is open', () => {
		const aim = new SubmenuAim();
		const activate = vi.fn();
		aim.recordPointer({ x: 10, y: 10 });
		aim.recordPointer({ x: 20, y: 20 });
		aim.schedule(activate, () => null);
		expect(activate).toHaveBeenCalledOnce();
	});

	it('delays activation while moving toward an open submenu', () => {
		const aim = new SubmenuAim();
		const activate = vi.fn();
		const submenu = { left: 200, top: 0, bottom: 200 };
		aim.recordPointer({ x: 40, y: 40 });
		aim.recordPointer({ x: 90, y: 70 });
		aim.schedule(activate, () => submenu);
		expect(activate).not.toHaveBeenCalled();
		aim.recordPointer({ x: 120, y: 85 });
		vi.advanceTimersByTime(SUBMENU_AIM_DELAY_MS);
		expect(activate).not.toHaveBeenCalled();
		aim.recordPointer({ x: 120, y: 160 });
		vi.advanceTimersByTime(SUBMENU_AIM_DELAY_MS);
		expect(activate).toHaveBeenCalledOnce();
	});

	it('activates after a pause even if the last path was toward the submenu', () => {
		const aim = new SubmenuAim();
		const activate = vi.fn();
		const submenu = { left: 200, top: 0, bottom: 200 };
		aim.recordPointer({ x: 40, y: 40 });
		aim.recordPointer({ x: 90, y: 70 });
		aim.schedule(activate, () => submenu);
		expect(activate).not.toHaveBeenCalled();
		vi.advanceTimersByTime(SUBMENU_AIM_DELAY_MS);
		expect(activate).toHaveBeenCalledOnce();
	});

	it('does not activate a pending item if the pointer reaches the submenu', () => {
		const aim = new SubmenuAim();
		const activate = vi.fn();
		const submenu = { left: 200, top: 0, bottom: 200 };
		aim.recordPointer({ x: 40, y: 40 });
		aim.recordPointer({ x: 90, y: 70 });
		aim.schedule(activate, () => submenu);
		aim.recordPointer({ x: 210, y: 80 });
		vi.advanceTimersByTime(SUBMENU_AIM_DELAY_MS);
		expect(activate).not.toHaveBeenCalled();
	});

	it('cancels a pending activation', () => {
		const aim = new SubmenuAim();
		const activate = vi.fn();
		const submenu = { left: 200, top: 0, bottom: 200 };
		aim.recordPointer({ x: 40, y: 40 });
		aim.recordPointer({ x: 90, y: 70 });
		aim.schedule(activate, () => submenu);
		aim.cancel();
		aim.recordPointer({ x: 90, y: 160 });
		vi.advanceTimersByTime(SUBMENU_AIM_DELAY_MS);
		expect(activate).not.toHaveBeenCalled();
	});
});
