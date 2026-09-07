<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import MenuPanelButton from './MenuPanelButton.svelte';
	import type { MenuItem, MenuPanelContext } from './types';
	import { setContext, onDestroy } from 'svelte';
	import { keybindingsStore } from '../../stores/keybindings.svelte';
	import { ShortcutString } from '../../utils/shortcut-string';
	import { SubmenuAim, type SubmenuBounds } from './submenu-aim';

	let { isFirst, items, onAction, onMenuOpen, onMenuClose } = $props<{
		isFirst: boolean;
		items?: MenuItem[];
		onAction?: (action: { action: string }) => void;
		onMenuOpen?: (data: { label: string }) => void;
		onMenuClose?: (data: { label?: string; all?: boolean }) => void;
	}>();

	let activeSubmenu = $state('');
	let panelEl = $state<HTMLDivElement | undefined>(undefined);
	const submenuAim = new SubmenuAim();

	function getOpenSubmenuBounds(): SubmenuBounds | null {
		const host = panelEl?.querySelector<HTMLElement>(
			':scope > .menu-panel-button [data-submenu-host]'
		);
		if (!host) {
			return null;
		}
		const rect = host.getBoundingClientRect();
		return { left: rect.left, top: rect.top, bottom: rect.bottom };
	}

	function setActiveSubmenu(label: string) {
		submenuAim.cancel();
		activeSubmenu = label;
	}

	function enterItem(label: string, expandable: boolean) {
		if (expandable) {
			if (activeSubmenu === label) {
				submenuAim.cancel();
				return;
			}
			submenuAim.schedule(() => {
				activeSubmenu = label;
			}, getOpenSubmenuBounds);
			return;
		}

		if (!activeSubmenu) {
			return;
		}

		submenuAim.schedule(() => {
			activeSubmenu = '';
		}, getOpenSubmenuBounds);
	}

	const menuPanelContext: MenuPanelContext = {
		getActiveSubmenu: () => activeSubmenu,
		enterItem,
		setActiveSubmenu
	};

	setContext('menuPanel', menuPanelContext);

	function handlePointerMove(event: MouseEvent) {
		submenuAim.recordPointer({ x: event.clientX, y: event.clientY });
	}

	function handlePanelMouseLeave(event: MouseEvent) {
		const next = event.relatedTarget;
		if (next instanceof Node && panelEl?.contains(next)) {
			return;
		}
		submenuAim.schedule(() => {
			activeSubmenu = '';
		}, getOpenSubmenuBounds);
	}

	function handleAction(data: { action: string }) {
		onAction?.(data);
	}

	function handleMenuOpen(data: { label: string }) {
		onMenuOpen?.(data);
	}

	function handleMenuClose(data: { label?: string; all?: boolean }) {
		if (data.all) {
			submenuAim.clear();
			activeSubmenu = '';
		}
		onMenuClose?.(data);
	}

	function handlePanelClick(event: MouseEvent) {
		event.stopPropagation();
	}

	onDestroy(() => submenuAim.clear());
</script>

<svelte:window onmousemove={handlePointerMove} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={panelEl}
	in:fly={{ y: -10, duration: 150 }}
	out:fade={{ duration: 80 }}
	tabindex="-1"
	class="menu-panel {isFirst
		? ''
		: 'mx-[-8px]'} w-auto rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface-secondary)] shadow-lg"
	onclick={handlePanelClick}
	onmousemove={handlePointerMove}
	onmouseleave={handlePanelMouseLeave}
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
