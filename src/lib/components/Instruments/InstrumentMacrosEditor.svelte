<script lang="ts">
	import type { Component } from 'svelte';
	import type { Instrument } from '../../models/song';
	import {
		groupInstrumentMacroFields,
		instrumentMacroAccentColor,
		instrumentMacroUpdates,
		resolveInstrumentMacros,
		type InstrumentMacroField,
		type InstrumentMacros
	} from '../../chips/base/instrument-macros';
	import InstrumentMacroSharedSequence from './InstrumentMacroSharedSequence.svelte';

	let {
		instrument,
		fields,
		asHex = false,
		isExpanded = false,
		icons = {},
		onInstrumentChange,
		onStepClick,
		isStepEnabled
	}: {
		instrument: Instrument;
		fields: readonly InstrumentMacroField[];
		asHex?: boolean;
		isExpanded?: boolean;
		icons?: Record<string, Component>;
		onInstrumentChange: (instrument: Instrument) => void;
		onStepClick?: (fieldId: string, index: number) => void;
		isStepEnabled?: (fieldId: string, index: number) => boolean;
	} = $props();

	const macros = $derived(resolveInstrumentMacros(instrument, fields));
	const groups = $derived(groupInstrumentMacroFields(fields));

	function commitMacros(nextMacros: InstrumentMacros): void {
		const updates = instrumentMacroUpdates(nextMacros, fields);
		onInstrumentChange({
			...instrument,
			macros: updates.macros
		});
	}

	function commitField(fieldId: string, nextMacros: InstrumentMacros): void {
		const next = nextMacros[fieldId];
		if (!next) return;
		commitMacros({ ...macros, [fieldId]: next });
	}
</script>

<div class="mt-3 mr-2 ml-2 flex min-w-0 flex-col gap-3">
	{#each groups as group (group.id)}
		{#if group.shareSequence || group.fields.length === 1}
			<InstrumentMacroSharedSequence
				label={group.label}
				fields={group.fields}
				{macros}
				{icons}
				{asHex}
				{isExpanded}
				onChange={commitMacros}
				{onStepClick}
				{isStepEnabled} />
		{:else}
			<section
				class="min-w-0 overflow-hidden rounded border border-l-[3px] border-[var(--color-app-border)] bg-[var(--color-app-surface)]"
				style:border-left-color={instrumentMacroAccentColor(group.fields[0]?.accent)}
				role="group"
				aria-label={group.label}>
				<h3
					class="px-2 py-1 text-[0.65rem] font-medium text-[var(--color-app-text-secondary)]">
					{group.label}
				</h3>
				{#each group.fields as field (field.id)}
					<InstrumentMacroSharedSequence
						label={field.label}
						title={field.title}
						fields={[field]}
						{macros}
						{icons}
						{asHex}
						{isExpanded}
						embedded
						onChange={(next) => commitField(field.id, next)}
						{onStepClick}
						{isStepEnabled} />
				{/each}
			</section>
		{/if}
	{/each}
</div>
