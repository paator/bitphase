<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import Button from '../Button/Button.svelte';

	const props: {
		title: string;
		icon?: Component;
		class?: ClassValue;
		children?: Snippet;
		fullHeight?: boolean;
		actions?: {
			label: string;
			icon: Component;
			onClick: () => void;
			class?: ClassValue;
		}[];
		headerContent?: Snippet;
		headerClass?: ClassValue;
	} = $props();
</script>

<div class={props.fullHeight ? 'flex h-full flex-col' : 'w-full'}>
	<h2
		class="relative z-10 flex items-center justify-between rounded-t-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-2 py-1 font-bold {props.fullHeight
			? 'flex-shrink-0'
			: ''} {props.headerClass ?? ''}">
		<div class="flex items-center gap-2">
			{props.title}
			{#if props.icon}
				<props.icon />
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if props.actions}
				<div class="flex items-center gap-1">
					{#each props.actions as action (action.label)}
						<Button
							variant="header"
							onclick={action.onClick}
							title={action.label}
							class="flex items-center gap-1 {action.class || ''}">
							<action.icon class="h-3 w-3" />
							{#if action.label}
								<span class="font-medium">{action.label}</span>
							{/if}
						</Button>
					{/each}
				</div>
			{/if}
			{#if props.headerContent}
				{@render props.headerContent()}
			{/if}
		</div>
	</h2>
	<div class="{props.fullHeight ? 'flex-1 overflow-hidden' : ''} rounded-b-sm bg-[var(--color-app-surface)]">
		<div class="{props.fullHeight ? 'h-full' : ''} {props.class}">
			{@render props.children?.()}
		</div>
	</div>
</div>
