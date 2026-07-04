<script lang="ts">
	/**
	 * Reference consent prompter for @actcore/web-runtime's `ask` policy mode.
	 *
	 * Rendered by PythonPlayground when the sandboxed python-env component makes
	 * a `wasi:http` call the operator policy has marked `ask` (the default). The
	 * engine (JSPI-suspended guest call) awaits exactly one verdict at a time —
	 * see act-engine.ts's `requestConsent` plumbing — so this only ever shows one
	 * `ask` at once.
	 *
	 * Uses a native <dialog> in the browser TOP LAYER so it always renders above
	 * every page section, immune to ancestor stacking / containing-block issues
	 * (a `fixed inset-0` overlay is trapped when any ancestor has a transform,
	 * filter, or backdrop-filter — which the demo page does).
	 */
	import { Button } from '../ui/button';
	import { Badge } from '../ui/badge';
	import type { ConsentAsk, Verdict } from '@actcore/web-runtime';

	let { ask, ondecision }: { ask: ConsentAsk | null; ondecision: (v: Verdict) => void } =
		$props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	function parseHostPort(key: string): { host: string; port: string } {
		const idx = key.lastIndexOf(':');
		if (idx === -1) return { host: key, port: '' };
		return { host: key.slice(0, idx), port: key.slice(idx + 1) };
	}

	const host = $derived(ask ? parseHostPort(ask.op.key).host : '');
	const port = $derived(ask ? parseHostPort(ask.op.key).port : '');
	const scheme = $derived.by(() => {
		const attrs = ask?.op.attrs;
		if (attrs && typeof attrs === 'object' && 'scheme' in attrs) {
			const s = (attrs as { scheme?: unknown }).scheme;
			if (typeof s === 'string' && s) return s;
		}
		return 'https';
	});
	const method = $derived(ask?.op.action ?? 'GET');
	const isDestructive = $derived(ask?.risk === 'destructive');
	const description = $derived(
		ask?.description ?? `${ask?.componentRef ?? 'this component'} is asking to reach this host.`,
	);

	function deny() {
		ondecision({ allow: false, remember: 'once' });
	}
	function allowOnce() {
		ondecision({ allow: true, remember: 'once' });
	}
	function allowSession() {
		ondecision({ allow: true, remember: 'session' });
	}

	// Open/close the top-layer dialog in lockstep with `ask`, and land focus on
	// the primary action for keyboard / screen-reader users.
	$effect(() => {
		const d = dialogEl;
		if (!d) return;
		if (ask) {
			if (!d.open) d.showModal();
			d.querySelector<HTMLButtonElement>('[data-consent-default]')?.focus();
		} else if (d.open) {
			d.close();
		}
	});

	// Native Escape fires `cancel` on a modal <dialog>; treat it as Deny.
	function onCancel(e: Event) {
		e.preventDefault();
		deny();
	}
	// A click whose target is the dialog element itself is a backdrop click.
	function onBackdropClick(e: MouseEvent) {
		if (e.target === dialogEl) deny();
	}
</script>

<dialog
	bind:this={dialogEl}
	oncancel={onCancel}
	onclick={onBackdropClick}
	aria-labelledby="consent-title"
	aria-describedby="consent-desc"
	class="act-anim m-auto w-full max-w-md overflow-hidden rounded-[14px] border border-warning/30 bg-gradient-to-b from-card to-elevated p-0 text-foreground shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop:bg-black/70 backdrop:backdrop-blur-sm"
	style="animation: act-seal .35s cubic-bezier(.2,.8,.2,1);"
>
	{#if ask}
		<!-- header -->
		<div
			class="flex items-center gap-2.5 border-b border-border bg-warning/5 px-4 py-2.5 font-mono text-[0.72rem] tracking-[0.12em] text-warning uppercase"
		>
			<span
				class="h-[9px] w-[9px] shrink-0 rounded-full bg-warning shadow-[0_0_8px_rgba(251,191,36,0.5)]"
				style="animation: act-pulse 1.6s ease-in-out infinite;"
			></span>
			consent required · {ask.capId}
		</div>

		<!-- title -->
		<div class="px-5 pt-4">
			<h2 id="consent-title" class="font-display text-lg font-semibold text-foreground">
				<span class="text-accent">{ask.componentRef}</span> wants to connect
			</h2>
		</div>

		<!-- target host -->
		<div class="px-5 pt-3.5">
			<div class="flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="shrink-0 text-accent"
					><circle cx="12" cy="12" r="9" /><path
						d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"
					/></svg
				>
				<div class="min-w-0 flex-1">
					<div class="truncate font-mono text-[0.98rem] font-semibold text-foreground">{host}</div>
					<div class="font-mono text-[0.7rem] text-faint-foreground">
						over {scheme.toUpperCase()}{port ? ` · port ${port}` : ''}
					</div>
				</div>
				<Badge variant="http" class="shrink-0 uppercase">{method}</Badge>
			</div>
		</div>

		<!-- stated reason -->
		<div class="px-5 pt-3">
			<p id="consent-desc" class="font-mono text-[0.78rem] leading-relaxed text-muted-foreground">
				{description}
			</p>
			{#if isDestructive}
				<p class="mt-1.5 font-mono text-[0.72rem] text-destructive">
					⚠ declared as a destructive operation
				</p>
			{/if}
		</div>

		<!-- honest note about the mechanism -->
		<div class="px-5 pt-3">
			<p class="font-mono text-[0.68rem] leading-relaxed text-fainter-foreground">
				This is ACT's capability policy running in your browser — {ask.componentRef} declared this
				host in its signed manifest; nothing else can be reached.
			</p>
		</div>

		<!-- actions -->
		<div class="flex flex-col gap-2 px-5 pt-4 pb-5">
			<div class="flex gap-2">
				<Button variant="secondary" onclick={deny} class="flex-1 font-mono text-[0.82rem]"
					>Deny</Button
				>
				<Button data-consent-default onclick={allowOnce} class="flex-1 font-mono text-[0.82rem]"
					>Allow once</Button
				>
			</div>
			<Button
				variant="ghost"
				onclick={allowSession}
				class="h-auto w-full flex-wrap py-2 font-mono text-[0.78rem] leading-snug whitespace-normal"
			>
				Allow for this session
				<span class="min-w-0 truncate text-fainter-foreground">— won't ask again for {host}</span>
			</Button>
		</div>
	{/if}
</dialog>
