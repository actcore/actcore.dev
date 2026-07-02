<script lang="ts">
	import { Button } from '../ui/button';
	import { Badge } from '../ui/badge';
	import { Textarea } from '../ui/textarea';
	import { Input } from '../ui/input';
	import { Progress } from '../ui/progress';
	import {
		loadComponent,
		runExec,
		injectCsv,
		loadModel as engineLoadModel,
		askModel,
		SAMPLE_CSV,
		EXAMPLES,
		type ComponentHandle,
	} from '../../lib/act-engine';

	type Phase = 'idle' | 'running' | 'done';
	type ModelPhase = 'hidden' | 'running' | 'done';
	type Exchange = { q: string; code: string; result: string; error: boolean };

	// ── component / exec state ────────────────────────────────────────────────
	let phase = $state<Phase>('idle');
	let progress = $state(0); // 0..1 download
	let progressLabel = $state('');
	let compiling = $state(false); // worker transpile after download
	let selectedExample = $state(EXAMPLES[0].id);
	let code = $state(EXAMPLES[0].code);
	let result = $state('');
	let resultImage = $state<{ mime: string; dataUrl: string } | undefined>(undefined);
	let ms = $state(0);
	let resultError = $state(false);
	let error = $state('');
	let handle: ComponentHandle | null = null;
	let rerunning = $state(false);

	// ── CSV state ─────────────────────────────────────────────────────────────
	let csvName = $state('sample.csv');
	let csvText = SAMPLE_CSV;
	let fileInput = $state<HTMLInputElement | null>(null);

	// ── model state ───────────────────────────────────────────────────────────
	let model = $state<ModelPhase>('hidden');
	let modelProgress = $state(0);
	let modelLabel = $state('');
	let modelError = $state('');
	let prompt = $state('');
	let asking = $state(false);
	let exchanges = $state<Exchange[]>([]);

	function mb(n: number): string {
		return (n / 1024 / 1024).toFixed(0);
	}

	function onExampleChange(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		selectedExample = id;
		const ex = EXAMPLES.find((x) => x.id === id);
		if (ex) code = ex.code;
	}

	async function run() {
		if (phase !== 'idle') return;
		phase = 'running';
		progress = 0;
		compiling = false;
		error = '';
		try {
			handle = await loadComponent((loaded, total) => {
				progress = total ? loaded / total : 0;
				progressLabel = `${mb(loaded)} / ${mb(total)} MB`;
				if (loaded >= total && total > 0) compiling = true;
			});
			if (csvText !== SAMPLE_CSV) await injectCsv(handle, csvText);
			const r = await runExec(handle, code);
			result = r.text;
			resultImage = r.image;
			ms = r.ms;
			resultError = r.isError;
			phase = 'done';
		} catch (e) {
			error = (e as Error).message || String(e);
			phase = 'idle';
		}
	}

	async function rerun() {
		if (!handle || rerunning) return;
		rerunning = true;
		error = '';
		try {
			const r = await runExec(handle, code);
			result = r.text;
			resultImage = r.image;
			ms = r.ms;
			resultError = r.isError;
		} catch (e) {
			error = (e as Error).message || String(e);
		} finally {
			rerunning = false;
		}
	}

	// WebLLM loads ONLY here — on explicit click of the act-two button.
	async function loadModel() {
		if (model !== 'hidden' || !handle) return;
		model = 'running';
		modelProgress = 0;
		modelError = '';
		try {
			await engineLoadModel((r) => {
				modelProgress = r.progress;
				modelLabel = r.text;
			});
			model = 'done';
		} catch (e) {
			modelError = (e as Error).message || String(e);
			model = 'hidden';
		}
	}

	async function ask() {
		const q = prompt.trim();
		if (!q || !handle || asking) return;
		asking = true;
		try {
			const r = await askModel(handle, q);
			exchanges = [...exchanges, { q, code: r.code, result: r.result, error: r.isError }];
			prompt = '';
		} catch (e) {
			exchanges = [...exchanges, { q, code: '', result: (e as Error).message, error: true }];
		} finally {
			asking = false;
		}
	}

	function onPromptKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			ask();
		}
	}

	async function useCsvText(name: string, text: string) {
		csvName = name;
		csvText = text;
		if (handle) {
			await injectCsv(handle, text);
			if (phase === 'done') await rerun();
		}
	}

	async function onFile(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;
		const text = await f.text();
		await useCsvText(f.name, text);
	}

	async function onDrop(e: DragEvent) {
		e.preventDefault();
		const f = e.dataTransfer?.files?.[0];
		if (!f || !/\.csv$/i.test(f.name)) return;
		const text = await f.text();
		await useCsvText(f.name, text);
	}

	function reset() {
		phase = 'idle';
		progress = 0;
		compiling = false;
		result = '';
		resultImage = undefined;
		error = '';
		model = 'hidden';
		modelProgress = 0;
		modelError = '';
		prompt = '';
		exchanges = [];
		// keep the loaded component + session; just clear the UI. A fresh load
		// isn't needed — the session persists and re-run works.
	}

	const progressPct = $derived(Math.round(progress * 100));
	const modelPct = $derived(Math.round(modelProgress * 100));
	const modelHidden = $derived(phase === 'done' && model === 'hidden');
