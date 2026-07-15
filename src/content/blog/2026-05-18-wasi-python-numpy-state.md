---
title: "WASI Python in 2026: dlopen works, NumPy still doesn't"
description: "A self-hosted Python sandbox for AI agents that can't import NumPy — and the surprise is that the blocker isn't the runtime anymore. A field report on the state of WASI Python in May 2026: the runtime is ready, PEP 816 just went Active, and the wheels are still ahead of us."
pubDate: 2026-05-18
author: actcore
---

> **Update (2026-08):** this has since been solved. The `python-env` component now ships
> **numpy 2.5.0, pandas 3.0.3 and Pillow** compiled for wasm, using the WebAssembly
> exception-handling proposal rather than the wheels this post was waiting on. You can run
> pandas in a browser tab on the [Python playground](/python). The analysis below is kept
> as a record of where WASI Python stood in May 2026.

Three weeks ago I packaged a CPython 3.14 interpreter as a WebAssembly
component. The pitch is simple: AI agents need to execute untrusted
Python code, and today's options ([E2B](https://e2b.dev),
[Daytona](https://daytona.io), [Modal](https://modal.com), Cloudflare
Sandboxes) are cloud microVMs with billing surfaces, network
requirements, and the trust boundary at someone else's organization. A
self-contained `.wasm` you can ship anywhere — offline laptops,
regulated environments, even Android over `adb push` — slots into a
different deployment story.

The component works. You can do this:

```bash
$ act call python-eval.wasm exec --args '{"code":"print(sum(range(100)))"}'
4950
```

You can serve it over MCP (`act run python-eval.wasm --mcp`) and any
agent that speaks the protocol can call `exec(code)`. The host
controls what filesystem paths and HTTP hosts are mounted into the
guest, so a misbehaving snippet can't reach `/etc/passwd` or the cloud
metadata service unless you explicitly allow it.

But the moment you ask an agent to run `pd.read_csv()` in there, the
answer is no. And when I went looking for the reason, the actual story
is the opposite of what I'd been telling people. Here's the tour.

## What I assumed: dlopen still doesn't work

