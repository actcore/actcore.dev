---
title: "AI agent tools run with your permissions. They don't have to."
description: "Every MCP server you install executes with your files, your keys and the whole network. ACT packages tools as WebAssembly components with a declared capability ceiling, explicit grants and an audit trail — with a live demo: real pandas, in your browser tab, touching one file."
pubDate: 2026-10-05
author: actcore
---

Every MCP server or agent tool you install today runs with your permissions:
your SSH keys, your `.env` files, your browser cookies, the whole network. What
it touched, you find out afterwards — if ever.

**ACT** (Agent Component Tools) packages a tool as one WebAssembly component.
The component declares what it needs — *this directory*, *these hosts* — and
the host enforces it: anything undeclared is denied, anything declared still
waits for your grant, and every decision lands in an audit trail. The same
`.wasm` file is an MCP server (stdio or Streamable HTTP), a command-line tool,
and it runs in a browser tab.

## Try it in your browser

[actcore.dev/python](/python) is real CPython with numpy and pandas, compiled
for WASI — not Pyodide, not Emscripten — executing your CSV inside the tab.
It can touch the one file you hand it and reach PyPI, nothing else. Pick the
**escape** example: it asks the component to fetch from a non-PyPI host, and
the policy refuses before the request leaves the page.

The first run downloads ~113 MB, once. It needs JSPI: Chrome/Edge 137+ or
Firefox 153+.

## Or from a terminal

![act info shows what a tool can touch, a grant covers one directory, and with no grant it asks](/blog/act-terminal.gif)

```bash
mkdir -p /tmp/demo
npx @actcore/act call actpkg.dev/library/sqlite query \
  --args '{"sql":"SELECT sqlite_version()"}' \
  --session-args '{"database_path":"/tmp/demo/app.db"}' \
  --allow 'fs=/tmp/demo/**'
```

`act info <component>` shows what a tool can touch before it ever runs.
Without a grant, an interactive run **asks** on first access and a headless
one denies. Every capability decision — allow, deny, ask, and the rule that
decided it — goes to the audit trail on stderr, independently of your logging
setup.

The grant line above is one directory. `--allow 'http=https://api.example.com'`
is one host. `--deny 'fs=/data/secret/**'` carves a rule back out. A component
cannot get past what it declared, and you cannot accidentally grant more than
you named.

## The ecosystem around it

- **`act`**, the host: Rust + wasmtime, MCP and CLI, capability policy, audit
  trail. The current release, 0.14.4, tracks wasmtime 49.0.2 with this year's
  engine security advisories closed.
- **`act-build`**: embeds component metadata and pushes to any OCI registry.
  Published components are signed with keyless cosign in CI.
- **22 components** on [actpkg.dev](https://actpkg.dev) — sqlite, postgres,
  http-client, pdf, archive, the Python environment, browser automation over
  WebDriver BiDi, a VNC desktop.
- Rust and Python SDKs; components in Go, C/C++, Zig, Kotlin and a few more
  languages run the same way (experimental).

## What it isn't

Not a VM. Isolation is WebAssembly — wasmtime in the CLI, the browser's own
engine in the tab — plus a capability policy on top. A native MCP server has
to be rebuilt as a component to get any of this; the SDKs make that a small
change, but it is a change.

## Feedback wanted

The capability model is the part we'd most like feedback on: what would you
need to see before letting a third-party tool run on your machine? The
[docs](/docs/) cover the [policy model](/docs/host/policy/) end to end, and
the code is at [github.com/actcore/act-cli](https://github.com/actcore/act-cli)
(MIT OR Apache-2.0).
