export function onPointerDownOutside(
	root: () => Element | null | undefined,
	handler: (event: PointerEvent) => void
): () => void {
	const listener = (event: PointerEvent) => {
		const target = event.target;
		if (target instanceof Node && root()?.contains(target)) return;
		handler(event);
	};
	window.addEventListener('pointerdown', listener);
	return () => window.removeEventListener('pointerdown', listener);
}
