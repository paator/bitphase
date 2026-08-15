<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { ModalPanel } from '../ModalPanel';

	let { resolve } = $props<{
		resolve?: (value?: any) => void;
	}>();

	function handleClose() {
		resolve?.();
	}

	const COLOR = {
		code: 'var(--color-pattern-effect)',
		delay: 'var(--color-pattern-envelope)',
		parameter: 'var(--color-pattern-note)',
		literal: 'var(--color-app-text-muted)',
		table: 'var(--color-pattern-table)'
	} as const;

	type Segment = { char: string; color: string };

	function getFormatSegments(value: string): Segment[] {
		if (value.length === 4 && value[2] === 'T') {
			return [
				{ char: value[0], color: COLOR.code },
				{ char: value[1], color: COLOR.delay },
				{ char: value[2], color: COLOR.literal },
				{ char: value[3], color: COLOR.parameter }
			];
		}
		if (value.length === 4) {
			return [
				{ char: value[0], color: COLOR.code },
				{ char: value[1], color: COLOR.delay },
				{ char: value[2], color: COLOR.parameter },
				{ char: value[3], color: COLOR.parameter }
			];
		}
		return [{ char: value, color: 'var(--color-app-text-secondary)' }];
	}

	const effects = [
		{
			code: 'A',
			name: 'Arpeggio',
			description: 'Rapidly alternates between the current note and two additional notes.',
			format: 'AXYZ',
			formatWithTable: 'AXTY',
			delayLabel: 'Steps length',
			delay: 'X - ticks between arpeggio steps (0-F)',
			parameter: 'Y / Z - semitone offsets (0-F). A000 (or Ax00) stops arpeggio',
			tableDescription: 'Y is table id (0-9, A-Z); offsets come from the table',
			example: 'A137 - steps length 1, offsets +3 and +7 (minor chord)'
		},
		{
			code: 'V',
			name: 'Vibrato',
			description: 'Modulates pitch up and down.',
			format: 'VXYZ',
			formatWithTable: 'VXTY',
			delay: 'X - delay between vibrato steps (0-F)',
			parameter: 'Y speed, Z depth (0-F)',
			tableDescription: 'speed/depth from table each tick',
			example: 'V158 - delay 1, speed 5, depth 8'
		},
		{
			code: '1',
			name: 'Slide Down',
			description: 'Gradually decreases pitch.',
			format: '1XYZ',
			formatWithTable: '1XTY',
			delay: 'X - delay between slide steps (0-F)',
			parameter: 'YZ - step size (00-FF)',
			tableDescription: 'step size from table each tick',
			example: '1130 - delay 1, step 30. Use . for delay 0 for a one-tick slide'
		},
		{
			code: '2',
			name: 'Slide Up',
			description: 'Gradually increases pitch. Same shape as slide down (2XYZ / 2XTY).',
			format: '2XYZ',
			formatWithTable: '2XTY',
			delay: 'X - delay between slide steps (0-F)',
			parameter: 'YZ - step size (00-FF)',
			tableDescription: 'step size from table each tick',
			example: '2150 - delay 1, step 50'
		},
		{
			code: 'P',
			name: 'Portamento',
			description: 'Smoothly slides from the previous note to the current note (PXYZ / PXTY).',
			format: 'PXYZ',
			formatWithTable: 'PXTY',
			delay: 'X - delay between portamento steps (0-F)',
			parameter: 'YZ - portamento speed (00-FF)',
			tableDescription: 'speed from table each tick',
			example: 'P30F - delay 3, speed 0F'
		},
		{
			code: '4',
			name: 'Sample Position',
			description: 'Sets the starting row within the instrument (4.XY).',
			format: '4.XY',
			parameter: 'XY - instrument row index to start from (00-FF)',
			example: '4.05 - start instrument from row 5'
		},
		{
			code: '5',
			name: 'Ornament Position',
			description: 'Sets the starting position within the table / ornament (5.XY).',
			format: '5.XY',
			parameter: 'XY - table row index to start from (00-FF)',
			example: '5.03 - start table from row 3'
		},
		{
			code: '6',
			name: 'On/Off',
			description: 'Alternates between playing and muting (6.XY / 6.TY).',
			format: '6.XY',
			formatWithTable: '6.TY',
			parameter: 'Y on duration, Z off duration (0-F)',
			tableDescription: 'on/off durations from table each tick',
			example: '6.24 - on duration 2, off duration 4'
		},
		{
			code: 'D',
			name: 'Detune',
			description:
				"Offsets channel pitch by a signed amount (D.XY / D.TY). Doesn't reset on new notes. Use D.80 to bring back original tuning.",
			format: 'D.XY',
			formatWithTable: 'D.TY',
			parameter: 'XY - signed (00-FF, 80 = 0). 00-7F negative, 81-FF positive',
			tableDescription: 'detune value from table each tick',
			example: 'D.85 - detune +5'
		},
		{
			code: 'S',
			name: 'Speed',
			description: 'Changes song playback speed (S.XY / S.TY).',
			format: 'S.XY',
			formatWithTable: 'S.TY',
			parameter: 'XY - new speed value (01-FF)',
			tableDescription: 'speed from table each pattern row',
			example: 'S.03 - set speed to 3'
		}
	];
