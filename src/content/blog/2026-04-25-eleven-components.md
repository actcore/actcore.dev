---
title: "A tour of actpkg — components on the protocol"
description: "A protocol is only interesting if people actually write for it. Here's what's published on actpkg today — storage, network bridges, utilities, language embedders — and what each one is for."
pubDate: 2026-04-25
author: actcore
---

> **Update (2026-08):** the per-class policy flags used below — `--fs-policy`,
> `--fs-allow`, `--http-policy`, `--http-allow` and friends — were replaced by a uniform
> grant model (`--grant`, `--allow`, `--deny`), and the default mode is now `ask` rather
> than deny. The capability-ceiling model this post describes is unchanged; only the flag
> spelling is. See [Policy & sandbox](/docs/host/policy/).

The core ACT spec is small: a tool-dispatch interface and a few CBOR
shapes on the wire, with stateful capabilities (sessions, events,
resources) layered on as separate opt-in packages. But a protocol is
only interesting if people actually write for it. Here's what's on
`actpkg.dev/library` today, grouped by kind.

Every component is MIT-or-Apache-2.0, published with signed
attestations, and runnable with:

```bash
npx @actcore/act info actpkg.dev/library/<name>:latest --tools
```

## Data & storage

### [`sqlite`](https://github.com/actpkg/sqlite)

A SQLite database as a component. Exposes `query`, `exec`,
`batch-exec`, `schema`. Uses `rusqlite` compiled to wasm32-wasip2
with the wasi-sdk toolchain; the database file is whatever path the
operator grants via `--fs-allow`.

```bash
npx @actcore/act run actpkg.dev/library/sqlite:latest --mcp \
  --fs-policy allowlist --fs-allow /data/app.sqlite
```

Also ships a `sqlite-vec` variant with [sqlite-vec](https://github.com/asg017/sqlite-vec) linked in
for vector-index queries. Same interface, one extra build target.

### [`filesystem`](https://github.com/actpkg/filesystem)

Generic `read`, `write`, `list`, `stat`, `delete` over the component's
filesystem capability grant. Good when an agent needs "edit a file" and
you don't want to ship a language-specific MCP server.

### [`openwallet`](https://github.com/actpkg/openwallet)

[OpenWallet](https://openwallet.foundation/)-compatible local key
storage. Stores seed phrases and derived keys on the filesystem under
the operator-granted vault path.

## Network bridges

### [`http-client`](https://github.com/actpkg/http-client)

`GET`, `POST`, `PUT`, `DELETE` with full header / body control. The
component declares `wasi:http` with whatever hosts the operator lets
it reach. Useful when you want a component (not the host) to do the
fetching — for example, from inside a bridge.

### [`openapi-bridge`](https://github.com/actpkg/openapi-bridge)

Point it at **any** OpenAPI 3.x spec. The spec URL travels through
`open-session` args (typed schema, validated host-side); the bridge
fetches and parses the spec, then exposes each operation as a tool.
One component fronts anything — Stripe, GitHub, your internal API,
the Petstore reference — with one capability grant per upstream:

```bash
act call actpkg.dev/library/openapi-bridge:latest find_pets_by_status \
  --args '{"status":"sold"}' \
  --session-args '{"spec_url":"https://api.example.com/openapi.json"}' \
  --http-policy allowlist --http-allow host=api.example.com
```

### [`mcp-bridge`](https://github.com/actpkg/mcp-bridge)

Reverse adapter: wraps an upstream MCP server (Streamable HTTP
transport) and re-exposes its tools through the ACT protocol. Lets
you connect an existing MCP ecosystem to ACT-native clients, or put
an ACT policy layer in front of an unsandboxed MCP server you don't
fully trust.

### [`act-http-bridge`](https://github.com/actpkg/act-http-bridge)

Symmetric: wraps a remote ACT-HTTP server behind a local component.
Useful for fronting a team-hosted service as a local-looking tool.

All three bridges are session-based: the upstream URL and any
credentials live inside `open-session.args` rather than per-call
metadata. See [the sessions and bridges
post](/blog/2026-05-07-act-07-sessions/) for the architecture and
why authentication ended up there.

## Utilities

### [`crypto`](https://github.com/actpkg/crypto)

SHA-256, SHA-512, BLAKE3, HMAC, Ed25519, X25519. All standard-lib
algorithms behind a clean tool surface. Useful when a script needs a
hash without pulling in a language-specific crypto package.

### [`encoding`](https://github.com/actpkg/encoding)

Base64, base64url, base32, hex, percent encoding, UUID parsing. The
one tool everyone writes a hundred times.

### [`random`](https://github.com/actpkg/random)

Cryptographically secure random strings, UUIDs (v4 and v7), and
integers in a range. LLMs cannot generate true randomness —
components can.

### [`time`](https://github.com/actpkg/time)

Clock access, timezone conversions, duration math. Pure wasip2, no
host dependencies.

## Language embedders

### [`python-eval`](https://github.com/actpkg/python-eval)

An entire CPython interpreter baked into a wasm component via [`componentize-py`](https://github.com/bytecodealliance/componentize-py).
Takes a string of Python, runs it in a fresh namespace, returns
stdout + the last-expression value. Demonstrates that "running
untrusted code" is a fair thing to do under the ACT sandbox because
the ceiling is explicit.

Coming up:

- **`js-eval`** — SpiderMonkey via componentize-js. Blocked on
  [async-export support upstream](https://github.com/bytecodealliance/ComponentizeJS/issues/335).

## Categorize the pattern

Looking across the catalog, three patterns stand out:

1. **Data-plane components** own state on disk under an operator
   grant (`sqlite`, `filesystem`, `openwallet`). The operator's
   filesystem allow-list is the total exposure.
2. **Bridge components** translate an external protocol into ACT
   (`openapi-bridge`, `mcp-bridge`, `act-http-bridge`). One component
   covers a whole class of upstream — point it at a different URL
   via `open-session` and it fronts a different upstream.
3. **Pure functions** do computation with no I/O beyond the call
   boundary (`crypto`, `encoding`, `random`, `time`). No capabilities
   declared at all — hard-deny on anything the operator tries to
   grant.

Bridges are where the compounding happens. One `openapi-bridge`
becomes `stripe`, `github`, `linear`, `anything-that-ships-OpenAPI`
— each as its own session against the same component, costing one
capability grant per upstream host.

## Publishing your own

The workflow is small enough to describe in a paragraph:

1. Scaffold from the Rust or Python template:
   `copier copy gh:actcore/act-template-rust my-component`.
2. Write tools with `#[act_tool]` / `@tool`. Declare capabilities in
   `act.toml`.
3. `just build && just test`.
4. Push to `actcore/projects/my-component` or your own namespace.
   CI runs `just publish` on `main`, which `oras push`es to
   `ghcr.io/<ns>/my-component:<version>` with a GitHub attestation.

Any OCI registry works. Any CI works. The artifact ends up
discoverable by `act pull` and usable by `act run` on every
platform.

## What's missing

Plenty.

- JavaScript SDK (blocked upstream).
- MoonBit (blocked on a wit-bindgen-moonbit export bug).
- More bridges — A2A, AGNTCY, LSP over TCP are on the backlog.
- A proper `act-toolserver` that composes several components with a
  shared policy engine. That's the next large piece.

If any of the categories above are missing a component you'd reach
for, [open an issue](https://github.com/actcore/act-cli/issues) — or
publish it yourself.
