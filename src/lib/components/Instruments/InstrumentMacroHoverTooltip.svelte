<script lang="ts">
	let {
		visible = false,
		x = 0,
		y = 0,
		label,
		detail = '',
		accentColor
	}: {
		visible?: boolean;
		x?: number;
		y?: number;
		label: string;
		detail?: string;
		accentColor?: string;
	} = $props();
</script>

{#if visible}
	<div
		class="pointer-events-none fixed z-50 max-w-56 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 shadow-lg"
		style:left="{x + 14}px"
		style:top="{y + 14}px">
		<div class="text-[0.65rem] font-medium" style:color={accentColor}>{label}</div>
		{#if detail}
			<div class="text-[0.6rem] text-[var(--color-app-text-muted)]">{detail}</div>
		{/if}
	</div>
{/if}