</script>

{#snippet effectSection(title: string, first = false)}
	<h2
		class="{first
			? 'mb-3'
			: 'mb-3 mt-8'} border-b border-[var(--color-app-border)] pb-2 text-lg font-bold text-[var(--color-app-text-primary)]">
		{title}
	</h2>
{/snippet}

{#snippet effectCard(effect: (typeof effects)[number])}
	<div
		class="rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
		<div class="mb-2 flex items-center gap-2">
			<code
				class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
				{effect.code}
			</code>
			<h3 class="font-bold text-[var(--color-app-text-primary)]">
				{effect.name}
			</h3>
		</div>
		<p class="mb-3 text-[var(--color-app-text-secondary)]">
			{effect.description}
		</p>

		<div class="mb-2 space-y-1">
			<div>
				<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
				<code class="ml-2 font-mono"
					>{#each getFormatSegments(effect.format) as seg}
						<span style="color: {seg.color}">{seg.char}</span>{/each}</code>
			</div>

			{#if effect.delay}
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]"
						>{effect.delayLabel ?? 'Delay'}:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]">{effect.delay}</span>
				</div>
			{/if}
			<div>
				<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
				<span class="ml-2 text-[var(--color-app-text-secondary)]">{effect.parameter}</span>
			</div>
			{#if effect.formatWithTable}
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">With table:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>{#each getFormatSegments(effect.formatWithTable) as seg}
							<span style="color: {seg.color}">{seg.char}</span>{/each}</code>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>- {effect.tableDescription}</span>
				</div>
			{/if}
			<div>
				<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
				<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">{effect.example}</code>
			</div>
		</div>
	</div>
{/snippet}

<ModalPanel
	title="Effects Reference"
	width="w-[700px] max-w-[90vw]"
	height="h-[90vh]"
	bodyClass="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
	{#snippet children()}
		<div class="mb-4 text-[var(--color-app-text-secondary)]">
			<p class="mb-2">
				Effects are written in the effect column using the format
				<code class="rounded bg-[var(--color-app-surface-secondary)] px-1 py-0.5 font-mono">
					{#each getFormatSegments('AXYZ') as seg}
						<span style="color: {seg.color}">{seg.char}</span>
					{/each}
				</code>, where
				<code class="rounded bg-[var(--color-app-surface-secondary)] px-1 py-0.5 font-mono">A</code>
				indicates the effect type and
				<code class="rounded bg-[var(--color-app-surface-secondary)] px-1 py-0.5 font-mono"
					>XYZ</code> are its parameters.
			</p>
			<p class="mb-2">
				They can also use tables as a source of parameter values:
				<code class="rounded bg-[var(--color-app-surface-secondary)] px-1 py-0.5 font-mono">
					{#each getFormatSegments('AXTY') as seg}
						<span style="color: {seg.color}">{seg.char}</span>
					{/each}
				</code>
				(<code class="font-mono">T</code> + table id). For example, rather than manually alternating
				<code class="font-mono">S.03</code>,
				<code class="font-mono">S.05</code>,
				<code class="font-mono">S.03</code> to create a groove tempo, you can put the tempo values in
				table 1 and simply use
				<code class="font-mono">S.T1</code>.
			</p>
			<p>
				Effect parameters are hexadecimal (0-9, A-F). Table ids in
				<code class="font-mono">T</code> syntax use 0-9 and A-Z (for example
				<code class="font-mono">S.TZ</code>). Use
				<code class="rounded bg-[var(--color-app-surface-secondary)] px-1 py-0.5 font-mono">.</code>
				for 0.
			</p>
		</div>

		{@render effectSection('General', true)}

		<div class="space-y-4">
			{#each effects as effect}
				{@render effectCard(effect)}
			{/each}
		</div>

		{@render effectSection('AY-3-8910 / YM2149F')}

		<div class="mb-4 text-[var(--color-app-text-secondary)]">
			<p>
				Envelope effects use the same codes but are entered in the
				<span class="font-medium text-[var(--color-app-text-primary)]">envelope effect</span> column.
				On top of that, there are special effects only targeted towards envelopes:
			</p>
		</div>

		<div
			class="rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					EA
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Auto-Envelope</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Automatically calculates the envelope period from channel notes using a ratio. When active,
				set the envelope shape in the channel column - the envelope value is computed from the
				playing note. Enter in the envelope effect column only.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">A</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>X numerator (1-F), Y denominator (1-F) → ratio X:Y</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>EA32 - ratio 3:2</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Shapes:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>Works with repeating shapes 8, A, C, E. Divisor 16 for 8/C, 32 for A/E</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Note:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>Persists across rows until another envelope effect replaces it or a new envelope
						shape is written. Follows note changes in real time.</span>
				</div>
			</div>
		</div>

		<div
			class="mt-4 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					E1
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Timer PWM Min %</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Sets PWM sweep minimum duty for SID, syncbuzzer, or FM timer effects with exactly two
				waveform steps (for example 15 0). Hex 00-FF maps to 0-100%. While sweep is 0, min is
				unused; max sets the static pulse width. Resets on a new note or note off.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">1</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>XY - duty percent mapped from 00-FF → 0-100</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>E180 - about 50% min</code>
				</div>
			</div>
		</div>

		<div
			class="mt-4 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					E2
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Timer PWM Max %</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Sets PWM maximum duty (static pulse width when sweep is 0). Same eligibility and mapping as
				E1.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">2</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>XY - duty percent mapped from 00-FF → 0-100</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>E29E - about 62% max</code>
				</div>
			</div>
		</div>

		<div
			class="mt-4 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					E3
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Timer PWM Sweep</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Sets PWM sweep speed between min and max. Same eligibility and mapping as E1. E300 disables
				sweep so max acts as static pulse width.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">3</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>XY - sweep speed mapped from 00-FF → 0-100</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>E310 - slow sweep</code>
				</div>
			</div>
		</div>

		<div
			class="mt-4 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					E4
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Timer PWM Sweep Shape</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Selects the PWM sweep automation curve (triangle, sine, saw up, saw down, square). Same
				eligibility as E1.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">4</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>XY - 00 triangle, 01 sine, 02 saw up, 03 saw down, 04 square (wraps)</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>E401 - sine</code>
				</div>
			</div>
		</div>

		<div
			class="mt-4 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
			<div class="mb-2 flex items-center gap-2">
				<code
					class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
					E5
				</code>
				<h3 class="font-bold text-[var(--color-app-text-primary)]">Timer PWM Sweep Start</h3>
			</div>
			<p class="mb-3 text-[var(--color-app-text-secondary)]">
				Sets the start position on the PWM sweep automation curve (0-1000, shown as 0%-100% in the
				editor). Hex 00-FF maps onto that range. Also jumps the live sweep to that position. Same
				eligibility as E1.
			</p>
			<div class="mb-2 space-y-1">
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
					<code class="ml-2 font-mono">
						<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}">5</span
						><span style="color: {COLOR.parameter}">X</span><span style="color: {COLOR.parameter}"
							>Y</span>
					</code>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
					<span class="ml-2 text-[var(--color-app-text-secondary)]"
						>XY - start phase mapped from 00-FF → 0-1000</span>
				</div>
				<div>
					<span class="font-medium text-[var(--color-app-text-primary)]">Example:</span>
					<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]"
						>E580 - about halfway (50%)</code>
				</div>
			</div>
		</div>

		{@render effectSection('2A03 / 2A07 (NES)')}

		<div class="space-y-4">
			<div
				class="rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
				<div class="mb-2 flex items-center gap-2">
					<code
						class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
						E1
					</code>
					<h3 class="font-bold text-[var(--color-app-text-primary)]">Pulse Width</h3>
				</div>
				<p class="mb-3 text-[var(--color-app-text-secondary)]">
					Sets or automates square pulse width on Pulse 1 and Pulse 2. Persists until note off or a
					new E1. Use E100 to restore the instrument duty cycle.
				</p>
				<div class="mb-2 space-y-1">
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>1</span
							><span style="color: {COLOR.parameter}">X</span><span
								style="color: {COLOR.parameter}">Y</span>
						</code>
						<span class="ml-2 text-[var(--color-app-text-secondary)]">or</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>1</span
							><span style="color: {COLOR.table}">T</span><span style="color: {COLOR.table}"
								>X</span>
						</code>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
						<span class="ml-2 text-[var(--color-app-text-secondary)]"
							>00 restores instrument duty; 01-04 select duty cycles 1-4 (12.5%, 25%, 50%,
							75%)</span>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Table:</span>
						<span class="ml-2 text-[var(--color-app-text-secondary)]"
							>TX - values from table X each tick (0 = instrument duty)</span>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Examples:</span>
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E100</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E102</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E1T1</code>
					</div>
				</div>
			</div>

			<div
				class="rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
				<div class="mb-2 flex items-center gap-2">
					<code
						class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
						E2
					</code>
					<h3 class="font-bold text-[var(--color-app-text-primary)]">Sweep Up</h3>
				</div>
				<p class="mb-3 text-[var(--color-app-text-secondary)]">
					Hardware pitch sweep up on Pulse 1 / Pulse 2 (E2XY / E2TX).
				</p>
				<div class="mb-2 space-y-1">
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>2</span
							><span style="color: {COLOR.parameter}">X</span><span
								style="color: {COLOR.parameter}">Y</span>
						</code>
						<span class="ml-2 text-[var(--color-app-text-secondary)]">or</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>2</span
							><span style="color: {COLOR.table}">T</span><span style="color: {COLOR.table}"
								>X</span>
						</code>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Parameter:</span>
						<span class="ml-2 text-[var(--color-app-text-secondary)]"
							>X = sweep time (0-7), Y = shift (0-7). Y = 0 disables.</span>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Examples:</span>
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E247</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E2T1</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E200</code>
					</div>
				</div>
			</div>

			<div
				class="rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-4">
				<div class="mb-2 flex items-center gap-2">
					<code
						class="rounded bg-[var(--color-app-surface)] px-2 py-1 font-mono font-bold text-[var(--color-app-text-primary)]">
						E3
					</code>
					<h3 class="font-bold text-[var(--color-app-text-primary)]">Sweep Down</h3>
				</div>
				<p class="mb-3 text-[var(--color-app-text-secondary)]">
					Same format as E2, sweeping down (E3XY / E3TX).
				</p>
				<div class="mb-2 space-y-1">
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Format:</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>3</span
							><span style="color: {COLOR.parameter}">X</span><span
								style="color: {COLOR.parameter}">Y</span>
						</code>
						<span class="ml-2 text-[var(--color-app-text-secondary)]">or</span>
						<code class="ml-2 font-mono">
							<span style="color: {COLOR.code}">E</span><span style="color: {COLOR.delay}"
								>3</span
							><span style="color: {COLOR.table}">T</span><span style="color: {COLOR.table}"
								>X</span>
						</code>
					</div>
					<div>
						<span class="font-medium text-[var(--color-app-text-primary)]">Examples:</span>
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E317</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E3T1</code>,
						<code class="ml-2 font-mono text-[var(--color-app-text-secondary)]">E300</code>
					</div>
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<Button variant="primary" onclick={handleClose}>Close</Button>
	{/snippet}
</ModalPanel>
