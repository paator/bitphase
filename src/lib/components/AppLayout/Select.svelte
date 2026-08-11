<script lang="ts">
	import IconCarbonEdit from '~icons/carbon/edit';
	import IconCarbonChevronDown from '~icons/carbon/chevron-down';
	import { CommitNumericInput } from '../CommitNumericInput';

	type SelectOption = {
		label: string;
		value: number;
	};

	let {
		value = $bindable(),
		options,
		onchange,
		showCustomOption = true,
		disabled = false,
		min,
		max,
		defaultValue
	}: {
		value: number;
		options: SelectOption[];
		onchange?: () => void;
		showCustomOption?: boolean;
		disabled?: boolean;
		min?: number;
		max?: number;
		defaultValue?: number;
	} = $props();

	let selectedOption = $state<string>('');
	let isCustom = $state(false);
	let customValue = $state(0);

	function isFiniteNumber(candidate: unknown): candidate is number {
		return typeof candidate === 'number' && Number.isFinite(candidate);
	}

	const resolvedDefault = $derived.by(() => {
		if (isFiniteNumber(defaultValue)) return defaultValue;
		return options[0]?.value ?? 0;
	});

	const fallbackValue = $derived.by(() => {
		if (
			isFiniteNumber(value) &&
			(min === undefined || value >= min) &&
			(max === undefined || value <= max)
		) {
			return value;
		}
		return resolvedDefault;
	});

	function emitChange(next: number): void {
		if (value === next) return;
		value = next;
		onchange?.();
	}

	function handleSelectionChange(): void {
		if (selectedOption === 'Custom') {
			isCustom = true;
			customValue = fallbackValue;
			return;
		}
		isCustom = false;
		const option = options.find((opt) => opt.label === selectedOption);
		if (option) {
			emitChange(option.value);
		}
	}

	function handleCustomValueChange(next: number): void {
		if (!isFiniteNumber(next)) {
			const repaired = fallbackValue;
			customValue = repaired;
			emitChange(repaired);
			return;
		}
		let clamped = next;
		if (min !== undefined) clamped = Math.max(min, clamped);
		if (max !== undefined) clamped = Math.min(max, clamped);
		customValue = clamped;
		emitChange(clamped);
	}

	function switchToDropdown(): void {
		isCustom = false;
		selectedOption = '';
	}

	$effect(() => {
		const matchingOption = options.find((option) => option.value === value);
		if (matchingOption) {
			selectedOption = matchingOption.label;
			isCustom = false;
			return;
		}
		if (
			isFiniteNumber(value) &&
			(min === undefined || value >= min) &&
			(max === undefined || value <= max)
		) {
			selectedOption = 'Custom';
			isCustom = true;
			customValue = value;
			return;
		}
		const repaired = resolvedDefault;
		const repairedOption = options.find((option) => option.value === repaired);
		selectedOption = repairedOption?.label ?? 'Custom';
		isCustom = repairedOption === undefined;
		customValue = repaired;
		if (value !== repaired) {
			value = repaired;
			onchange?.();
		}
	});
</script>

{#if isCustom}
	<div class="relative">
		<CommitNumericInput
			bind:value={customValue}
			live={false}
			allowDecimal={true}
			{min}
			{max}
			{disabled}
			class="w-full rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 pr-8 text-xs text-[var(--color-app-text-secondary)] placeholder-[var(--color-app-text-muted)] focus:border-transparent focus:ring-1 focus:ring-[var(--color-app-primary)] focus:outline-none {disabled
				? 'cursor-not-allowed opacity-50'
				: ''}"
			oncommit={handleCustomValueChange} />
		<button
			onclick={switchToDropdown}
			{disabled}
			class="absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 text-[var(--color-app-text-muted)] hover:bg-[var(--color-app-surface-hover)] hover:text-[var(--color-app-text-secondary)]"
			class:cursor-not-allowed={disabled}
			class:opacity-50={disabled}
			title="Switch to preset options">
			<IconCarbonEdit class="h-3 w-3" />
		</button>
	</div>
{:else}
	<div class="relative">
		<select
			bind:value={selectedOption}
			onchange={handleSelectionChange}
			{disabled}
			class="w-full rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 pr-8 text-xs text-[var(--color-app-text-secondary)] focus:border-transparent focus:ring-1 focus:ring-[var(--color-app-primary)] focus:outline-none"
			class:cursor-pointer={!disabled}
			class:cursor-not-allowed={disabled}
			class:opacity-50={disabled}>
			<option value="" disabled>Select option</option>
			{#each options as option}
				<option value={option.label}>{option.label}</option>
			{/each}
			{#if showCustomOption}
				<option value="Custom">Custom</option>
			{/if}
		</select>
		<div class="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer">
			<IconCarbonChevronDown class="h-3 w-3 text-[var(--color-app-text-muted)]" />
		</div>
	</div>
{/if}
