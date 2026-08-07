<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { ModalPanel } from '../ModalPanel';
	import ContributorsModal from './ContributorsModal.svelte';
	import { open } from '../../services/modal/modal-service';

	let { resolve } = $props<{
		resolve?: (value?: unknown) => void;
	}>();

	const version = '0.1.0';
	const commitHash = import.meta.env.VITE_COMMIT_HASH || 'dev';
	const buildDate = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

	function handleClose() {
		resolve?.();
	}

	async function openContributors() {
		await open(ContributorsModal, {});
	}
</script>

<ModalPanel title="About" width="w-[400px]" maxHeightClass="" compact bodyClass="flex flex-col items-center gap-3 p-4">
	{#snippet children()}
		<img src="logo.svg" alt="Bitphase Logo" class="h-16 w-16" />

		<div class="text-center">
			<h1 class="text-lg font-bold text-[var(--color-app-text-primary)]">Bitphase</h1>
		</div>

		<div
			class="w-full space-y-2 rounded border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] p-3">
			<div class="flex justify-between">
				<span class="text-[var(--color-app-text-muted)]">Version:</span>
				<span class="font-mono text-[var(--color-app-text-primary)]">{version}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-[var(--color-app-text-muted)]">Commit:</span>
				<span class="font-mono text-[var(--color-app-text-primary)]">{commitHash}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-[var(--color-app-text-muted)]">Build Date:</span>
				<span class="font-mono text-[var(--color-app-text-primary)]">{buildDate}</span>
			</div>
		</div>

		<div class="flex flex-col items-center gap-2">
			<button
				type="button"
				class="cursor-pointer text-[var(--color-app-text-secondary)] hover:text-[var(--color-app-text-primary)] hover:underline"
				onclick={openContributors}>
				Credits
			</button>
			<a
				href="https://github.com/paator/bitphase"
				target="_blank"
				rel="noopener noreferrer"
				class="text-[var(--color-app-text-secondary)] hover:text-[var(--color-app-text-primary)] hover:underline">
				View on GitHub
			</a>
		</div>
		<Button variant="primary" onclick={handleClose}>Close</Button>
	{/snippet}
</ModalPanel>
