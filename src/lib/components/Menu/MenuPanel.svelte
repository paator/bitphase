<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import MenuPanelButton from './MenuPanelButton.svelte';
	import type { MenuItem } from './types';
	import { setContext } from 'svelte';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';

	let { isFirst, items, onAction, onMenuOpen, onMenuClose } = $props<{
		isFirst: boolean;
		items?: MenuItem[];
		onAction?: (action: { action: string }) => void;
		onMenuOpen?: (data: { label: string }) => void;
		onMenuClose?: (data: { label?: string; all?: boolean }) => void;
	}>();

	let activeSubmenu = $state('');

	setContext('menuPanel', {
		setActiveSubmenu: (label: string) => {
			activeSubmenu = activeSubmenu === label ? '' : label;
		},
		getActiveSubmenu: () => activeSubmenu
	});

	function handleAction(data: { action: string }) {
		onAction?.(data);
	}

	function handleMenuOpen(data: { label: string }) {
		onMenuOpen?.(data);
	}

	function handleMenuClose(data: { label?: string; all?: boolean }) {
		if (data.all) {
			activeSubmenu = '';
		}
		onMenuClose?.(data);
	}

	function handlePanelClick(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	in:fly={{ y: -10, duration: 150 }}
	out:fade={{ duration: 80 }}
	tabindex="-1"
	class="menu-panel {isFirst
		? ''
		: 'mx-[-8px]'} w-auto rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] shadow-lg"
	onclick={handlePanelClick}
	role="menu">
	{#if items && items.length > 0}
		{#each items as item, index (`${item.action ?? `${item.type ?? 'normal'}:${item.label}`}:${index}`)}
			<MenuPanelButton
				label={item.label}
				icon={item.icon || ''}
				type={item.type || 'normal'}
				action={item.action}
				items={item.items || []}
				shortcut={item.action
					? ShortcutString.toDisplay(keybindingsStore.getShortcut(item.action))
					: item.shortcut}
				disabled={item.disabled}
				onAction={handleAction}
				onMenuOpen={handleMenuOpen}
				onMenuClose={handleMenuClose} />
		{/each}
	{/if}
</div>

<style>
	.menu-panel {
		min-width: 200px;
	}
</style>
