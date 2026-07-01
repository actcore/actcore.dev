<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '../../../lib/utils';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export const badgeVariants = tv({
		base: "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-xs [&>svg]:size-2.5",
		variants: {
			variant: {
				fs: 'border-cap-fs/30 bg-cap-fs/12 text-foreground',
				http: 'border-success/28 bg-success/10 text-foreground',
				muted: 'border-border text-fainter-foreground bg-transparent',
				denied:
					'border-destructive/20 bg-destructive/6 text-faint-foreground line-through decoration-destructive/50',
			},
		},
		defaultVariants: {
			variant: 'muted',
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'muted',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & { variant?: BadgeVariant } = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
