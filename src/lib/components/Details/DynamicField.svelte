<script lang="ts">
	import type { ChipSetting } from '../../chips/base/schema';
	import Input from '../Input/Input.svelte';
	import Select from '../AppLayout/Select.svelte';
	import { CommitNumericInput } from '../CommitNumericInput';

	let {
		setting,
		value = $bindable(),
		onChange,
		context = {},
		hintOverride = undefined
	}: {
		setting: ChipSetting;
		value: unknown;
		onChange?: (key: string, newValue: unknown, setting: ChipSetting) => void;
		context?: Record<string, unknown>;
		hintOverride?: string | null;
	} = $props();

	function handleChange(newValue: unknown) {
		value = newValue;
		onChange?.(setting.key, newValue, setting);
	}

	const selectOptions = $derived.by(() => {
		if (setting.type !== 'select' || !setting.options) return [];
		const base = setting.options.map((opt) => ({
			label: opt.label,
			value: typeof opt.value === 'number' ? opt.value : parseFloat(String(opt.value))
		}));
		if (setting.dynamicOption) {
			base.push({
				label: setting.dynamicOption.label(context),
				value: setting.dynamicOption.value
			});
		}
		return base;
	});

	const visible = $derived(
		!setting.showWhen || context[setting.showWhen.key] == setting.showWhen.value
	);

	const disabled = $derived(
		setting.disabledWhen != null &&
			context[setting.disabledWhen.key] == setting.disabledWhen.value
	);

	const toggleLabel = $derived(
		setting.type === 'toggle' && setting.options
			? (setting.options.find((opt) => opt.value === value)?.label ?? String(value))
			: String(value)
	);

	const hint = $derived(
		hintOverride !== undefined
			? hintOverride
			: setting.computedHint
				? setting.computedHint(value, context)
				: null
	);

	const numberValue = $derived.by(() => {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
		return Number(setting.defaultValue ?? setting.min ?? 0);
	});
</script>

{#if visible}
	{#if setting.type === 'text'}
		<Input bind:value={value as string} />
	{:else if setting.type === 'toggle' && setting.options}
		<button
			type="button"
			class="w-full rounded border border-[var(--color-app-border)] bg-[var(--color-pattern-bg)] px-2 py-1 text-xs transition-colors focus:border-transparent focus:ring-1 focus:ring-blue-500 focus:outline-none"
			class:cursor-pointer={!disabled}
			class:hover:bg-[var(--color-pattern-selected)]={!disabled}
			class:cursor-not-allowed={disabled}
			class:opacity-50={disabled}
			disabled={disabled}
			onclick={() => {
				if (disabled) return;
				const currentIndex = setting.options?.findIndex((opt) => opt.value === value) ?? 0;
				const nextIndex = (currentIndex + 1) % (setting.options?.length ?? 1);
				handleChange(setting.options?.[nextIndex]?.value);
			}}>
			{toggleLabel}
		</button>
	{:else if setting.type === 'select' && setting.options}
		<Select
			bind:value={value as number}
			options={selectOptions}
			showCustomOption={!setting.dynamicOption}
			{disabled}
			min={setting.min}
			max={setting.max}
			defaultValue={typeof setting.defaultValue === 'number' ? setting.defaultValue : undefined}
			onchange={() => onChange?.(setting.key, value, setting)} />
	{:else if setting.type === 'number'}
		<div class="flex items-center gap-2">
			<CommitNumericInput
				value={numberValue}
				min={setting.min}
				max={setting.max}
				live={false}
				class="min-w-0 flex-1 overflow-x-auto rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 text-xs text-[var(--color-app-text-secondary)] accent-[var(--color-app-primary)] placeholder-[var(--color-app-text-muted)] focus:border-[var(--color-app-primary)] focus:outline-none"
				onValueChange={handleChange}
				oncommit={handleChange} />
			{#if hint}
				<span class="text-xs text-[var(--color-app-text-muted)]">{hint}</span>
			{/if}
		</div>
	{/if}
	{#if setting.type !== 'number' && hint}
		<span class="text-xs text-[var(--color-app-text-muted)]">{hint}</span>
	{/if}
{/if}
