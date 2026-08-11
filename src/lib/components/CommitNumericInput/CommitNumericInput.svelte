<script lang="ts">
	import {
		formatRowEditorNumber,
		parseRowEditorNumericText,
		shouldBlockRowEditorNumericKey
	} from '../../utils/row-editor-numeric';

	let {
		value = $bindable<number>(),
		asHex = false,
		min,
		max,
		maxDigits,
		live = true,
		class: className = '',
		id,
		title,
		inputmode,
		onkeydown,
		oncommit,
		onValueChange
	}: {
		value: number;
		asHex?: boolean;
		min?: number;
		max?: number;
		maxDigits?: number;
		live?: boolean;
		class?: string;
		id?: string;
		title?: string;
		inputmode?: string;
		onkeydown?: (e: KeyboardEvent) => void;
		oncommit?: (value: number) => void;
		onValueChange?: (value: number) => void;
	} = $props();

	let draft = $state<string | null>(null);

	const resolvedInputMode = $derived(inputmode ?? (asHex ? 'text' : 'numeric'));
	const limits = $derived({ min, max, maxDigits });
	const text = $derived(
		draft !== null ? draft : formatRowEditorNumber(value, asHex)
	);

	function setValue(next: number): void {
		if (next !== value) {
			value = next;
			onValueChange?.(next);
		}
	}

	function commit(): number {
		const source = draft ?? formatRowEditorNumber(value, asHex);
		const parsed = parseRowEditorNumericText(source, asHex, limits);
		const fallback =
			typeof value === 'number' && Number.isFinite(value) ? value : (min ?? 0);
		let next = parsed ?? fallback;
		if (min !== undefined) next = Math.max(min, next);
		if (max !== undefined) next = Math.min(max, next);
		setValue(next);
		oncommit?.(next);
		return next;
	}

	function handleFocus(event: FocusEvent): void {
		draft = formatRowEditorNumber(value, asHex);
		(event.target as HTMLInputElement).select();
	}

	function handleBlur(): void {
		if (draft === null) return;
		commit();
		draft = null;
	}

	function handleInput(event: Event): void {
		draft = (event.target as HTMLInputElement).value;
		if (!live) return;
		const parsed = parseRowEditorNumericText(draft, asHex, limits);
		if (parsed !== null) {
			setValue(parsed);
			draft = formatRowEditorNumber(parsed, asHex);
		}
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
			draft = null;
			(event.target as HTMLInputElement)?.blur();
			return;
		}

		const valueBefore = value;
		onkeydown?.(event);
		if (value !== valueBefore && draft !== null) {
			draft = formatRowEditorNumber(value, asHex);
		}

		if (
			!event.defaultPrevented &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey &&
			shouldBlockRowEditorNumericKey(event.key, asHex)
		) {
			event.preventDefault();
		}
	}
</script>

<input
	type="text"
	{id}
	{title}
	inputmode={resolvedInputMode}
	class={className}
	value={text}
	onfocus={handleFocus}
	onblur={handleBlur}
	oninput={handleInput}
	onkeydown={handleKeyDown} />