I'd internalised the 2023-era version of WASI Python: CPython compiled
to wasm32-wasip2 ran the stdlib fine, but native extensions
(`numpy._core._multiarray_umath`, `pandas._libs.window`, the C parts
of `cryptography`) needed a working `dlopen`, and `dlopen` was
indefinitely "experimental" in WASI. componentize-py was riding a
[temporary fork of WASI-SDK](https://github.com/bytecodealliance/componentize-py/issues/113)
to get partial shared-library support, waiting for upstream to land
the work.

That story stopped being true in 2025, and I missed the update.

- **wasi-libc landed shared library support in September 2023**
  ([PR #429](https://github.com/WebAssembly/wasi-libc/pull/429)),
  followed by `dlopen`/`dlsym` stubs
  ([PR #443](https://github.com/WebAssembly/wasi-libc/pull/443),
  November 2023).
- **WASI-SDK 21 shipped functional `dlopen`** in February 2024. Brett
  Cannon's [WASI Python milestone post](https://discuss.python.org/t/cpython-now-compiles-and-passes-under-wasi-sdk-21/48514)
  noted that with SDK 21 he no longer needed to patch CPython source
  to make the test suite pass.
- **componentize-py migrated to upstream WASI-SDK in October 2025.**
  [Issue #113](https://github.com/bytecodealliance/componentize-py/issues/113)
  ("Update to latest WASI-SDK and the new `wasm32-wasip2` target") was
  closed completed on 2025-10-03 via PR #167; the project now ships
  against upstream WASI-SDK v27, CPython 3.14, and Wasmtime 37.
- **[PEP 816](https://peps.python.org/pep-0816/) went Active on
  2026-02-26.** Brett Cannon submitted it to the Steering Council on
  January 9; the SC approved it seven weeks later. The PEP locks down
  a specific WASI version and WASI SDK version per CPython release,
  treating WASI as a supported build platform with the same governance
  commitments (PEP 11 entry, named maintainers, SC sign-off on version
  changes) as Linux or macOS. CPython 3.13/3.14 are pegged to WASI
  SDK 24; 3.15 will pick its baseline at beta 1.

The runtime piece, in other words, is essentially solved — and as of
just under three months ago, it has the governance scaffolding usually needed
before downstream maintainers commit work to a platform. The toolchain
you'd want to compile NumPy against exists, ships from official
upstreams, and is on a published support roadmap.

So why doesn't `import numpy` work?

## What's actually broken: the wheels

There are no WASI wheels on PyPI.

For a package to be `pip install`-able on WASI, the package needs to
be built against the WASI SDK CPython was compiled with, the resulting
artefact needs a platform tag (`wasi_0_2_x86_64-unknown` or similar),
and PyPI needs to recognise that tag. None of the dozen scientific
Python projects I checked has any of these in their CI.

- **NumPy upstream
  [issue #25859](https://github.com/numpy/numpy/issues/25859)**, "ENH:
  WASI Build", asks for first-party WASI wheels. Opened 2024-02-21,
  last meaningful update 2024-02-21. That two years of silence pre-dates
  PEP 816 going Active, though — until February of this year, WASI
  didn't have the governance commitment that would make a NumPy
  maintainer prioritise the work over user-facing features. The
  upstream issue hasn't caught up to the new context yet.
- **PyPI doesn't yet have a published platform tag for WASI wheels.**
  PEP 816 covers CPython's side of the contract; the wheel-side
  story is in earlier motion. The
  [PEP 817 (Wheel Variants)](https://peps.python.org/pep-0817/) draft,
  posted December 2025, defines a generic variant-tagging framework
  intended for GPU/BLAS/ABI selection — but the same provider-plugin
  mechanism could plausibly host a `wasi_0_2_x86_64-unknown` variant.
  Whether that's the path or a dedicated WASI-tag PEP eventually
  emerges is unclear from the public PyPA discussions.
- **The only end-to-end demo of "WASI Python with NumPy" so far was
  [`wasi-wheels`](https://github.com/dicej/wasi-wheels)**, Joel Dice's
  2023 build-script collection. Last release v0.0.1, December 2023.
  README:

  > This project is an experimental proof-of-concept. It is not being
  > actively maintained; the packages are out-of-date with respect to
  > their upstream versions, and might not even build anymore.

  Two years of bit-rot against current Python releases, current
  WASI-SDK, and current componentize-py snapshots. The pattern that's
  been repeated for years — one motivated individual builds a demo, it
  rots — needs to break, and PEP 816 is the first time the ecosystem
  has had a credible reason to break it.

The blocker has moved from a runtime gap to a packaging-and-adoption
gap. Packaging gaps usually need broader coordination than a single
PR, but the early infrastructure is now landing: PEP 816 made the
runtime contract official in February, PEP 817 is moving on the
wheel-tagging side, and the runtime maintainers are visibly active
(componentize-py is shipping canaries against current upstream).
What's still missing is a scientific-Python maintainer or a funded
team picking up the build infrastructure. That's a question of months,
not weeks, but it's no longer "if."

## Pyodide is right there, but…

The obvious counter is: Pyodide already ships NumPy, Pandas, SciPy,
Matplotlib, scikit-learn — the whole scientific stack runs in the
browser today. So why not use Pyodide?

Because Pyodide targets `wasm32-emscripten`, not `wasm32-wasip2`.
Emscripten is a different ABI: it provides a POSIX-flavoured runtime
backed by JavaScript-side shims, not WASI's import-based capability
model. A Pyodide build expects a JS environment that imports the
emscripten support library; it doesn't compose with the WebAssembly
Component Model the way a wasip2 build does.

There's been periodic interest in a "Pyodide on WASI" port, but it's
a research project — closer to "could work in a year" than "ship it
next week." Even if it landed, the bundled scientific stack would
weigh tens of megabytes per package; the single-`.wasm`, drop-in
portability story gets harder to defend.

## What we shipped instead

`python-eval` 0.3.0 ships with the Python stdlib only. The
[README lists the limitation up front](https://github.com/actpkg/python-eval),
because watching agents fail to `import numpy` with a confusing error
is a bad first experience.

The slot we're now explicitly targeting is **untrusted text-processing
and control-flow code**: regex, string parsing, JSON/CSV/XML
transformation, date math, plugin DSL evaluation, agent-generated
control logic. That covers a real and underserved chunk of agent
tool-use, and it doesn't compete with E2B's actual use cases (data
science with `pd.read_csv` and `df.describe`).

Three system-prompt fragments are checked into the README, designed to
be pasted into a Claude/GPT agent's system block. The strict version:

> You have an `exec(code: str)` tool that runs Python in a sandbox.
> The sandbox has Python stdlib only — NO numpy, pandas, scipy,
> sklearn, matplotlib, or any package with C extensions. No
> networking unless the host has explicitly granted it. State does
> NOT persist between calls — each `exec()` runs in a fresh
> namespace. Use `import` for stdlib modules (re, json, datetime,
> itertools, csv, etc). Print final results.

LLMs handle this kind of constraint well when it's stated up front
and badly when they discover it via traceback.

## What we're watching

The honest limitations list in the README is provisional. The
trajectory is reasonably clear; the timing is what's open. Three
signals will tell us when to revisit:

1. **PEP 817 (or a successor) lands a way to tag WASI wheels.** Once
   PyPI can host `numpy-2.x-cp314-wasi_0_2_x86_64-unknown.whl` artefacts
   that `pip` recognises, the path from "NumPy maintainer pushes the
   wheel" to "your component imports it" becomes a single command.
2. **NumPy issue #25859 starts moving.** A first-party WASI wheel in
   NumPy CI changes the calculus immediately — projects can vendor the
   wheel directly even before PyPI catches up. PEP 816 going Active
   removes the main reason a maintainer might have deferred this.
3. **A funded successor to wasi-wheels appears.** Astral, NumFOCUS,
   the PSF, or one of the agentic-Python vendors picks up the build
   infrastructure as a real product rather than a 2023 demo. The
   maintenance burden is the actual blocker; one funded maintainer
   shifts everything.

None of these are "if". They're "when". Until then, the component
does what it does well, and the failure modes are documented at the
top of the page rather than buried in a traceback.

## A note on positioning

I think the wasm Python conversation has a small honesty problem in
both directions. Posts that say "run Python in WebAssembly" usually
skip the part about which Python and which libraries — Pyodide's
scientific-stack story bleeds into expectations for every other wasm
Python runtime. The other direction is now mine to be careful about:
WASI Python in May 2026 isn't a stuck ecosystem, it's an ecosystem
with the runtime done and the package layer in motion. The first
release with PEP 816 governance went Active just under three months
ago. We don't have NumPy in `python-eval` today, and I don't expect to
have it tomorrow, but I don't think the calendar arithmetic on "when"
is "never" any more.

Saying "stdlib only" out loud is today's trust signal. The next
release will list one fewer caveat.

## Where to find it

- Component: [`actpkg/python-eval`](https://github.com/actpkg/python-eval)
- Host: [`act` CLI](https://github.com/actcore/act-cli) — runs
  components over MCP, ACT-HTTP, or one-shot from the terminal
- Spec: [`act-spec`](https://github.com/actcore/act-spec) — the
  underlying protocol, designed component-first rather than
  transport-first

If you're working on the wheel-tag PEP, building NumPy WASI in CI, or
have a funded maintenance plan for a wasi-wheels successor, please get
in [touch](https://github.com/actcore/act-spec/discussions). The
limitations section will only get shorter with help.
