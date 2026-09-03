<script lang="ts">
	import type { Component } from 'svelte';
	import {
		clampInstrumentMacroLength,
		INSTRUMENT_MACRO_MAX_LENGTH,
		INSTRUMENT_MACRO_MIN_LENGTH,
		instrumentMacroAccentColor,
		normalizedToMacroValue,
		setInstrumentMacroValue,
		setSharedSequenceLength,
		setSharedSequenceLoop,
		type InstrumentMacro,
		type InstrumentMacroField,
		type InstrumentMacroValue,
		type InstrumentMacros
	} from '../../chips/base/instrument-macros';
	import {
		applyMacroLengthKey,
		applyMacroLoopKey,
		cycleInstrumentMacroEnum,
		formatInstrumentMacroValue,
		MACRO_BAR_INSET,
		MACRO_LENGTH_HANDLE_WIDTH,
		MACRO_LOOP_HANDLE_WIDTH,
		MACRO_VALUE_LABEL_HEIGHT,
		macroFieldRowHeight,
		macroStepWidthPx,
		scrollMacroHandleIntoView
	} from './instrument-macro-ui';
	import InstrumentMacroFieldRow from './InstrumentMacroFieldRow.svelte';
	import InstrumentMacroHoverTooltip from './InstrumentMacroHoverTooltip.svelte';
	import InstrumentMacroLengthHandle from './InstrumentMacroLengthHandle.svelte';
	import InstrumentMacroLoopHandle from './InstrumentMacroLoopHandle.svelte';
	import InstrumentMacroSequenceHeader from './InstrumentMacroSequenceHeader.svelte';

	let {
		label,
		title,
		fields,
		macros,
		icons = {},
		asHex = false,
		isExpanded = false,
		embedded = false,
		onChange,
		onStepClick,
		isStepEnabled
	}: {
		label: string;
		title?: string;
		fields: readonly InstrumentMacroField[];
		macros: InstrumentMacros;
		icons?: Record<string, Component>;
		asHex?: boolean;
		isExpanded?: boolean;
		embedded?: boolean;
		onChange: (macros: InstrumentMacros) => void;
		onStepClick?: (fieldId: string, index: number) => void;
		isStepEnabled?: (fieldId: string, index: number) => boolean;
	} = $props();

	const headerIcon = $derived(fields.length === 1 ? icons[fields[0]!.id] : undefined);
	const accentColor = $derived(instrumentMacroAccentColor(fields[0]?.accent));
	const stepWidthPx = $derived(macroStepWidthPx(isExpanded));
	const sequenceLength = $derived(
		Math.max(
			INSTRUMENT_MACRO_MIN_LENGTH,
			...fields.map((field) => macros[field.id]?.values.length ?? 0)
		)
	);
	const loopIndex = $derived(
		Math.max(0, Math.min(sequenceLength - 1, macros[fields[0]?.id ?? '']?.loop ?? 0))
	);
	const canRemove = $derived(sequenceLength > INSTRUMENT_MACRO_MIN_LENGTH);
	const canAdd = $derived(sequenceLength < INSTRUMENT_MACRO_MAX_LENGTH);
	const stackHeight = $derived.by(() =>
		fields.reduce((sum, field) => sum + macroFieldRowHeight(field, isExpanded), 0)
	);
	const rowDividerOffsets = $derived.by(() => {
		const offsets: number[] = [];
		let y = 0;
		for (let i = 0; i < fields.length - 1; i++) {
			y += macroFieldRowHeight(fields[i]!, isExpanded);
			offsets.push(y);
		}
		return offsets;
	});
	const sequenceWidth = $derived(stepWidthPx * sequenceLength);
	const loopHandleLeft = $derived(stepWidthPx * loopIndex - MACRO_LOOP_HANDLE_WIDTH / 2);
	const lengthHandleLeft = $derived(sequenceWidth);
	const lengthHandleHeight = $derived(Math.max(16, stackHeight - 4));

	let scrollerEl = $state<HTMLDivElement | null>(null);
	let sequenceEl = $state<HTMLDivElement | null>(null);
	let loopHandleEl = $state<HTMLDivElement | null>(null);
	let lengthHandleEl = $state<HTMLDivElement | null>(null);
	let isDraggingLoop = $state(false);
	let isDraggingLength = $state(false);
	let paintFieldId = $state<string | null>(null);
	let paintValue = $state<InstrumentMacroValue | null>(null);
	let paintFromY = $state(false);
	let hoverTooltip = $state<{
		x: number;
		y: number;
		label: string;
		detail: string;
		accentColor: string;
	} | null>(null);
	let previousLength: number | null = null;

	$effect(() => {
		const length = sequenceLength;
		void lengthHandleLeft;
		scrollMacroHandleIntoView(scrollerEl, lengthHandleEl, previousLength, length);
		previousLength = length;
	});

	function fieldMacro(field: InstrumentMacroField): InstrumentMacro {
		return macros[field.id] ?? { values: [field.defaultValue], loop: loopIndex };
	}

	function showTooltip(field: InstrumentMacroField, clientX: number, clientY: number): void {
		hoverTooltip = {
			x: clientX,
			y: clientY,
			label: field.title,
			detail: '',
			accentColor: instrumentMacroAccentColor(field.accent)
		};
	}

	function showStepTooltip(
		field: InstrumentMacroField,
		index: number,
		value: InstrumentMacroValue,
		clientX: number,
		clientY: number
	): void {
		hoverTooltip = {
			x: clientX,
			y: clientY,
			label: field.title,
			detail: `Step ${index}: ${formatInstrumentMacroValue(field, value, asHex)}`,
			accentColor: instrumentMacroAccentColor(field.accent)
		};
	}

	function clearTooltip(): void {
		if (paintFieldId !== null || isDraggingLoop || isDraggingLength) return;
		hoverTooltip = null;
	}

	function stepIndexFromClientX(clientX: number): number | null {
		const sequence = sequenceEl;
		if (!sequence || sequenceLength <= 0) return null;
		const x = clientX - sequence.getBoundingClientRect().left;
		const index = Math.floor(x / stepWidthPx);
		if (index < 0 || index >= sequenceLength) return null;
		return index;
	}

	function fieldFromClientY(clientY: number): InstrumentMacroField | null {
		const sequence = sequenceEl;
		if (!sequence) return null;
		const y = clientY - sequence.getBoundingClientRect().top;
		if (y < 0) return null;
		let offset = 0;
		for (const field of fields) {
			const height = macroFieldRowHeight(field, isExpanded);
			if (y < offset + height) return field;
			offset += height;
		}
		return null;
	}

	function canPaintField(field: InstrumentMacroField): boolean {
		if (paintValue === null) return false;
		if (field.kind === 'boolean') return typeof paintValue === 'boolean';
		if (field.kind === 'enum') return typeof paintValue === 'number';
		return false;
	}

	function integerFromClientY(
		field: InstrumentMacroField,
		clientY: number
	): InstrumentMacroValue {
		const row = sequenceEl?.querySelector(`[data-shared-row="${CSS.escape(field.id)}"]`);
		if (!(row instanceof HTMLElement)) return field.defaultValue;
		const rect = row.getBoundingClientRect();
		const plotHeight = rect.height - MACRO_VALUE_LABEL_HEIGHT;
		if (plotHeight <= 0) return field.defaultValue;
		const innerHeight = Math.max(1, plotHeight - MACRO_BAR_INSET * 2);
		const normalized = Math.max(
			0,
			Math.min(1, 1 - (clientY - rect.top - MACRO_BAR_INSET) / innerHeight)
		);
		return normalizedToMacroValue(normalized, field);
	}

	function setValue(
		field: InstrumentMacroField,
		index: number,
		value: InstrumentMacroValue
	): void {
		onChange({
			...macros,
			[field.id]: setInstrumentMacroValue(fieldMacro(field), field, index, value)
		});
	}

	function setLength(length: number): void {
		onChange(setSharedSequenceLength(macros, fields, length));
	}

	function setLoop(index: number): void {
		onChange(setSharedSequenceLoop(macros, fields, index));
	}

	function beginPaint(
		field: InstrumentMacroField,
		index: number,
		event: PointerEvent,
		fromY: boolean
	): void {
		if (field.kind === 'waveform') return;
		event.preventDefault();
		const sequence = sequenceEl;
		if (!sequence) return;
		sequence.setPointerCapture(event.pointerId);
		paintFieldId = field.id;
		paintFromY = fromY;
		if (fromY) {
			paintValue = null;
			const value = integerFromClientY(field, event.clientY);
			setValue(field, index, value);
			showStepTooltip(field, index, value, event.clientX, event.clientY);
			return;
		}
		if (field.kind === 'enum') {
			const next = cycleInstrumentMacroEnum(
				field,
				fieldMacro(field).values[index] ?? field.defaultValue
			);
			paintValue = next;
			setValue(field, index, next);
			showStepTooltip(field, index, next, event.clientX, event.clientY);
			return;
		}
		const next = !Boolean(fieldMacro(field).values[index]);
		paintValue = next;
		setValue(field, index, next);
		showStepTooltip(field, index, next, event.clientX, event.clientY);
	}

	function applyPaint(clientX: number, clientY: number): void {
		if (paintFieldId === null) return;
		const index = stepIndexFromClientX(clientX);
		if (index === null) return;
		if (paintFromY) {
			const field = fields.find((item) => item.id === paintFieldId);
			if (!field) return;
			setValue(field, index, integerFromClientY(field, clientY));
			return;
		}
		const field =
			fieldFromClientY(clientY) ?? fields.find((item) => item.id === paintFieldId);
		if (!field || !canPaintField(field) || paintValue === null) return;
		setValue(field, index, paintValue);
	}

	function applyLoopFromClientX(clientX: number): void {
		const index = stepIndexFromClientX(clientX);
		if (index === null) return;
		setLoop(index);
	}

	function applyLengthFromClientX(clientX: number): void {
		const sequence = sequenceEl;
		if (!sequence) return;
		const x = clientX - sequence.getBoundingClientRect().left;
		const length = clampInstrumentMacroLength(Math.round(x / stepWidthPx));
		if (length !== sequenceLength) setLength(length);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (isDraggingLength) {
			hoverTooltip = {
				x: event.clientX,
				y: event.clientY,
				label: `${label} length`,
				detail: `${sequenceLength} ${sequenceLength === 1 ? 'step' : 'steps'}`,
				accentColor
			};
			applyLengthFromClientX(event.clientX);
			return;
		}
		if (isDraggingLoop) {
			hoverTooltip = {
				x: event.clientX,
				y: event.clientY,
				label: `${label} loop`,
				detail: `Step ${loopIndex}`,
				accentColor
			};
			applyLoopFromClientX(event.clientX);
			return;
		}
		if (paintFieldId !== null) {
			applyPaint(event.clientX, event.clientY);
			const index = stepIndexFromClientX(event.clientX);
			const field =
				fieldFromClientY(event.clientY) ?? fields.find((item) => item.id === paintFieldId);
			if (field && index !== null) {
				const value = fieldMacro(field).values[index] ?? field.defaultValue;
				showStepTooltip(field, index, value, event.clientX, event.clientY);
			}
			return;
		}
		const index = stepIndexFromClientX(event.clientX);
		const field = fieldFromClientY(event.clientY);
		if (field && index !== null) {
			const value = fieldMacro(field).values[index] ?? field.defaultValue;
			showStepTooltip(field, index, value, event.clientX, event.clientY);
			return;
		}
		clearTooltip();
	}

	function stopDrag(event: PointerEvent): void {
		if (isDraggingLength) {
			isDraggingLength = false;
			lengthHandleEl?.releasePointerCapture(event.pointerId);
			return;
		}
		if (isDraggingLoop) {
			isDraggingLoop = false;
			loopHandleEl?.releasePointerCapture(event.pointerId);
			return;
		}
		if (paintFieldId === null) return;
		const stoppedField = fields.find((f) => f.id === paintFieldId);
		paintFieldId = null;
		paintValue = null;
		paintFromY = false;
		sequenceEl?.releasePointerCapture(event.pointerId);
		if (stoppedField) {
			const index = stepIndexFromClientX(event.clientX);
			if (index !== null) {
				const value = fieldMacro(stoppedField).values[index] ?? stoppedField.defaultValue;
				showStepTooltip(stoppedField, index, value, event.clientX, event.clientY);
			} else {
				showTooltip(stoppedField, event.clientX, event.clientY);
			}
		}
	}

	function handleLoopPointerDown(event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const handle = loopHandleEl;
		if (!handle) return;
		isDraggingLoop = true;
		handle.setPointerCapture(event.pointerId);
		applyLoopFromClientX(event.clientX);
	}

	function handleLengthPointerDown(event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const handle = lengthHandleEl;
		if (!handle) return;
		isDraggingLength = true;
		handle.setPointerCapture(event.pointerId);
		applyLengthFromClientX(event.clientX);
	}

	function handleLoopKeydown(event: KeyboardEvent): void {
		const next = applyMacroLoopKey(event, loopIndex, sequenceLength - 1);
		if (next !== null) setLoop(next);
	}

	function handleLengthKeydown(event: KeyboardEvent): void {
		const next = applyMacroLengthKey(event, sequenceLength);
		if (next !== null) setLength(next);
	}
