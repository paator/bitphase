<script lang="ts">
	import type { InstrumentMacroField, InstrumentMacroValue } from '../../chips/base/instrument-macros';
	import { formatMacroSequenceText } from './instrument-macro-ui';

	let {
		field,
		values,
		loop,
		asHex = false,
		onCommit
	}: {
		field: InstrumentMacroField;
		values: InstrumentMacroValue[];
		loop: number;
		asHex?: boolean;
		onCommit: (text: string) => void;
	} = $props();

	let draft = $state<string | null>(null);
	const formatted = $derived(formatMacroSequenceText(values, loop, field, asHex));
	const text = $derived(draft ?? formatted);

	function handleFocus(event: FocusEvent): void {
		draft = formatted;
		(event.currentTarget as HTMLInputElement).select();
	}

	function handleInput(event: Event): void {
		draft = (event.currentTarget as HTMLInputElement).value;
		onCommit(draft);
	}

	function handleBlur(): void {
		if (draft !== null) onCommit(draft);
		draft = null;
	}

	function handleKeydown(event: KeyboardEvent): void {
		event.stopPropagation();
		if (event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			draft = null;
			(event.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<input
	type="text"
	class="w-full min-w-0 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] px-2 py-1 font-mono text-xs text-[var(--color-app-text)] placeholder:text-[var(--color-app-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pattern-note)]/50"
	value={text}
	spellcheck="false"
	aria-label="{field.title} sequence"
	title="Space-separated values. | marks the loop start."
	placeholder="| 15 12 8"
	onfocus={handleFocus}
	oninput={handleInput}
	onkeydown={handleKeydown}
	onblur={handleBlur} />
