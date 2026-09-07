<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { ModalPanel } from '../ModalPanel';
	import { parseHexColor } from '../../utils/hex-color';

	let {
		initialColor = '#808080',
		title = 'Pattern order color',
		resolve,
		dismiss
	}: {
		initialColor?: string;
		title?: string;
		resolve?: (value: string) => void;
		dismiss?: () => void;
	} = $props();

	let selectedColor = $state(initialColor);
	let hexInputValue = $state(initialColor);

	function handleHexInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		const hex = parseHexColor(value);
		if (hex !== null) {
			selectedColor = hex;
			hexInputValue = hex;
		} else {
			hexInputValue = value;
		}
	}

	function handleColorPickerInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		selectedColor = value;
		hexInputValue = value;
	}

	function handleSave() {
		resolve?.(selectedColor);
	}

	function handleDismiss() {
		dismiss?.();
	}
</script>

<ModalPanel {title} width="w-80" compact>
	{#snippet children()}
		<div class="flex items-center gap-3">
			<input
				type="color"
				value={selectedColor}
				oninput={handleColorPickerInput}
				class="h-10 w-14 cursor-pointer rounded border border-[var(--color-app-border)] bg-transparent p-0" />
			<input
				type="text"
				bind:value={hexInputValue}
				oninput={handleHexInput}
				placeholder="#000000"
				class="font-mono w-24 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1.5 text-[var(--color-app-text-primary)] focus:border-[var(--color-app-primary)] focus:outline-none" />
		</div>
	{/snippet}

	{#snippet footer()}
		<Button variant="secondary" onclick={handleDismiss}>Dismiss</Button>
		<Button variant="primary" onclick={handleSave}>Save</Button>
	{/snippet}
</ModalPanel>
