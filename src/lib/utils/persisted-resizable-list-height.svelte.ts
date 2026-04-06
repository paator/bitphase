export function createPersistedResizableListHeight(options: {
	storageKey: string;
	min: number;
	max: number;
	defaultHeight: number;
}) {
	const { storageKey, min, max, defaultHeight } = options;

	let listHeight = $state(
		Math.min(
			max,
			Math.max(
				min,
				parseInt(localStorage.getItem(storageKey) ?? '', 10) || defaultHeight
			)
		)
	);

	let isResizing = $state(false);
	let resizeStartY = $state(0);
	let resizeStartHeight = $state(0);

	function beginResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = listHeight;
	}

	function handleMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = e.clientY - resizeStartY;
		const newHeight = Math.max(min, Math.min(max, resizeStartHeight + deltaY));
		listHeight = newHeight;
		localStorage.setItem(storageKey, String(newHeight));
	}

	function endResize() {
		isResizing = false;
	}

	$effect(() => {
		if (!isResizing) return;
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', handleMove);
		window.addEventListener('mouseup', endResize);
		return () => {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', handleMove);
			window.removeEventListener('mouseup', endResize);
		};
	});

	return {
		get listHeight() {
			return listHeight;
		},
		get isResizing() {
			return isResizing;
		},
		beginResize
	};
}
