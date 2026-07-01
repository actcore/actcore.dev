<script lang="ts" module>
	import { cn, type WithElementRef } from '../../../lib/utils';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg text-sm font-semibold focus-visible:ring-3 [&_svg:not([class*='size-'])]:size-4 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-accent hover:-translate-y-px hover:shadow-[0_6px_24px_rgba(245,158,11,0.3)]',
				secondary:
					'bg-transparent text-foreground border border-border-medium hover:border-accent-600 hover:text-accent',
				ghost:
					'bg-transparent text-faint-foreground border border-dashed border-border-medium hover:border-accent-600 hover:text-accent',
				link: 'bg-transparent text-fainter-foreground underline underline-offset-4 p-0 h-auto',
			},
			size: {
				default: 'h-10 px-4',
				sm: 'h-8 px-3 text-xs',
				pill: 'h-9 px-4 rounded-full',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{href}
		aria-disabled={disabled}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
