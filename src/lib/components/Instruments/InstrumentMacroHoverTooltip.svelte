<script lang="ts">
	import IconCarbonMusic from '~icons/carbon/music';
	import type { InstrumentMacroValueTooltip } from '../../chips/base/instrument-macros';

	let {
		visible = false,
		x = 0,
		y = 0,
		label,
		detail = '',
		accentColor,
		rich = null
	}: {
		visible?: boolean;
		x?: number;
		y?: number;
		label: string;
		detail?: string;
		accentColor?: string;
		rich?: InstrumentMacroValueTooltip | null;
	} = $props();

	function points(levels: readonly number[], width: number, height: number): string {
		const last = Math.max(0, levels.length - 1);
		return levels
			.map((level, index) => {
				const px = last === 0 ? 0 : (index / last) * width;
				const py = height - (Math.max(0, Math.min(15, level)) / 15) * height;
				return `${px},${py}`;
			})
			.join(' ');
	}

	function fillPoints(levels: readonly number[], width: number, height: number): string {
		const line = points(levels, width, height);
		return `0,${height} ${line} ${width},${height}`;
	}
</script>

{#if visible}
	<div
		class="pointer-events-none fixed z-50 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 shadow-lg {rich
			? 'w-60'
			: 'max-w-56'}"
		style:left="{x + 14}px"
		style:top="{y + 14}px">
		<div class="text-[0.65rem] font-medium" style:color={accentColor}>{label}</div>
		{#if rich}
			<div class="text-[0.6rem] text-[var(--color-app-text-secondary)]">{rich.detail}</div>
			{#if rich.icon === 'music'}
				<div class="mt-1 flex h-8 items-center justify-center" style:color={accentColor}>
					<IconCarbonMusic class="size-6" />
				</div>
			{:else if rich.series && rich.series.length > 0}
				<svg viewBox="0 0 100 28" class="mt-1 h-8 w-full" aria-hidden="true">
					<polygon
						points={fillPoints(rich.series[0]!.levels, 100, 28)}
						fill={accentColor}
						opacity="0.85" />
					{#if rich.series[1]}
						<polyline
							points={points(rich.series[1].levels, 100, 28)}
							fill="none"
							stroke="var(--color-app-text)"
							stroke-width="1.25"
							stroke-dasharray="2 1.5" />
					{/if}
				</svg>
			{/if}
			{#if rich.legend && rich.legend.length > 0}
				<div class="mt-1 grid grid-cols-8 gap-0.5">
					{#each rich.legend as item (item.label)}
						<div
							class="flex flex-col items-center gap-px"
							style:opacity={item.active ? 1 : 0.4}>
							{#if item.icon === 'music'}
								<span
									class="flex h-3.5 w-full items-center justify-center"
									style:color={item.active
										? accentColor
										: 'var(--color-app-text-muted)'}>
									<IconCarbonMusic class="size-3.5" />
								</span>
							{:else}
								<svg viewBox="0 0 32 14" class="h-3.5 w-full" aria-hidden="true">
									<polyline
										points={points(item.levels, 32, 14)}
										fill="none"
										stroke={item.active
											? accentColor
											: 'var(--color-app-text-muted)'}
										stroke-width="1.5" />
								</svg>
							{/if}
							<span
								class="font-mono text-[0.55rem] leading-none {item.active
									? 'font-bold'
									: ''}"
								style:color={item.active
									? accentColor
									: 'var(--color-app-text-muted)'}>{item.label}</span>
						</div>
					{/each}
				</div>
			{/if}
			{#if rich.hint}
				<p
					class="mt-1 text-[0.55rem] leading-snug whitespace-pre-line text-[var(--color-app-text-muted)]">
					{rich.hint}
				</p>
			{/if}
		{:else if detail}
			<div class="text-[0.6rem] text-[var(--color-app-text-muted)]">{detail}</div>
		{/if}
	</div>
{/if}
