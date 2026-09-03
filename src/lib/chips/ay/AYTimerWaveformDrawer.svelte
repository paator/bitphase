<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import AYTimerWaveformEditor from './AYTimerWaveformEditor.svelte';
	import { getAyTimerEffectsContext } from './ay-timer-effects-context';

	let {
		rowIndex,
		isExpanded = false
	}: {
		rowIndex: number;
		isExpanded?: boolean;
	} = $props();

	const controller = getAyTimerEffectsContext();

	let overlayEl: HTMLElement | null = $state(null);

	onMount(() => {
		const panel = document.getElementById('instrument-detail-panel');
		const target = panel ?? document.body;
		if (overlayEl) target.appendChild(overlayEl);
	});

	onDestroy(() => {
		if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
	});

	function handleSave(): void {
		controller.saveWaveformEditor();
	}

	function handleDiscard(): void {
		controller.discardWaveformEditor();
	}
</script>

<div bind:this={overlayEl} class="contents">
	<div
		class="absolute inset-0 z-30 bg-black/40 backdrop-blur-[1px]"
		role="presentation"
		onkeydown={(e) => e.key === 'Escape' && handleDiscard()}>
	</div>
	<div
		class="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
		aria-hidden="true">
		<div
			class="pointer-events-auto w-[480px] overflow-hidden rounded-lg border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-2xl"
			role="dialog"
			aria-label="Waveform editor"
			aria-modal="true">
			<AYTimerWaveformEditor
				{rowIndex}
				{isExpanded}
				canvasHeight={200}
				showSaveDiscard={true}
				onsave={handleSave}
				onclose={handleDiscard} />
		</div>
	</div>
</div>
