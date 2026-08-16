<script lang="ts">
	import MenuPanel from './MenuPanel.svelte';
	import type { MenuItem } from './types';
	import { getContext } from 'svelte';

	let {
		label,
		icon = '',
		type = 'normal',
		action,
		items,
		shortcut,
		disabled,
		onAction,
		onMenuOpen,
		onMenuClose
	}: {
		label: string;
		icon: string;
		type: 'normal' | 'expandable' | 'divider' | 'header';
		action?: string;
		items: MenuItem[];
		shortcut?: string;
		disabled?: boolean | (() => boolean);
		onAction: (data: { action: string }) => void;
		onMenuOpen: (data: { label: string }) => void;
		onMenuClose: (data: { label?: string; all?: boolean }) => void;
	} = $props();

	const isDisabled = $derived(typeof disabled === 'function' ? disabled() : disabled || false);

	const menuPanelContext = getContext<{
		setActiveSubmenu: (label: string) => void;
		getActiveSubmenu: () => string;
	}>('menuPanel');

	let localShowSubmenu = $state(false);

	const showSubmenuPanel = $derived(
		menuPanelContext && type === 'expandable'
			? menuPanelContext.getActiveSubmenu() === label
			: localShowSubmenu
	);

	const isActive = $derived(showSubmenuPanel && type === 'expandable');

	function handleClick(event: MouseEvent) {
		event.stopPropagation();

		if (type !== 'normal' || isDisabled) {
			return;
		}

		onAction?.({ action: action || label });
		onMenuClose?.({ all: true });
	}

	let menuHoverTimeout: ReturnType<typeof setTimeout>;

	function handleMouseEnter(event: MouseEvent) {
		event.stopPropagation();

		if (type !== 'expandable') {
			return;
		}

		menuHoverTimeout = setTimeout(() => {
			if (menuPanelContext) {
				menuPanelContext.setActiveSubmenu(label);
			} else {
				localShowSubmenu = !localShowSubmenu;
			}
		}, 300);
	}

	function handleMouseLeave(event: MouseEvent) {
		event.stopPropagation();

		if (type !== 'expandable') {
			return;
		}

		clearTimeout(menuHoverTimeout);
		if (menuPanelContext) {
			menuPanelContext.setActiveSubmenu(''); // This prevents the menu re-openning if is closed and mouse moves out.
		} else {
			localShowSubmenu = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();

			if (type === 'normal' && !isDisabled) {
				onAction?.({ action: action || label });
				onMenuClose?.({ all: true });
			} else if (type === 'expandable') {
				if (menuPanelContext) {
					menuPanelContext.setActiveSubmenu(label);
				} else {
					localShowSubmenu = !localShowSubmenu;
				}
			}
		} else if (event.key === 'Escape') {
			onMenuClose?.({ all: true });
		}
	}

	function handleAction(data: { action: string }) {
		onAction?.(data);
	}

	function handleMenuOpen(data: { label: string }) {
		onMenuOpen?.(data);
	}

	function handleMenuClose(data: { label?: string; all?: boolean }) {
		if (data.all) {
			if (!menuPanelContext) {
				localShowSubmenu = false;
			}
		}
		onMenuClose?.(data);
	}

	//TODO: this is not a correct .root() usage, cleanup this later
	$effect.root(() => {
		return () => {
			if (!menuPanelContext) {
				localShowSubmenu = false;
			}
		};
	});
</script>

{#if type === 'divider'}
	<div class="my-[0.2rem] h-px bg-[var(--color-app-border)]" role="separator"></div>
{:else if type === 'header'}
	<div
		class="px-1.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-app-text-muted)]"
		role="presentation">
		{label}
	</div>
{:else}
	<div
		class="menu-panel-button relative flex cursor-pointer items-center justify-between gap-3 px-1.5 py-[0.2rem] text-xs whitespace-nowrap hover:bg-[var(--color-app-surface-hover)]"
		class:cursor-not-allowed={isDisabled}
		class:opacity-50={isDisabled}
		class:hover:bg-transparent={isDisabled}
		onclick={handleClick}
		onkeydown={handleKeyDown}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		tabindex="0"
		role="menuitem"
		class:bg-[var(--color-app-surface-hover)]={isActive}>
		<div class="flex items-center gap-1.5">
			{#if icon}
				<span>{icon}</span>
			{/if}
			<span>{label}</span>
		</div>

		<div class="flex items-center gap-1.5">
			{#if shortcut}
				<span class="text-xs text-[var(--color-app-text-muted)]">{shortcut}</span>
			{/if}
			{#if type === 'expandable'}
				<span class="text-xs">▶</span>
			{/if}
		</div>

		{#if showSubmenuPanel && type === 'expandable' && items && items.length > 0}
			<div class="absolute top-0 left-full ml-0.5">
				<MenuPanel
					isFirst={false}
					{items}
					onAction={handleAction}
					onMenuOpen={handleMenuOpen}
					onMenuClose={handleMenuClose} />
			</div>
		{/if}
	</div>
{/if}
