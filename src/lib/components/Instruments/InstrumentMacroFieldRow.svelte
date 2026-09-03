<script lang="ts">
	import IconCarbonCheckmark from '~icons/carbon/checkmark';
	import IconCarbonClose from '~icons/carbon/close';
	import IconCarbonEdit from '~icons/carbon/edit';
	import IconCarbonChartWinLoss from '~icons/carbon/chart-win-loss';
	import IconCarbonSettingsAdjust from '~icons/carbon/settings-adjust';
	import {
		instrumentMacroAccentColor,
		type InstrumentMacroField,
		type InstrumentMacroValue
	} from '../../chips/base/instrument-macros';
	import { CommitNumericInput } from '../CommitNumericInput';
	import {
		instrumentMacroEnumIsActive,
		instrumentMacroEnumOption,
		instrumentMacroEnumLabel,
		instrumentMacroUsesBarChart,
		integerMacroBarStyle,
		MACRO_VALUE_LABEL_HEIGHT,
		MACRO_STEP_INPUT_CLASS,
		MACRO_STEP_LABEL_CLASS,
		macroIconClass
	} from './instrument-macro-ui';

	let {
		field,
		values,
		stepWidthPx,
		rowHeight,
		asHex = false,
		isExpanded = false,
		onPaintStart,
		onCommitValue,
		onStepClick,
		isStepEnabled
	}: {
		field: InstrumentMacroField;
		values: InstrumentMacroValue[];
		stepWidthPx: number;
		rowHeight: number;
		asHex?: boolean;
		isExpanded?: boolean;
		onPaintStart: (index: number, event: PointerEvent, fromY: boolean) => void;
		onCommitValue: (index: number, value: InstrumentMacroValue) => void;
		onStepClick?: (fieldId: string, index: number) => void;
		isStepEnabled?: (fieldId: string, index: number) => boolean;
	} = $props();

	const accent = $derived(instrumentMacroAccentColor(field.accent));
	const gateIconClass = $derived(macroIconClass(isExpanded));
	const sequenceWidth = $derived(stepWidthPx * values.length);
	const usesBarChart = $derived(instrumentMacroUsesBarChart(field));

</script>

<div
	class="flex shrink-0"
	style="width: {sequenceWidth}px; height: {rowHeight}px"
	data-shared-row={field.id}>
	{#each values as value, index (index)}
		{#if usesBarChart}
			<div
				class="flex flex-col border-r border-[var(--color-app-border)]/60 last:border-r-0"
				style="width: {stepWidthPx}px; height: {rowHeight}px">
				<button
					type="button"
					class="relative min-h-0 flex-1 cursor-crosshair border-0 bg-[var(--color-app-surface-secondary)] p-0"
					aria-label="{field.kind === 'enum'
						? `${field.label} ${instrumentMacroEnumLabel(field, value)} step ${index}`
						: `${field.label} step ${index}`}"
					onpointerdown={(event) => onPaintStart(index, event, true)}>
					<div
						class="absolute rounded-sm"
						style={integerMacroBarStyle(field, value, accent)}>
					</div>
				</button>
				<div
					class="flex shrink-0 items-center justify-center"
					style="height: {MACRO_VALUE_LABEL_HEIGHT}px">
					{#if field.kind === 'enum'}
						<span class={MACRO_STEP_LABEL_CLASS}>{instrumentMacroEnumLabel(field, value)}</span>
					{:else}
						<CommitNumericInput
							value={Number(value)}
							{asHex}
							min={field.min}
							max={field.max}
							live={false}
							class={MACRO_STEP_INPUT_CLASS}
							ariaLabel="{field.label} step {index}"
							oncommit={(next) => onCommitValue(index, next)} />
					{/if}
				</div>
			</div>
		{:else if field.kind === 'enum'}
			{@const option = instrumentMacroEnumOption(field, value)}
			{@const optionLabel = option?.label ?? ''}
			{@const active = instrumentMacroEnumIsActive(field, value)}
			<button
				type="button"
				class="flex cursor-pointer items-center justify-center border-r border-[var(--color-app-border)]/60 text-[0.7rem] font-medium last:border-r-0"
				style="width: {stepWidthPx}px; height: {rowHeight}px; background: {active
					? accent
					: 'var(--color-app-surface-secondary)'}; color: {active
					? 'var(--color-app-surface)'
					: 'var(--color-app-text-muted)'}"
				aria-label="{field.label} {optionLabel} step {index}"
				title={optionLabel}
				onpointerdown={(event) => onPaintStart(index, event, false)}>
				{#if option?.icon === 'period'}
					<IconCarbonSettingsAdjust class={gateIconClass} />
				{:else if option?.icon === 'semitone'}
					<IconCarbonChartWinLoss class={gateIconClass} />
				{:else}
					{optionLabel}
				{/if}
			</button>
		{:else if field.kind === 'waveform'}
			{@const waveformEnabled = isStepEnabled?.(field.id, index) ?? true}
			<button
				type="button"
				class="flex items-center justify-center border-r border-[var(--color-app-border)]/60 bg-[var(--color-app-surface-secondary)] last:border-r-0 {waveformEnabled ? 'cursor-pointer text-[var(--color-app-text-muted)] hover:text-[var(--color-app-text)]' : 'cursor-default text-[var(--color-app-border)]'}"
				style="width: {stepWidthPx}px; height: {rowHeight}px;"
				aria-label="{field.label} step {index}"
				aria-disabled={!waveformEnabled}
				onclick={() => waveformEnabled && onStepClick?.(field.id, index)}>
				<IconCarbonEdit class={gateIconClass} />
			</button>
		{:else}
			<button
				type="button"
				class="flex cursor-pointer items-center justify-center border-r border-[var(--color-app-border)]/60 last:border-r-0"
				style="width: {stepWidthPx}px; height: {rowHeight}px; background: {value
					? accent
					: 'var(--color-app-surface-secondary)'}; color: {value
					? 'var(--color-app-surface)'
					: 'var(--color-app-text-muted)'}"
				aria-label="{field.label} step {index}"
				aria-pressed={Boolean(value)}
				onpointerdown={(event) => onPaintStart(index, event, false)}
				onclick={() => onStepClick?.(field.id, index)}>
				{#if value}
					<IconCarbonCheckmark class={gateIconClass} />
				{:else}
					<IconCarbonClose class={gateIconClass} />
				{/if}
			</button>
		{/if}
	{/each}
</div>
