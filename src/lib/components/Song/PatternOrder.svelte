<script lang="ts">
	import type { Pattern } from '../../models/song';
	import { getPatternOrderColors } from '../../utils/pattern-order-colors';
	import { getFonts } from '../../utils/fonts';
	import { setupCanvas as setupCanvasUtil } from '../../utils/canvas-utils';
	import { PatternService } from '../../services/pattern/pattern-service';
	import { PatternOrderRenderer } from '../../ui-rendering/pattern-order-renderer';
	import { playbackStore } from '../../stores/playback.svelte';
	import { themeService } from '../../services/theme/theme-service';
	import IconCarbonUnlink from '~icons/carbon/unlink';
	import IconCarbonCopy from '~icons/carbon/copy';
	import IconCarbonSubtract from '~icons/carbon/subtract';
	import IconCarbonAdd from '~icons/carbon/add';
	import PatternOrderButton from './PatternOrderButton.svelte';
	import { ContextMenu } from '../Menu';
	import type { MenuItem } from '../Menu/types';
	import { open } from '../../services/modal/modal-service';
	import ColorPickerModal from '../Modal/ColorPickerModal.svelte';
	import { projectStore } from '../../stores/project.svelte';

	interface Props {
		currentPatternOrderIndex: number;
		selectedRow: number;
		canvasHeight?: number;
		lineHeight?: number;
		onPatternSelect?: (index: number) => void;
		onMakeUnique?: (index: number) => void;
		onPatternOrderEdited?: () => void;
	}

	let {
		currentPatternOrderIndex = $bindable(),
		selectedRow = $bindable(),
		canvasHeight = 600,
		onPatternSelect,
		onMakeUnique,
		onPatternOrderEdited
	}: Props = $props();

	const patternOrder = $derived(projectStore.patternOrder);
	const patternOrderColors = $derived(projectStore.patternOrderColors);
	const loopPointId = $derived(projectStore.loopPointId);

	const patternsRecord = $derived.by(() => {
		const record: Record<number, Pattern> = {};
		for (const songPatterns of projectStore.patterns) {
			for (const pattern of songPatterns) {
				record[pattern.id] = pattern;
			}
		}
		return record;
	});

	const FONT_SIZE = 14;
	const CELL_WIDTH = 32;
	const CELL_HEIGHT = 28;
	const PADDING = 12;
	const FADE_HEIGHT = 30;
	const BUTTON_SIZE = 22;
	const BUTTON_SPACING = 2;
	const BUTTON_COLUMN_WIDTH = BUTTON_SIZE;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	const canvasWidth = CELL_WIDTH + PADDING * 2 + BUTTON_COLUMN_WIDTH + BUTTON_SPACING;

	let COLORS = $state(getPatternOrderColors());
	let FONTS = getFonts();
	let renderer: PatternOrderRenderer | null = null;

	let lastDrawnOrderIndex = -1;
	let lastPatternOrderLength = -1;
	let lastLoopPointId = -1;
	let lastHoveredIndex: number | null = null;
	let lastCanvasHeight = -1;
	let needsSetup = true;

	$effect(() => {
		if (!canvas) return;

		if (needsSetup || !ctx) {
			ctx = canvas.getContext('2d')!;
			setupCanvas();
			needsSetup = false;
			lastDrawnOrderIndex = currentPatternOrderIndex;
			lastPatternOrderLength = patternOrder.length;
			lastLoopPointId = loopPointId;
			lastCanvasHeight = canvasHeight;
			draw();
			return;
		}

		const sizeChanged = canvasHeight !== lastCanvasHeight;
		const colorsChanged = patternOrderColors;
		const orderChanged =
			currentPatternOrderIndex !== lastDrawnOrderIndex ||
			patternOrder.length !== lastPatternOrderLength ||
			sizeChanged ||
			loopPointId !== lastLoopPointId;

		if (sizeChanged) {
			setupCanvas();
		}

		if (orderChanged || colorsChanged) {
			lastDrawnOrderIndex = currentPatternOrderIndex;
			lastPatternOrderLength = patternOrder.length;
			lastLoopPointId = loopPointId;
			lastCanvasHeight = canvasHeight;
			draw();
			lastHoveredIndex = hoveredIndex;

			if (lastMouseY !== null && lastMouseX !== null && !isDragging) {
				updateCursor(lastMouseY, lastMouseX);
			}
		} else if (hoveredIndex !== lastHoveredIndex) {
			draw();
			lastHoveredIndex = hoveredIndex;
		}
	});

	function setupCanvas(): void {
		setupCanvasUtil({
			canvas,
			ctx,
			width: canvasWidth,
			height: canvasHeight,
			fontSize: FONT_SIZE,
			fonts: FONTS,
			textAlign: 'center',
			textBaseline: 'middle'
		});

		renderer = new PatternOrderRenderer({
			ctx,
			colors: COLORS,
			fonts: FONTS,
			canvasWidth,
			canvasHeight,
			fontSize: FONT_SIZE,
			cellWidth: CELL_WIDTH,
			cellHeight: CELL_HEIGHT,
			padding: PADDING,
			fadeHeight: FADE_HEIGHT
		});
	}

	$effect(() => {
		const unsubscribe = themeService.onColorChange(() => {
			COLORS = getPatternOrderColors();
			if (ctx && canvas) {
				setupCanvas();
				draw();
			}
		});
		return unsubscribe;
	});

	function shiftColorsAfterRemove(removedIndex: number): void {
		const next: Record<number, string> = {};
		for (const key of Object.keys(patternOrderColors).map(Number)) {
			if (key < removedIndex) next[key] = patternOrderColors[key];
			else if (key > removedIndex) next[key - 1] = patternOrderColors[key];
		}
		projectStore.patternOrderColors = next;
	}

	function shiftColorsAfterAdd(insertedIndex: number): void {
		const next: Record<number, string> = {};
		for (const key of Object.keys(patternOrderColors).map(Number)) {
			if (key < insertedIndex) next[key] = patternOrderColors[key];
			else next[key + 1] = patternOrderColors[key];
		}
		projectStore.patternOrderColors = next;
	}

	function moveColor(fromIndex: number, toIndex: number): void {
		if (fromIndex === toIndex) return;
		const saved = patternOrderColors[fromIndex];
		const next: Record<number, string> = {};
		for (const key of Object.keys(patternOrderColors).map(Number)) {
			if (key === fromIndex) continue;
			let target = key;
			if (fromIndex < toIndex) {
				if (key > fromIndex && key <= toIndex) target = key - 1;
			} else {
				if (key >= toIndex && key < fromIndex) target = key + 1;
			}
			next[target] = patternOrderColors[key];
		}
		if (saved !== undefined) next[toIndex] = saved;
		projectStore.patternOrderColors = next;
	}

	function adjustLoopPointAfterRemove(removedIndex: number, newLength: number): void {
		const lp = projectStore.loopPointId;
		if (lp < removedIndex) return;
		if (lp > removedIndex) {
			projectStore.loopPointId = lp - 1;
			return;
		}
		projectStore.loopPointId = Math.min(removedIndex, Math.max(0, newLength - 1));
	}

	function adjustLoopPointAfterAdd(insertedIndex: number): void {
		if (projectStore.loopPointId >= insertedIndex) {
			projectStore.loopPointId++;
		}
	}

	function adjustLoopPointAfterMove(fromIndex: number, toIndex: number): void {
		if (fromIndex === toIndex) return;
		const lp = projectStore.loopPointId;
		if (lp === fromIndex) {
			projectStore.loopPointId = toIndex;
			return;
		}
		if (fromIndex < toIndex) {
			if (lp > fromIndex && lp <= toIndex) projectStore.loopPointId = lp - 1;
		} else if (lp >= toIndex && lp < fromIndex) {
			projectStore.loopPointId = lp + 1;
		}
	}

	function getVisibleRange() {
		const visibleCount = Math.floor(canvasHeight / CELL_HEIGHT);
		const halfVisible = Math.floor(visibleCount / 2);
		const startIndex = Math.max(0, currentPatternOrderIndex - halfVisible);

		const idealEndIndex = currentPatternOrderIndex + halfVisible;
		const endIndex = Math.min(patternOrder.length - 1, idealEndIndex);

		return { startIndex, endIndex };
	}

	function draw(): void {
		if (!ctx || !renderer) return;

		const centerY = canvasHeight / 2;

		renderer.drawBackground(canvasHeight);

		const { startIndex, endIndex } = getVisibleRange();

		for (let i = startIndex; i <= endIndex; i++) {
			if (i < 0 || i >= patternOrder.length) continue;

			const patternId = patternOrder[i];
			let pattern = patternsRecord[patternId];

			const y = centerY - (currentPatternOrderIndex - i) * CELL_HEIGHT;

			if (y < -CELL_HEIGHT || y > canvasHeight + CELL_HEIGHT) continue;

			const isSelected = i === currentPatternOrderIndex;
			const isHovered = hoveredIndex === i;
			const isEditing = editingPatternIndex === i;
			const isDraggingThis = isDragging && draggedIndex === i;

			renderer.drawPatternCell({
				pattern,
				patternId,
				y,
				isSelected,
				isHovered,
				isEditing,
				editingValue: editingPatternValue,
				index: i,
				isDragging: isDraggingThis,
				orderIndexColor: patternOrderColors[i],
				isLoopMarker: i === loopPointId
			});
		}

		if (isDragging && dropTargetIndex !== null && draggedIndex !== dropTargetIndex) {
			const dropY = centerY - (currentPatternOrderIndex - dropTargetIndex) * CELL_HEIGHT;
			const indicatorY =
				dropTargetIndex > (draggedIndex ?? -1)
					? dropY + CELL_HEIGHT / 2
					: dropY - CELL_HEIGHT / 2;
			renderer.drawDropIndicator(indicatorY);
		}

		const hasMoreAbove = startIndex > 0;
		const hasMoreBelow = endIndex < patternOrder.length - 1;

		renderer.drawScrollIndicators(hasMoreAbove, hasMoreBelow);
	}

	let editingPatternIndex: number | null = $state(null);
	let editingPatternValue: string = $state('');
	let isDragging: boolean = $state(false);
	let draggedIndex: number | null = $state(null);
	let dropTargetIndex: number | null = $state(null);
	let dragStartY: number | null = null;
	let justFinishedDrag: boolean = $state(false);
	const DRAG_THRESHOLD = 5;

	function handleClick(event: MouseEvent): void {
		if (justFinishedDrag) {
			justFinishedDrag = false;
			return;
		}

		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const centerY = canvasHeight / 2;

		const clickedIndex = Math.round(currentPatternOrderIndex + (y - centerY) / CELL_HEIGHT);

		if (clickedIndex >= 0 && clickedIndex < patternOrder.length) {
			if (playbackStore.isPlaying && clickedIndex === currentPatternOrderIndex) {
				return;
			}

			if (x <= PADDING + CELL_WIDTH && x >= PADDING) {
				finishPatternEdit();
				switchPattern(clickedIndex);
				editingPatternIndex = clickedIndex;
				editingPatternValue = '';
				draw();
			} else {
				finishPatternEdit();
				switchPattern(clickedIndex);
			}
		} else {
			finishPatternEdit();
		}
	}

	function handleMouseDown(event: MouseEvent): void {
		if (isDragging) return;

		justFinishedDrag = false;

		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const centerY = canvasHeight / 2;

		if (x < PADDING || x > PADDING + CELL_WIDTH) return;

		const clickedIndex = Math.round(currentPatternOrderIndex + (y - centerY) / CELL_HEIGHT);

		if (clickedIndex >= 0 && clickedIndex < patternOrder.length) {
			if (editingPatternIndex !== null && editingPatternIndex !== clickedIndex) {
				finishPatternEdit();
			}
			dragStartY = y;
			draggedIndex = clickedIndex;
		}
	}

	function handleMouseUp(event: MouseEvent): void {
		const wasDragging = isDragging;

		if (
			isDragging &&
			draggedIndex !== null &&
			dropTargetIndex !== null &&
			draggedIndex !== dropTargetIndex
		) {
			const result = PatternService.movePatternInOrder(
				patternOrder,
				draggedIndex,
				dropTargetIndex
			);
			projectStore.patternOrder = result.newPatternOrder;
			moveColor(draggedIndex, dropTargetIndex);
			adjustLoopPointAfterMove(draggedIndex, dropTargetIndex);

			if (currentPatternOrderIndex === draggedIndex) {
				currentPatternOrderIndex = dropTargetIndex;
				onPatternSelect?.(dropTargetIndex);
			} else if (
				draggedIndex < currentPatternOrderIndex &&
				dropTargetIndex >= currentPatternOrderIndex
			) {
				currentPatternOrderIndex--;
				onPatternSelect?.(currentPatternOrderIndex);
			} else if (
				draggedIndex > currentPatternOrderIndex &&
				dropTargetIndex <= currentPatternOrderIndex
			) {
				currentPatternOrderIndex++;
				onPatternSelect?.(currentPatternOrderIndex);
			}

			afterPatternOperation();
		}

		if (wasDragging) {
			justFinishedDrag = true;
		}

		isDragging = false;
		draggedIndex = null;
		dropTargetIndex = null;
		dragStartY = null;

		draw();

		if (lastMouseY !== null && lastMouseX !== null) {
			updateCursor(lastMouseY, lastMouseX);
		}
	}

	function handleWheel(event: WheelEvent): void {
		event.preventDefault();
		const newIndex = currentPatternOrderIndex + Math.sign(event.deltaY);

		if (newIndex >= 0 && newIndex < patternOrder.length) {
			switchPattern(newIndex);
		}
	}

	function handleKeyDown(event: KeyboardEvent): void {
		const { key } = event;

		if (editingPatternIndex !== null) {
			if (key === 'Enter') {
				finishPatternEdit();
			} else if (key === 'Escape') {
				editingPatternIndex = null;
				editingPatternValue = '';
				draw();
			} else if (key >= '0' && key <= '9') {
				if (editingPatternValue.length < 2) {
					editingPatternValue += key;
					applyPatternEditValue(editingPatternValue);
					if (editingPatternValue.length === 2) {
						editingPatternIndex = null;
						editingPatternValue = '';
					}
					draw();
				}
			} else if (key === 'Backspace') {
				editingPatternValue = editingPatternValue.slice(0, -1);
				draw();
			}
			return;
		}

		if (key === 'ArrowUp' && currentPatternOrderIndex > 0) {
			event.preventDefault();
			switchPattern(currentPatternOrderIndex - 1);
		} else if (key === 'ArrowDown' && currentPatternOrderIndex < patternOrder.length - 1) {
			event.preventDefault();
			switchPattern(currentPatternOrderIndex + 1);
		}
	}

	function applyPatternEditValue(value: string): void {
		if (editingPatternIndex === null || value === '') return;

		const displayedValue = value.padStart(2, '0');
		const newId = parseInt(displayedValue);

		const result = PatternService.setPatternIdInOrderMultiChip(
			projectStore.patterns,
			patternOrder,
			editingPatternIndex,
			newId,
			(songIndex) => projectStore.songs[songIndex]?.getSchema(),
			(songIndex) => projectStore.songs[songIndex]?.getEffectiveChannelLabels()
		);

		if (result) {
			result.newPatternsPerSong.forEach((newPatterns, songIndex) => {
				projectStore.updatePatterns(songIndex, newPatterns);
			});
			projectStore.patternOrder = result.newPatternOrder;
			onPatternOrderEdited?.();
		}
	}

	function finishPatternEdit(): void {
		if (editingPatternIndex === null) return;

		applyPatternEditValue(editingPatternValue);

		editingPatternIndex = null;
		editingPatternValue = '';
		draw();
	}

	let lastMouseY: number | null = null;
	let lastMouseX: number | null = null;
	let hoveredIndex: number | null = null;
	let hoveredButton: 'remove' | 'up' | 'add' | 'clone' | null = $state(null);
	let contextMenuPosition: { x: number; y: number } | null = $state(null);
	let contextMenuPatternIndex: number | null = $state(null);

	function updateCursor(mouseY?: number, mouseX?: number): void {
		if (!canvas || mouseY === undefined) return;

		const centerY = canvasHeight / 2;
		const { startIndex, endIndex } = getVisibleRange();

		let newHoveredIndex: number | null = null;

		const buttonAreaLeft = PADDING + CELL_WIDTH + BUTTON_SPACING;
		const buttonAreaRight = buttonAreaLeft + BUTTON_SIZE;
		const totalHeight = BUTTON_SIZE * 4 + BUTTON_SPACING * 3;
		const buttonAreaTop = centerY - totalHeight / 2;
		const buttonAreaBottom = buttonAreaTop + totalHeight;

		const isInButtonArea =
			mouseX !== undefined &&
			mouseX >= buttonAreaLeft &&
			mouseX <= buttonAreaRight &&
			mouseY >= buttonAreaTop &&
			mouseY <= buttonAreaBottom;

		if (!isInButtonArea && mouseX !== undefined && mouseX <= PADDING + CELL_WIDTH) {
			const calculatedIndex = Math.round(
				currentPatternOrderIndex + (mouseY - centerY) / CELL_HEIGHT
			);

			const isOverPattern =
				calculatedIndex >= 0 &&
				calculatedIndex < patternOrder.length &&
				calculatedIndex >= startIndex &&
				calculatedIndex <= endIndex;

			if (isOverPattern) {
				newHoveredIndex = calculatedIndex;
			}
		}

		if (hoveredIndex !== newHoveredIndex) {
			hoveredIndex = newHoveredIndex;
			draw();
		}

		if (!isDragging) {
			canvas.style.cursor = newHoveredIndex !== null ? 'grab' : 'default';
		}
	}

	function switchPattern(index: number): void {
		currentPatternOrderIndex = index;
		selectedRow = 0;
		onPatternSelect?.(index);

		if (lastMouseY !== null && lastMouseX !== null) {
			updateCursor(lastMouseY, lastMouseX);
		}
	}

	function afterPatternOperation(): void {
		lastDrawnOrderIndex = -1;
		lastPatternOrderLength = -1;
		draw();

		if (lastMouseY !== null && lastMouseX !== null) {
			updateCursor(lastMouseY, lastMouseX);
		}
	}

	function handleMouseMove(event: MouseEvent): void {
		const rect = canvas.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const x = event.clientX - rect.left;
		lastMouseY = y;
		lastMouseX = x;

		if (draggedIndex !== null && !isDragging && dragStartY !== null) {
			if (Math.abs(y - dragStartY) > DRAG_THRESHOLD) {
				if (editingPatternIndex !== null) {
					editingPatternIndex = null;
					editingPatternValue = '';
				}
				isDragging = true;
				canvas.style.cursor = 'grabbing';
				draw();
			}
		}

		if (isDragging && draggedIndex !== null) {
			const centerY = canvasHeight / 2;
			const newDropTargetIndex = Math.round(
				currentPatternOrderIndex + (y - centerY) / CELL_HEIGHT
			);

			if (newDropTargetIndex >= 0 && newDropTargetIndex < patternOrder.length) {
				if (dropTargetIndex !== newDropTargetIndex) {
					dropTargetIndex = newDropTargetIndex;
					draw();
				}
			}
			canvas.style.cursor = 'grabbing';
		} else {
			updateCursor(y, x);
		}
	}

	function handleMouseLeave(): void {
		const previousHoveredIndex = hoveredIndex;
		hoveredIndex = null;
		hoveredButton = null;
		lastMouseY = null;
		lastMouseX = null;

		if (!isDragging) {
			canvas.style.cursor = 'default';
			draggedIndex = null;
			dragStartY = null;
		}

		if (previousHoveredIndex !== null) {
			draw();
		}
	}

	function handleMouseEnter(): void {
		if (canvas) {
			canvas.focus();
		}
	}

	function addPatternAtIndex(index: number): void {
		const result = PatternService.addPatternAfterMultiChip(
			projectStore.patterns,
			patternOrder,
			index,
			(songIndex) => projectStore.songs[songIndex]?.getSchema(),
			(songIndex) => projectStore.songs[songIndex]?.getEffectiveChannelLabels()
		);

		result.newPatternsPerSong.forEach((newPatterns, songIndex) => {
			projectStore.updatePatterns(songIndex, newPatterns);
		});
		projectStore.patternOrder = result.newPatternOrder;
		shiftColorsAfterAdd(result.insertIndex);
		adjustLoopPointAfterAdd(result.insertIndex);
		currentPatternOrderIndex = result.insertIndex;
		selectedRow = 0;
		onPatternSelect?.(result.insertIndex);

		afterPatternOperation();
	}

	function removePatternAtIndex(index: number): void {
		const result = PatternService.removePatternAt(patternOrder, index);

		projectStore.patternOrder = result.newPatternOrder;
		shiftColorsAfterRemove(index);
		adjustLoopPointAfterRemove(index, result.newPatternOrder.length);

		currentPatternOrderIndex = PatternService.calculateAdjustedIndex(
			currentPatternOrderIndex,
			index,
			result.newPatternOrder.length
		);
		selectedRow = 0;
		onPatternSelect?.(currentPatternOrderIndex);

		afterPatternOperation();
	}

	function clonePatternAtIndex(index: number): void {
		const result = PatternService.clonePatternAfterMultiChip(
			projectStore.patterns,
			patternOrder,
			index,
			(songIndex) => projectStore.songs[songIndex]?.getSchema()
		);

		if (!result) return;

		result.newPatternsPerSong.forEach((newPatterns, songIndex) => {
			projectStore.updatePatterns(songIndex, newPatterns);
		});
		projectStore.patternOrder = result.newPatternOrder;
		shiftColorsAfterAdd(result.insertIndex);
		adjustLoopPointAfterAdd(result.insertIndex);
		currentPatternOrderIndex = result.insertIndex;
		selectedRow = 0;
		onPatternSelect?.(result.insertIndex);

		afterPatternOperation();
	}

	function makePatternUniqueAtIndex(index: number): void {
		if (projectStore.patterns.length > 1 && onMakeUnique) {
			onMakeUnique(index);
			return;
		}

		const targetPatternId = patternOrder[index];
		const targetPattern = patternsRecord[targetPatternId] ?? null;

		if (!targetPattern) return;

		const result = PatternService.makePatternUnique(
			patternsRecord,
			patternOrder,
			index,
			targetPattern
		);

		if (!result) return;

		projectStore.addPatternToAllSongs(result.newPatterns[result.newPatternId]);
		projectStore.patternOrder = result.newPatternOrder;

		if (index === currentPatternOrderIndex) {
			selectedRow = 0;
		}

		afterPatternOperation();
	}

	const buttonStartX = PADDING + CELL_WIDTH + BUTTON_SPACING;
	const buttonCenterY = $derived(canvasHeight / 2);
	const totalHeight = BUTTON_SIZE * 4 + BUTTON_SPACING * 3;
	const startY = $derived(buttonCenterY - totalHeight / 2);
	const canRemove = $derived(patternOrder.length > 1);

	function handleContextMenu(event: MouseEvent): void {
		event.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const centerY = canvasHeight / 2;

		const clickedIndex = Math.round(currentPatternOrderIndex + (y - centerY) / CELL_HEIGHT);

		if (clickedIndex >= 0 && clickedIndex < patternOrder.length) {
			if (x >= PADDING && x <= PADDING + CELL_WIDTH) {
				contextMenuPatternIndex = clickedIndex;
				contextMenuPosition = { x: event.clientX, y: event.clientY };
			}
		}
	}

	function closeContextMenu(): void {
		contextMenuPosition = null;
		contextMenuPatternIndex = null;
	}

	function handleContextMenuAction(data: { action: string }): void {
		if (contextMenuPatternIndex === null) {
			closeContextMenu();
			return;
		}

		const index = contextMenuPatternIndex;
		closeContextMenu();

		if (data.action === 'loop-set') {
			projectStore.loopPointId = index;
			draw();
			return;
		}

		if (data.action === 'loop-clear') {
			projectStore.loopPointId = 0;
			draw();
			return;
		}

		if (data.action === 'color-clear') {
			const next = { ...patternOrderColors };
			delete next[index];
			projectStore.patternOrderColors = next;
			draw();
			return;
		}

		if (data.action === 'color-picker') {
			open(ColorPickerModal, {
				initialColor: patternOrderColors[index] ?? '#808080'
			})
				.then((color: string | undefined) => {
					if (color !== undefined) {
						projectStore.patternOrderColors = { ...patternOrderColors, [index]: color };
						draw();
					}
				})
				.catch(() => {});
			return;
		}

		switch (data.action) {
			case 'make-unique':
				makePatternUniqueAtIndex(index);
				break;
			case 'delete':
				if (canRemove) {
					removePatternAtIndex(index);
				}
				break;
			case 'add':
				addPatternAtIndex(index);
				break;
			case 'clone':
				clonePatternAtIndex(index);
				break;
		}
	}

	const contextMenuItems = $derived.by((): MenuItem[] => {
		const hideLoopMenuItem = contextMenuPatternIndex === 0 && loopPointId === 0;
		const loopMenuItem: MenuItem | null =
			hideLoopMenuItem
				? null
				: contextMenuPatternIndex !== null && contextMenuPatternIndex === loopPointId
					? { label: 'Clear loop marker', type: 'normal', action: 'loop-clear' }
					: { label: 'Set loop marker', type: 'normal', action: 'loop-set' };
		const base: MenuItem[] = [
			...(loopMenuItem ? [loopMenuItem] : []),
			{ label: 'Make Unique', type: 'normal', action: 'make-unique' },
			{ label: 'Delete', type: 'normal', action: 'delete', disabled: () => !canRemove },
			{ label: 'Add', type: 'normal', action: 'add' },
			{ label: 'Clone', type: 'normal', action: 'clone' },
			{ label: 'Color...', type: 'normal', action: 'color-picker' }
		];
		const hasCustomColor =
			contextMenuPatternIndex !== null &&
			patternOrderColors[contextMenuPatternIndex] !== undefined;
		return hasCustomColor
			? [...base, { label: 'Clear color', type: 'normal' as const, action: 'color-clear' }]
			: base;
	});