</script>

<section
	class={[
		'min-w-0 overflow-hidden bg-[var(--color-app-surface)]',
		embedded
			? 'border-t border-[var(--color-app-border)]'
			: 'rounded border border-l-[3px] border-[var(--color-app-border)]'
	]}
	style:border-left-color={embedded ? undefined : accentColor}
	role="group"
	aria-label={label}
	onpointerleave={clearTooltip}>
	<InstrumentMacroSequenceHeader
		{label}
		title={title ?? label}
		icon={headerIcon}
		{accentColor}
		{isExpanded}
		{loopIndex}
		{sequenceLength}
		{canRemove}
		{canAdd}
		onRemoveStep={() => setLength(sequenceLength - 1)}
		onAddStep={() => setLength(sequenceLength + 1)} />

	<div bind:this={scrollerEl} class="min-w-0 overflow-x-auto overflow-y-hidden pr-2">
		<div
			bind:this={sequenceEl}
			class="relative w-fit"
			style="width: {Math.max(sequenceWidth, lengthHandleLeft + MACRO_LENGTH_HANDLE_WIDTH)}px"
			role="group"
			aria-label="{label} sequence"
			onpointermove={handlePointerMove}
			onpointerup={stopDrag}
			onpointercancel={stopDrag}>
			{#each rowDividerOffsets as top (top)}
				<div
					class="pointer-events-none absolute left-0 z-[5] h-px bg-[var(--color-app-border)]"
					style="top: {top}px; width: {sequenceWidth}px">
				</div>
			{/each}
			{#each fields as field (field.id)}
				<InstrumentMacroFieldRow
					{field}
					values={fieldMacro(field).values}
					{stepWidthPx}
					rowHeight={macroFieldRowHeight(field, isExpanded)}
					{asHex}
					{isExpanded}
					onPaintStart={(index, event, fromY) =>
						beginPaint(field, index, event, fromY)}
					onCommitValue={(index, value) => setValue(field, index, value)}
					{onStepClick}
					{isStepEnabled} />
			{/each}
			<InstrumentMacroLoopHandle
				bind:handleEl={loopHandleEl}
				left={loopHandleLeft}
				height={stackHeight}
				{loopIndex}
				maxIndex={Math.max(0, sequenceLength - 1)}
				{label}
				isDragging={isDraggingLoop}
				onpointerdown={handleLoopPointerDown}
				onpointermove={handlePointerMove}
				onpointerup={stopDrag}
				onpointercancel={stopDrag}
				onkeydown={handleLoopKeydown} />
			<InstrumentMacroLengthHandle
				bind:handleEl={lengthHandleEl}
				left={lengthHandleLeft}
				height={lengthHandleHeight}
				{sequenceLength}
				{label}
				isDragging={isDraggingLength}
				onpointerdown={handleLengthPointerDown}
				onpointermove={handlePointerMove}
				onpointerup={stopDrag}
				onpointercancel={stopDrag}
				onkeydown={handleLengthKeydown} />
		</div>
	</div>
	<InstrumentMacroHoverTooltip
		visible={hoverTooltip !== null}
		x={hoverTooltip?.x ?? 0}
		y={hoverTooltip?.y ?? 0}
		label={hoverTooltip?.label ?? ''}
		detail={hoverTooltip?.detail ?? ''}
		accentColor={hoverTooltip?.accentColor ?? accentColor} />
</section>