</script>

<div class="px-scope">
	<div
		role="region"
		aria-label="python-env exec demo"
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
		class="relative overflow-hidden rounded-[14px] border border-border-medium bg-gradient-to-b from-card to-elevated shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
	>
		<!-- panel header -->
		<div
			class="flex items-center gap-2.5 border-b border-border bg-accent/5 px-4 py-2.5 font-mono text-[0.78rem]"
		>
			<span class="h-[9px] w-[9px] rounded-full bg-primary shadow-[0_0_8px_rgba(245,158,11,0.5)]"
			></span>
			<span class="text-accent/90">python-env</span>
			<span class="text-faint-foreground">·</span>
			<span class="text-foreground">exec</span>
			<span class="ml-0.5 whitespace-nowrap text-[0.72rem] text-faint-foreground">— a tool</span>
			{#if phase === 'done'}
				<span class="ml-auto flex items-center gap-1.5 text-[0.72rem] text-success">
					<span class="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]"
					></span>session live
				</span>
			{/if}
		</div>

		<!-- example picker -->
		<div class="flex items-center gap-2.5 px-[1.1rem] pt-3.5 font-mono text-[0.72rem] text-faint-foreground">
			<span class="text-accent shrink-0">example</span>
			<select
				value={selectedExample}
				onchange={onExampleChange}
				class="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none focus-visible:border-accent-600"
			>
				{#each EXAMPLES as ex}
					<option value={ex.id}>{ex.label}</option>
				{/each}
			</select>
		</div>

		<!-- code argument -->
		<div class="px-[1.1rem] pt-3 pb-2.5">
			<div class="mb-2 flex items-baseline gap-2 font-mono text-[0.72rem] text-faint-foreground">
				<span class="text-accent">code</span>
				<span>: str</span>
				<span class="ml-auto whitespace-nowrap text-fainter-foreground">the exec argument</span>
			</div>
			<Textarea bind:value={code} spellcheck="false" rows={3} class="resize-y" />
		</div>

		<!-- csv row -->
		<div class="flex flex-wrap items-center gap-2.5 px-[1.1rem] pt-0.5 pb-3.5 font-mono text-[0.78rem]">
			<button
				type="button"
				onclick={() => fileInput?.click()}
				class="inline-flex items-center gap-2 rounded-md border border-[rgba(99,102,241,0.28)] bg-[rgba(99,102,241,0.1)] px-2.5 py-1 text-[#a5b4fc] transition-colors hover:border-[rgba(99,102,241,0.5)]"
			>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M14 4v5h5" /></svg
				>
				{csvName}
				<span class="text-fainter-foreground">▾</span>
			</button>
			<button type="button" onclick={() => fileInput?.click()} class="text-fainter-foreground hover:text-faint-foreground"
				>or drop your own .csv</button
			>
			<input bind:this={fileInput} onchange={onFile} type="file" accept=".csv,text/csv" class="hidden" />
		</div>

		<!-- ACTION / PROGRESS / RESULT -->
		<div class="px-[1.1rem] pb-[1.1rem]">
			{#if error && phase !== 'running'}
				<div class="mb-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 font-mono text-[0.76rem] text-destructive">
					{error}
				</div>
			{/if}

			{#if phase === 'idle'}
				<Button onclick={run} class="w-full text-[0.98rem]">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"
						><path d="M8 5v14l11-7z" /></svg
					>
					Run
					<span class="font-mono text-[0.8rem] font-medium opacity-70">· downloads ~113 MB once</span>
				</Button>
				<div class="mt-2.5 text-center font-mono text-[0.7rem] text-fainter-foreground">
					signed component from actpkg.dev · no upload · cached after first run
				</div>
			{:else if phase === 'running'}
				<div class="rounded-lg border border-border bg-background px-4 py-3.5">
					<div class="mb-2.5 flex items-center justify-between font-mono text-[0.78rem] text-muted-foreground">
						<span>{compiling ? 'sealing the sandbox …' : 'downloading numpy + pandas …'}</span>
						<span class="text-accent tabular-nums">{compiling ? 'compiling' : progressLabel}</span>
					</div>
					<Progress value={compiling ? 100 : progressPct} max={100} />
				</div>
			{:else}
				<div class="flex flex-col gap-2.5">
					<!-- result line -->
					<div
						class="act-anim flex items-start gap-2.5 rounded-lg border {resultError ? 'border-destructive/40' : 'border-border'} bg-background px-3.5 py-3 font-mono text-[0.86rem]"
						style="animation: act-rise .4s ease-out;"
					>
						<span class="shrink-0 text-faint-foreground">{resultError ? 'error' : 'result'}</span>
						<span class="whitespace-pre-wrap {resultError ? 'text-destructive' : 'text-foreground'}">{result}</span>
						{#if !resultError}
							<span class="ml-auto flex shrink-0 items-center gap-1.5 text-[0.76rem] text-success">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
									><path d="M20 6L9 17l-5-5" /></svg
								>{ms} ms
							</span>
						{/if}
					</div>

					{#if resultImage}
						<div
							class="act-anim overflow-hidden rounded-lg border border-border bg-background p-3"
							style="animation: act-rise .4s ease-out;"
						>
							<img
								src={resultImage.dataUrl}
								alt="exec() output ({resultImage.mime})"
								class="mx-auto block max-w-full rounded"
							/>
						</div>
					{/if}

					<div class="flex items-center gap-2">
						<Button variant="secondary" size="sm" onclick={rerun} disabled={rerunning} class="font-mono text-[0.74rem]">
							{rerunning ? 'running…' : '▶ run again'}
						</Button>
						<span class="font-mono text-[0.68rem] text-fainter-foreground">edit the code above and re-run — same session</span>
					</div>

					<!-- SIGNATURE — the sealed capability ledger -->
					<div
						class="act-anim overflow-hidden rounded-[10px] border border-success/30 bg-gradient-to-b from-success/5 to-transparent"
						style="animation: act-seal .5s cubic-bezier(.2,.8,.2,1) .12s;"
					>
						<div
							class="flex items-center gap-2 border-b border-success/[0.18] px-3.5 py-2 font-mono text-[0.72rem] tracking-[0.12em] text-success uppercase"
						>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
								><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg
							>
							Sealed · only its 2 declared capabilities · deny-by-default
						</div>
						<div class="grid grid-cols-2 gap-px bg-border">
							<div class="bg-card px-3.5 py-2.5">
								<div class="mb-2 font-mono text-[0.68rem] tracking-[0.1em] text-success uppercase">
									✓ can touch — declared
								</div>
								<div class="flex flex-wrap gap-1.5">
									<Badge variant="fs">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
											><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /></svg
										>{csvName}
									</Badge>
									<Badge variant="http">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
											><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg
										>pypi only
									</Badge>
								</div>
								<div class="mt-2 font-mono text-[0.66rem] text-fainter-foreground">
									the file you handed it · pypi so <span class="text-faint-foreground">micropip</span> works
								</div>
							</div>
							<div class="bg-card px-3.5 py-2.5">
								<div class="mb-2 font-mono text-[0.68rem] tracking-[0.1em] text-destructive uppercase">
									✕ can't touch
								</div>
								<div class="flex flex-wrap gap-1.5">
									<Badge variant="denied">other files</Badge>
									<Badge variant="denied">other hosts</Badge>
									<Badge variant="denied">env / keys</Badge>
									<Badge variant="denied">DOM / js</Badge>
								</div>
								<div class="mt-2 font-mono text-[0.66rem] text-fainter-foreground">
									no ambient authority beyond the two above
								</div>
							</div>
						</div>
					</div>

					<!-- ACT TWO tease / state 2 -->
					{#if modelHidden}
						<Button variant="ghost" onclick={loadModel} class="w-full text-[0.88rem]">
							<span class="text-accent">✦</span> Let a local model call exec for you
							<span class="font-mono text-[0.76rem] text-fainter-foreground">· +~900 MB · optional</span>
						</Button>
						{#if modelError}
							<div class="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2 font-mono text-[0.74rem] text-destructive">
								{modelError}
							</div>
						{/if}
					{/if}

					{#if model === 'running'}
						<div class="rounded-lg border border-border bg-background px-4 py-3.5">
							<div class="mb-2.5 flex items-center justify-between gap-3 font-mono text-[0.78rem] text-muted-foreground">
								<span class="truncate">{modelLabel || 'loading local model (WebLLM) …'}</span>
								<span class="text-accent tabular-nums">{modelPct}%</span>
							</div>
							<Progress value={modelPct} max={100} />
						</div>
					{/if}

					{#if model === 'done'}
						<div
							class="act-anim rounded-[10px] border border-accent/[0.22] bg-gradient-to-b from-accent/[0.04] to-transparent px-4 py-3.5"
							style="animation: act-rise .4s ease-out;"
						>
							<div class="mb-3 font-mono text-[0.66rem] tracking-[0.12em] text-accent uppercase">
								✦ driven by a local model · same exec tool
							</div>

							<div class="flex flex-col gap-2.5 font-mono text-[0.82rem] leading-[1.7]">
								{#each exchanges as ex}
									<div class="border-l-2 border-accent/25 pl-2.5">
										<div><span class="text-faint-foreground">you&nbsp;&nbsp;&nbsp;→</span> <span class="text-foreground">{ex.q}</span></div>
										<div class="mt-0.5"><span class="text-accent/90">model →</span> <span class="text-foreground">exec(code = {ex.code})</span></div>
										<div class="mt-0.5 flex flex-wrap items-center gap-2.5">
											<span class="text-faint-foreground">result</span> <span class="whitespace-pre-wrap {ex.error ? 'text-destructive' : 'text-foreground'}">{ex.result}</span>
											{#if !ex.error}<span class="ml-auto text-[0.72rem] text-success">✓ ran sandboxed — still 0 capabilities</span>{/if}
										</div>
									</div>
								{/each}
								{#if asking}
									<div class="pl-2.5 text-fainter-foreground">model is writing pandas…</div>
								{/if}
							</div>

							<div class="mt-3.5 flex items-center gap-2">
								<span class="font-mono text-[0.82rem] text-faint-foreground">you&nbsp;&nbsp;&nbsp;→</span>
								<Input
									bind:value={prompt}
									onkeydown={onPromptKey}
									placeholder="ask your own question about the CSV…"
									spellcheck="false"
									class="flex-1"
								/>
								<Button onclick={ask} size="sm" disabled={asking} class="shrink-0">Ask</Button>
							</div>
						</div>
					{/if}

					<Button variant="link" onclick={reset} class="self-start font-mono text-[0.72rem] text-fainter-foreground"
						>↺ reset</Button
					>
				</div>
			{/if}
		</div>
	</div>

	<p class="mx-auto mt-3.5 max-w-[52ch] text-center font-mono text-[0.72rem] leading-relaxed text-fainter-foreground">
		This is the real thing — the <span class="text-faint-foreground">code</span> is the argument to the
		<span class="text-faint-foreground">exec</span> tool; the output is its real result. Not a REPL, not a video.
	</p>
</div>
