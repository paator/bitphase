<script lang="ts">
	import type { Chip } from '../../chips/types';
	import {
		formatEffectStatusHint,
		listPatternEffectStatusSections
	} from '../../chips/base/effect-status';
	import { getEffectStatusHintColorSegments } from '../../chips/base/effect-format-color';

	let { chips = [] }: { chips?: Array<Pick<Chip, 'name' | 'type' | 'listEffectStatusHints'>> } =
		$props();

	const sections = $derived(listPatternEffectStatusSections(chips));
</script>

<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
	{#each sections as section (section.id)}
		<div
			class="sticky top-0 z-10 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-[var(--color-app-text-muted)]">
			{section.title}
		</div>
		{#each section.hints as hint (`${section.id}-${hint.format}`)}
			{@const segments = getEffectStatusHintColorSegments(hint)}
			<p
				class="flex flex-wrap border-b border-[var(--color-app-border)] px-2 py-1 font-mono text-[0.65rem] leading-snug"
				title={formatEffectStatusHint(hint)}>
				{#each segments as segment, index (`${section.id}-${hint.format}-${index}`)}
					<span style:color={segment.color}>{segment.text}</span>
				{/each}
			</p>
		{/each}
	{/each}
</div>
