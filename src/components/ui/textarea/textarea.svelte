<script lang="ts">
	import { cn, type WithElementRef } from '../../../lib/utils';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		...restProps
	}: WithElementRef<HTMLTextareaAttributes> = $props();
</script>

<textarea
	bind:this={ref}
	bind:value
	data-slot="textarea"
	class={cn(
		'border-border bg-background text-foreground placeholder:text-fainter-foreground focus-visible:border-accent-600 flex field-sizing-content min-h-16 w-full resize-y rounded-lg border px-3.5 py-3 font-mono text-sm leading-relaxed outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
></textarea>
