<script lang="ts">
	import type { Component } from 'svelte';
	import {
		clampInstrumentMacroLength,
		INSTRUMENT_MACRO_MAX_LENGTH,
		INSTRUMENT_MACRO_MIN_LENGTH,
		instrumentMacroAccentColor,
		INSTRUMENT_MACRO_NO_RELEASE,
		setInstrumentMacroValue,
		setSharedSequenceLength,
		setSharedSequenceLoop,
		setSharedSequenceRelease,
		type InstrumentMacro,
		type InstrumentMacroField,
		type InstrumentMacroValue,
		type InstrumentMacros
	} from '../../chips/base/instrument-macros';
	import {
		applyInstrumentMacroFlagText,
		applyInstrumentMacroSequenceText,
		instrumentMacroFlagField,
		instrumentMacroFlagFields,
		instrumentMacroFlagMasks,
		instrumentMacroSequenceTextFields,
		cycleInstrumentMacroEnum,
		formatInstrumentMacroValue,
		integerFromMacroBarNormalized,
		MACRO_BAR_INSET,
		MACRO_LENGTH_HANDLE_WIDTH,
		MACRO_LOOP_HANDLE_WIDTH,
		clampMacroBarViewMin,
		macroBarNeedsScroll,
		macroBarViewMinForValues,
		macroBarViewStep,
		macroFieldRowHeight,
		macroStepWidthPx,
		panMacroBarViewMin,
		scrollMacroHandleIntoView
	} from './instrument-macro-ui';
	import InstrumentMacroBarScaleScroll from './InstrumentMacroBarScaleScroll.svelte';
	import InstrumentMacroFieldRow from './InstrumentMacroFieldRow.svelte';
	import InstrumentMacroHoverTooltip from './InstrumentMacroHoverTooltip.svelte';
	import InstrumentMacroLengthHandle from './InstrumentMacroLengthHandle.svelte';
	import InstrumentMacroLoopHandle from './InstrumentMacroLoopHandle.svelte';
	import InstrumentMacroReleaseHandle from './InstrumentMacroReleaseHandle.svelte';
	import InstrumentMacroSequenceHeader from './InstrumentMacroSequenceHeader.svelte';
	import InstrumentMacroSequenceText from './InstrumentMacroSequenceText.svelte';

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
	const releaseIndex = $derived(
		Math.max(
			INSTRUMENT_MACRO_NO_RELEASE,
			Math.min(
				sequenceLength - 1,
				macros[fields[0]?.id ?? '']?.release ?? INSTRUMENT_MACRO_NO_RELEASE
			)
		)
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
	const textFields = $derived(instrumentMacroSequenceTextFields(fields));
	const flagFields = $derived(instrumentMacroFlagFields(fields));
	const flagField = $derived(instrumentMacroFlagField(flagFields));
	const flagMasks = $derived(instrumentMacroFlagMasks(macros, flagFields));
	const scaleFields = $derived(fields.filter(macroBarNeedsScroll));
	const sequenceWidth = $derived(stepWidthPx * sequenceLength);
	const loopHandleLeft = $derived(stepWidthPx * loopIndex - MACRO_LOOP_HANDLE_WIDTH / 2);
	const releaseHandleLeft = $derived(
		stepWidthPx * releaseIndex -
			MACRO_LOOP_HANDLE_WIDTH / 2 +
			(releaseIndex === loopIndex ? MACRO_LOOP_HANDLE_WIDTH / 2 : 0)
	);
	const lengthHandleLeft = $derived(sequenceWidth);
	const lengthHandleHeight = $derived(Math.max(16, stackHeight - 4));

	let scrollerEl = $state<HTMLDivElement | null>(null);
	let sequenceEl = $state<HTMLDivElement | null>(null);
	let loopHandleEl = $state<HTMLDivElement | null>(null);
	let releaseHandleEl = $state<HTMLDivElement | null>(null);
	let lengthHandleEl = $state<HTMLDivElement | null>(null);
	let isDraggingLoop = $state(false);
	let isDraggingRelease = $state(false);
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
	let viewMinOverride = $state<Record<string, number>>({});

	$effect(() => {
		const length = sequenceLength;
		void lengthHandleLeft;
		scrollMacroHandleIntoView(scrollerEl, lengthHandleEl, previousLength, length);
		previousLength = length;
	});

	function fieldMacro(field: InstrumentMacroField): InstrumentMacro {
		return (
			macros[field.id] ?? {
				values: [field.defaultValue],
				loop: loopIndex,
				release: releaseIndex >= 0 ? releaseIndex : undefined
			}
		);
	}

	function viewMinFor(field: InstrumentMacroField): number {
		const override = viewMinOverride[field.id];
		if (override !== undefined) return override;
		return macroBarViewMinForValues(field, fieldMacro(field).values);
	}

	function setViewMin(field: InstrumentMacroField, viewMin: number): void {
		viewMinOverride[field.id] = clampMacroBarViewMin(field, viewMin);
	}

	function panViewFromPointer(field: InstrumentMacroField, clientY: number): void {
		const row = sequenceEl?.querySelector(`[data-shared-row="${CSS.escape(field.id)}"]`);
		if (!(row instanceof HTMLElement)) return;
		const rect = row.getBoundingClientRect();
		const next = panMacroBarViewMin(field, viewMinFor(field), clientY, rect.top, rect.bottom);
		if (next !== viewMinFor(field)) setViewMin(field, next);
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
		if (paintFieldId !== null || isDraggingLoop || isDraggingRelease || isDraggingLength)
			return;
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
		const plotHeight = rect.height;
		if (plotHeight <= 0) return field.defaultValue;
		const innerHeight = Math.max(1, plotHeight - MACRO_BAR_INSET * 2);
		const normalized = Math.max(
			0,
			Math.min(1, 1 - (clientY - rect.top - MACRO_BAR_INSET) / innerHeight)
		);
		return integerFromMacroBarNormalized(field, normalized, viewMinFor(field));
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

	function setRelease(index: number): void {
		onChange(setSharedSequenceRelease(macros, fields, index));
	}

	function beginPaint(
		field: InstrumentMacroField,
		index: number,
		event: PointerEvent,
		fromY: boolean
	): void {
		if (event.button !== 0 || field.kind === 'waveform') return;
		event.preventDefault();
		const sequence = sequenceEl;
		if (!sequence) return;
		sequence.setPointerCapture(event.pointerId);
		paintFieldId = field.id;
		paintFromY = fromY;
		if (fromY) {
			paintValue = null;
			panViewFromPointer(field, event.clientY);
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
			panViewFromPointer(field, clientY);
			setValue(field, index, integerFromClientY(field, clientY));
			return;
		}
		const field = fieldFromClientY(clientY) ?? fields.find((item) => item.id === paintFieldId);
		if (!field || !canPaintField(field) || paintValue === null) return;
		setValue(field, index, paintValue);
	}

	function applyLoopFromClientX(clientX: number): void {
		const index = stepIndexFromClientX(clientX);
		if (index === null) return;
		setLoop(index);
	}

	function applyReleaseFromClientX(clientX: number): void {
		const index = stepIndexFromClientX(clientX);
		if (index === null) return;
		setRelease(index);
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
		if (isDraggingRelease) {
			hoverTooltip = {
				x: event.clientX,
				y: event.clientY,
				label: `${label} release`,
				detail: `Step ${releaseIndex}`,
				accentColor: 'var(--color-pattern-note-off)'
			};
			applyReleaseFromClientX(event.clientX);
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
		if (isDraggingRelease) {
			isDraggingRelease = false;
			releaseHandleEl?.releasePointerCapture(event.pointerId);
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

	function handleReleasePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = releaseHandleEl;
		if (!handle) return;
		isDraggingRelease = true;
		handle.setPointerCapture(event.pointerId);
		applyReleaseFromClientX(event.clientX);
	}

	function handleLoopPointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = loopHandleEl;
		if (!handle) return;
		isDraggingLoop = true;
		handle.setPointerCapture(event.pointerId);
		applyLoopFromClientX(event.clientX);
	}

	function handleLengthPointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const handle = lengthHandleEl;
		if (!handle) return;
		isDraggingLength = true;
		handle.setPointerCapture(event.pointerId);
		applyLengthFromClientX(event.clientX);
	}

	function handleContextMenu(event: MouseEvent): void {
		const index = stepIndexFromClientX(event.clientX);
		if (index === null) return;
		event.preventDefault();
		setRelease(index === releaseIndex ? INSTRUMENT_MACRO_NO_RELEASE : index);
	}

	function commitSequenceText(field: InstrumentMacroField, text: string): void {
		const next = applyInstrumentMacroSequenceText(macros, fields, field, text, asHex);
		if (next && next !== macros) onChange(next);
	}

	function commitFlagText(text: string): void {
		const next = applyInstrumentMacroFlagText(macros, fields, text);
		if (next && next !== macros) onChange(next);
	}

	function handleWheel(event: WheelEvent): void {
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		const field = fieldFromClientY(event.clientY);
		if (!field || !macroBarNeedsScroll(field)) return;
		event.preventDefault();
		const step = Math.max(macroBarViewStep(field), Math.round(Math.abs(event.deltaY) / 24));
		setViewMin(field, viewMinFor(field) - Math.sign(event.deltaY) * step);
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
		{releaseIndex}
		{sequenceLength}
		{canRemove}
		{canAdd}
		onRemoveStep={() => setLength(sequenceLength - 1)}
		onAddStep={() => setLength(sequenceLength + 1)} />

	<div class="flex min-w-0 items-stretch">
		<div bind:this={scrollerEl} class="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-2">
			<div
				bind:this={sequenceEl}
				class="relative w-fit"
				style="width: {Math.max(
					sequenceWidth,
					lengthHandleLeft + MACRO_LENGTH_HANDLE_WIDTH
				)}px"
				role="group"
				aria-label="{label} sequence"
				onpointermove={handlePointerMove}
				onpointerup={stopDrag}
				onpointercancel={stopDrag}
				oncontextmenu={handleContextMenu}
				onwheel={handleWheel}>
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
						viewMin={viewMinFor(field)}
						{isExpanded}
						onPaintStart={(index, event, fromY) =>
							beginPaint(field, index, event, fromY)}
						{onStepClick}
						{isStepEnabled} />
				{/each}
				{#if releaseIndex >= 0}
					<InstrumentMacroReleaseHandle
						bind:handleEl={releaseHandleEl}
						left={releaseHandleLeft}
						height={stackHeight}
						{releaseIndex}
						maxIndex={Math.max(0, sequenceLength - 1)}
						{label}
						isDragging={isDraggingRelease}
						onpointerdown={handleReleasePointerDown}
						onpointermove={handlePointerMove}
						onpointerup={stopDrag}
						onpointercancel={stopDrag} />
				{/if}
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
					onpointercancel={stopDrag} />
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
					onpointercancel={stopDrag} />
			</div>
		</div>
		{#if scaleFields.length > 0}
			<div
				class="relative w-10 min-w-10 shrink-0 self-stretch border-l border-[var(--color-app-border)]/40"
				style="height: {stackHeight}px">
				<div class="absolute inset-0 flex min-h-0 flex-col">
					{#each scaleFields as field (field.id)}
						<InstrumentMacroBarScaleScroll
							{field}
							viewMin={viewMinFor(field)}
							{asHex}
							onViewMinChange={(next) => setViewMin(field, next)} />
					{/each}
				</div>
			</div>
		{/if}
	</div>
	{#if textFields.length > 0 || flagFields.length > 1}
		<div class="flex flex-col gap-1 px-2 pt-1 pb-2">
			{#each textFields as field (field.id)}
				<InstrumentMacroSequenceText
					{field}
					values={fieldMacro(field).values}
					loop={fieldMacro(field).loop}
					release={fieldMacro(field).release ?? INSTRUMENT_MACRO_NO_RELEASE}
					{asHex}
					onCommit={(text) => commitSequenceText(field, text)} />
			{/each}
			{#if flagFields.length > 1}
				<InstrumentMacroSequenceText
					field={flagField}
					values={flagMasks}
					loop={loopIndex}
					release={releaseIndex}
					asHex={false}
					title="{flagField.title}. | marks the loop start. / marks the release point."
					placeholder="| 3"
					onCommit={commitFlagText} />
			{/if}
		</div>
	{/if}
	<InstrumentMacroHoverTooltip
		visible={hoverTooltip !== null}
		x={hoverTooltip?.x ?? 0}
		y={hoverTooltip?.y ?? 0}
		label={hoverTooltip?.label ?? ''}
		detail={hoverTooltip?.detail ?? ''}
		accentColor={hoverTooltip?.accentColor ?? accentColor} />
</section>