</script>

<div style="width: {canvasWidth}px; height: {canvasHeight}px;" class="relative overflow-hidden">
	<canvas
		bind:this={canvas}
		tabindex="0"
		onclick={handleClick}
		onwheel={handleWheel}
		onkeydown={handleKeyDown}
		onmousedown={handleMouseDown}
		onmouseup={handleMouseUp}
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
		onmouseenter={handleMouseEnter}
		oncontextmenu={handleContextMenu}
		class="focus:border-opacity-50 border-pattern-empty bg-pattern-bg focus:border-pattern-text block border transition-colors duration-150 focus:outline-none"
		style="width: {canvasWidth}px; height: {canvasHeight}px;"></canvas>

	<div
		class="pointer-events-none absolute"
		style="left: {buttonStartX}px; top: {startY}px; width: {BUTTON_SIZE}px;">
		<PatternOrderButton
			buttonType="up"
			isHovered={hoveredButton === 'up'}
			onClick={() => makePatternUniqueAtIndex(currentPatternOrderIndex)}
			onMouseEnter={() => (hoveredButton = 'up')}
			onMouseLeave={() => (hoveredButton = null)}
			title="Make Unique"
			size={BUTTON_SIZE}>
			<IconCarbonUnlink
				class="text-pattern-text"
				style="height: {BUTTON_SIZE - 6}px; width: {BUTTON_SIZE - 6}px;" />
		</PatternOrderButton>
		<PatternOrderButton
			buttonType="remove"
			isHovered={hoveredButton === 'remove'}
			onClick={() => {
				if (canRemove) removePatternAtIndex(currentPatternOrderIndex);
			}}
			onMouseEnter={() => (hoveredButton = canRemove ? 'remove' : null)}
			onMouseLeave={() => (hoveredButton = null)}
			disabled={!canRemove}
			title="Remove"
			size={BUTTON_SIZE}>
			<IconCarbonSubtract
				class="text-pattern-text"
				style="height: {BUTTON_SIZE - 6}px; width: {BUTTON_SIZE - 6}px;" />
		</PatternOrderButton>
		<PatternOrderButton
			buttonType="add"
			isHovered={hoveredButton === 'add'}
			onClick={() => addPatternAtIndex(currentPatternOrderIndex)}
			onMouseEnter={() => (hoveredButton = 'add')}
			onMouseLeave={() => (hoveredButton = null)}
			title="Add"
			size={BUTTON_SIZE}>
			<IconCarbonAdd
				class="text-pattern-text"
				style="height: {BUTTON_SIZE - 6}px; width: {BUTTON_SIZE - 6}px;" />
		</PatternOrderButton>
		<PatternOrderButton
			buttonType="clone"
			isHovered={hoveredButton === 'clone'}
			onClick={() => clonePatternAtIndex(currentPatternOrderIndex)}
			onMouseEnter={() => (hoveredButton = 'clone')}
			onMouseLeave={() => (hoveredButton = null)}
			title="Clone"
			size={BUTTON_SIZE}
			hasMargin={false}>
			<IconCarbonCopy
				class="text-pattern-text"
				style="height: {BUTTON_SIZE - 6}px; width: {BUTTON_SIZE - 6}px;" />
		</PatternOrderButton>
	</div>

	<ContextMenu
		position={contextMenuPosition}
		items={contextMenuItems}
		onAction={handleContextMenuAction}
		onClose={closeContextMenu} />
</div>
