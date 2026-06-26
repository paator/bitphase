<script lang="ts">
	let {
		editorContainerRef = $bindable(null),
		class: className = '',
		children
	}: {
		editorContainerRef?: HTMLDivElement | null;
		class?: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<div
	class="w-full max-w-full min-w-0 overflow-x-auto outline-none focus:outline-none {className}"
	bind:this={editorContainerRef}
	tabindex="-1">
	{@render children()}
</div>
