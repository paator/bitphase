export type Point = { x: number; y: number };

export type SubmenuBounds = {
	left: number;
	top: number;
	bottom: number;
};

export type PointerAimState = 'clear' | 'aiming' | 'arrived';

export const SUBMENU_AIM_DELAY_MS = 300;
const MOUSE_HISTORY_SIZE = 3;
const EDGE_SLOP_PX = 8;

export function isPointInTriangle(point: Point, a: Point, b: Point, c: Point): boolean {
	const sign = (p1: Point, p2: Point, p3: Point) =>
		(p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);

	const d1 = sign(point, a, b);
	const d2 = sign(point, b, c);
	const d3 = sign(point, c, a);
	const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
	return !(hasNeg && hasPos);
}

export function getPointerAimState(
	previous: Point,
	current: Point,
	submenu: SubmenuBounds | null
): PointerAimState {
	if (!submenu) {
		return 'clear';
	}

	const inVerticalRange =
		current.y >= submenu.top - EDGE_SLOP_PX && current.y <= submenu.bottom + EDGE_SLOP_PX;

	if (current.x >= submenu.left) {
		return inVerticalRange ? 'arrived' : 'clear';
	}

	if (previous.x === current.x && previous.y === current.y) {
		return 'clear';
	}

	const upperLeft = { x: submenu.left, y: submenu.top - EDGE_SLOP_PX };
	const lowerLeft = { x: submenu.left, y: submenu.bottom + EDGE_SLOP_PX };
	if (isPointInTriangle(current, previous, upperLeft, lowerLeft)) {
		return 'aiming';
	}

	return 'clear';
}

export class SubmenuAim {
	private history: Point[] = [];
	private timeout: ReturnType<typeof setTimeout> | undefined;
	private pointerMoved = false;
	private readonly delayMs: number;

	constructor(delayMs = SUBMENU_AIM_DELAY_MS) {
		this.delayMs = delayMs;
	}

	recordPointer(point: Point): void {
		this.pointerMoved = true;
		this.history.push(point);
		if (this.history.length > MOUSE_HISTORY_SIZE) {
			this.history.shift();
		}
	}

	clear(): void {
		this.cancel();
		this.history = [];
		this.pointerMoved = false;
	}

	cancel(): void {
		if (this.timeout !== undefined) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	schedule(activate: () => void, getSubmenu: () => SubmenuBounds | null): void {
		this.cancel();
		const attempt = () => {
			const state = this.getAimState(getSubmenu());
			if (state === 'aiming' && this.pointerMoved) {
				this.pointerMoved = false;
				this.timeout = setTimeout(attempt, this.delayMs);
				return;
			}
			this.timeout = undefined;
			if (state === 'arrived') {
				return;
			}
			activate();
		};
		attempt();
	}

	private getAimState(submenu: SubmenuBounds | null): PointerAimState {
		if (this.history.length === 0) {
			return 'clear';
		}
		const current = this.history[this.history.length - 1];
		const previous = this.history.length > 1 ? this.history[0] : current;
		return getPointerAimState(previous, current, submenu);
	}
}
