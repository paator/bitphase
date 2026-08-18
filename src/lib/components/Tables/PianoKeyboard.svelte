<script lang="ts">
	import {
		blackKeyAfterWhite,
		isMidiInScale,
		isWhiteKey,
		midiToLabel
	} from '../../utils/piano-helper';

	let {
		startMidi,
		endMidi,
		selectedMidis,
		restrictToScale,
		intervals,
		rootPitchClass,
		ontoggle
	}: {
		startMidi: number;
		endMidi: number;
		selectedMidis: number[];
		restrictToScale: boolean;
		intervals: readonly number[];
		rootPitchClass: number;
		ontoggle: (midi: number) => void;
	} = $props();

	const selectedSet = $derived(new Set(selectedMidis));

	const whiteKeys = $derived.by(() => {
		const keys: number[] = [];
		for (let midi = startMidi; midi <= endMidi; midi++) {
			if (isWhiteKey(midi)) keys.push(midi);
		}
		return keys;
	});

	const blackKeys = $derived.by(() => {
		const keys: { midi: number; afterIndex: number }[] = [];
		for (let index = 0; index < whiteKeys.length; index++) {
			const blackMidi = blackKeyAfterWhite(whiteKeys[index], endMidi);
			if (blackMidi !== null) keys.push({ midi: blackMidi, afterIndex: index });
		}
		return keys;
	});

	const whiteCount = $derived(whiteKeys.length);
	const blackWidthPercent = $derived(whiteCount > 0 ? (100 / whiteCount) * 0.58 : 0);

	function blackKeyLeft(afterIndex: number): number {
		const seamPercent = ((afterIndex + 1) / whiteCount) * 100;
		return seamPercent - blackWidthPercent / 2;
	}

	function keyTitle(midi: number): string {
		const scaleHint = isMidiInScale(midi, intervals, rootPitchClass)
			? 'in scale'
			: 'out of scale';
		return `${midiToLabel(midi)} (${scaleHint})`;
	}

	function keyClass(
		kind: 'white' | 'black',
		selected: boolean,
		inScale: boolean,
		blocked: boolean
	) {
		const dimmed = restrictToScale && !inScale && !selected;
		return [
			'flex justify-center whitespace-nowrap leading-none transition-colors disabled:opacity-100',
			blocked ? 'cursor-not-allowed' : 'cursor-pointer',
			kind === 'white'
				? 'h-[4.5rem] w-full items-end overflow-hidden border-r border-[#d8d3c8] pb-1 text-[0.6rem] last:border-r-0'
				: 'pointer-events-auto absolute top-0 z-[2] h-[2.85rem] items-end rounded-b-sm px-px pb-1 text-[0.5rem] shadow-md',
			selected
				? 'bg-[var(--color-app-primary)] text-[var(--color-app-on-primary)] hover:bg-[var(--color-app-primary-hover)]'
				: kind === 'white'
					? dimmed
						? 'bg-[#c9c5bc] text-[#8f8b82]'
						: 'bg-[#f4f1ea] text-[#3f3c38] hover:bg-[#ebe6db]'
					: dimmed
						? 'bg-[#8a8890] text-[#d8d3c8] shadow-none'
						: 'bg-[#3a3940] text-[#f4f1ea] hover:bg-[#4b4a52]'
		];
	}

	function handleToggle(midi: number, blocked: boolean): void {
		if (blocked) return;
		ontoggle(midi);
	}
</script>

<div class="relative mx-auto w-full select-none" style:max-width="calc({whiteCount} * 1.6rem)">
	<div
		class="grid overflow-hidden rounded-sm"
		style:grid-template-columns="repeat({whiteCount}, minmax(0, 1fr))">
		{#each whiteKeys as midi (midi)}
			{@const selected = selectedSet.has(midi)}
			{@const inScale = isMidiInScale(midi, intervals, rootPitchClass)}
			{@const blocked = restrictToScale && !inScale && !selected}
			<button
				type="button"
				class={keyClass('white', selected, inScale, blocked)}
				title={keyTitle(midi)}
				aria-label={keyTitle(midi)}
				aria-pressed={selected}
				disabled={blocked}
				onclick={() => handleToggle(midi, blocked)}>
				{midiToLabel(midi)}
			</button>
		{/each}
	</div>
	<div class="pointer-events-none absolute inset-0">
		{#each blackKeys as black (black.midi)}
			{@const selected = selectedSet.has(black.midi)}
			{@const inScale = isMidiInScale(black.midi, intervals, rootPitchClass)}
			{@const blocked = restrictToScale && !inScale && !selected}
			<button
				type="button"
				class={keyClass('black', selected, inScale, blocked)}
				style:left="{blackKeyLeft(black.afterIndex)}%"
				style:width="{blackWidthPercent}%"
				title={keyTitle(black.midi)}
				aria-label={keyTitle(black.midi)}
				aria-pressed={selected}
				disabled={blocked}
				onclick={() => handleToggle(black.midi, blocked)}>
				{midiToLabel(black.midi)}
			</button>
		{/each}
	</div>
</div>
