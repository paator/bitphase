<script lang="ts">
	import IconCarbonColorPalette from '~icons/carbon/color-palette';
	import { parseHexColor } from '../../utils/hex-color';
	import { open } from '../../services/modal/modal-service';
	import ColorPickerModal from '../Modal/ColorPickerModal.svelte';
	import Button from '../Button/Button.svelte';

	let {
		color,
		onColorChange
	}: {
		color?: string;
		onColorChange: (color: string | undefined) => void;
	} = $props();

	const swatchColor = $derived(parseHexColor(color ?? '') ?? '');
	const iconClass = $derived.by(() => {
		if (!swatchColor) return 'text-[var(--color-app-text-muted)]';
		const r = parseInt(swatchColor.slice(1, 3), 16);
		const g = parseInt(swatchColor.slice(3, 5), 16);
		const b = parseInt(swatchColor.slice(5, 7), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.55 ? 'text-black/70' : 'text-white';
	});

	function openColorPicker(): void {
		open(ColorPickerModal, {
			initialColor: swatchColor || '#808080',
			title: 'Instrument color'
		})
			.then((next: string | undefined) => {
				if (next === undefined) return;
				const hex = parseHexColor(next);
				if (hex) onColorChange(hex);
			})
			.catch(() => {});
	}

	function clearColor(): void {
		onColorChange(undefined);
	}
</script>

<div class="flex items-center gap-2">
	<span class="shrink-0 text-xs text-[var(--color-app-text-muted)]">Color:</span>
	<button
		type="button"
		onclick={openColorPicker}
		title="Set instrument color"
		aria-label="Set instrument color"
		class="flex h-7 w-10 cursor-pointer items-center justify-center rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)]"
		style:background={swatchColor || undefined}>
		<IconCarbonColorPalette class={['h-3.5 w-3.5', iconClass]} />
	</button>
	{#if color}
		<Button variant="ghost" size="sm" onclick={clearColor}>Clear</Button>
	{/if}
</div>
