# Show HN — ACT launch post (DRAFT)

> **Status:** DRAFT for founder review (ACT-71). Not submitted.
> **Narrative:** hardened AI toolchain / supply-chain security (locked positioning, 2026-05-09).
> WebLLM joint demo intentionally **decoupled** from this launch (separate co-launch track, ACT-67/69).
> **Timing:** original 2026-05-18 slot has passed — reschedule to a **Mon–Wed, ~08:00 PT** slot.

---

## Working title

**Show HN: My MCP tools can't read $HOME unless I let them**

Honest about the model that actually ships: capabilities are *pre-granted* (declared in `act.toml`, enforced by the sandbox at startup). No runtime-consent / "asks you mid-run" framing — the CLI has no such mechanism yet (that's the toolserver, see trajectory line). Earlier "without telling you" title was retracted for exactly this reason.

### Alternative titles (founder pick)
1. **My MCP tools can't read $HOME unless I let them** ← current pick; retains the visceral $HOME punch, "unless I let them" = past-tense pre-grant.
2. I made MCP tools you can audit before they run — `act info` angle; more accurate, slightly less click.
3. MCP tools where I grant filesystem access per-tool, not per-process — names the differentiation vs. how MCP servers run today.
4. My MCP tools declare what they'll touch — and the host enforces it — most accurate, weakest hook.

Self-test for whichever wins: *"would I upvote this on /newest?"* — specific, concrete benefit, no hype.

---

## Body (~210 words)

Install an MCP server today and it runs with your full user permissions. It can read `~/.ssh`, `~/.aws`, your shell history — and you mostly can't tell which tools touch what. That's the gap ACT closes.

ACT packages each tool as a WebAssembly component. Capabilities (filesystem, network, sockets) are declared in an `act.toml` manifest and enforced by the host sandbox. Everything is **denied by default** — a tool reads `$HOME` only if you grant it, e.g. `--fs-allow ~/project`. You can inspect exactly what a component exposes and declares *before* you run it (`act info`), and components are published as **signed artifacts** you can verify against their build provenance.

The same component runs as an MCP server, an HTTP/JSON API, a CLI, and — via jco + JSPI — **in the browser with no server**. Try any component in the playground: paste an OCI ref, see its capability badges, call a tool → https://actcore.dev/playground

Code (Rust + Python SDKs, ~13 components): https://github.com/actcore

Next: a desktop broker that turns the static manifest into *per-call* consent with an audit log for SIEM. Today's pre-grant model is the foundation. Feedback welcome.

---

## Suggested first comment (author context — HN convention)

> Author here. A few things that didn't fit the post:
>
> - "Sandboxed" here means the wasm component literally can't issue a syscall the host didn't grant — it's not a policy linter, it's wasmtime's capability model. fs/http/sockets each have deny / allowlist / open modes.
> - It works with any MCP client (Claude Desktop, etc.) because MCP is just one of the transports the same artifact speaks.
> - Browser runtime needs Chrome 148+ today (JSPI). It's on track to go cross-browser — JSPI is in Interop 2026 (Safari/Firefox committed by end of year); WPT JSPI pass rate is already ~93%. *(verify stat before posting)*
> - We hit and reported/fixed a bug upstream in jco (Bytecode Alliance's component toolchain) getting wasip3-async components to run in-browser: <jco PR/issue URL> *(confirm URL)*
> - Want to audit the binary, not just the manifest? Verification docs: <cosign verify docs URL> *(only if ACT-73 ships before posting; otherwise drop this bullet)*

---

## Pre-flight checklist (acceptance criteria — all must pass before filing)

- [ ] **Title locked** by founder (from candidates above).
- [ ] `https://actcore.dev/playground` is **live** and works on a cold visit (ACT-70 marked Done 2026-05-24 — confirm the public URL actually serves, default example loads, tool call renders).
- [ ] Playground shows **capability badges** for a component (the post promises this — confirm the UI actually renders declared capabilities; if not, soften the wording to "see its tools and call one").
- [ ] `https://github.com/actcore` org link is correct and repos are public.
- [ ] jco contribution URL confirmed (PR #1464 / the wasip3-async lift issue) for the first comment.
- [ ] JSPI / Interop 2026 / WPT ~93% stat re-verified (don't post a stale number).
- [ ] cosign verify docs (ACT-73): include the audit-the-binary bullet **only if** the docs page is live; otherwise drop it.
- [ ] Body re-counted ≤ 250 words.
- [ ] Reviewed by founder.
- [ ] Submission scheduled: Mon–Wed, ~08:00 PT.
- [ ] Commit this file (review-before-commit gate; founder commits).

## Decoupled / out of scope for this post
- WebLLM joint demo (ACT-67) and WebLLM-maintainer outreach (ACT-69) — separate co-launch track; not referenced in this post beyond the generic "runs in the browser" line.
- Reddit / Twitter / Bluesky cross-posts — separate tasks post-launch.
