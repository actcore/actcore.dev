<script lang="ts">
	import { cn, type WithElementRef } from '../../../lib/utils';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		type = 'text',
		...restProps
	}: WithElementRef<HTMLInputAttributes> = $props();
</script>

<input
	bind:this={ref}
	bind:value
	{type}
	data-slot="input"
	class={cn(
		'border-border bg-background text-foreground placeholder:text-fainter-foreground focus-visible:border-accent-600 flex h-9 w-full min-w-0 rounded-lg border px-3 py-1.5 font-mono text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
/>
