---
title: "ACT 0.7: sessions, three production bridges, and auth-via-args"
description: "Components can now own per-session state through `act:sessions/session-provider` — a small WIT interface for components that need to hold a database connection, a parsed OpenAPI spec, or an upstream MCP handshake. Three bridges in `actpkg` are rebuilt around it: act-http-bridge, mcp-bridge, openapi-bridge. Auth moves into open-session args, where it belongs."
pubDate: 2026-05-07
author: actcore
tags:
  - act
  - webassembly
  - mcp
  - openapi
---

The previous posts focused on what ACT *is* — sandboxed components, one
binary per transport, capability ceilings. This one is about a thing
that was missing: **state**.

Most of the components on `actpkg` are pure request/response — `crypto`,
`encoding`, `random`, `time`. They don't need a session because every
call is independent. But the moment you reach for tools that *do* —
a database connection, an OpenAPI client that has parsed a 5MB spec, an
MCP bridge mid-handshake with an upstream server — there's nowhere to
put that state. Components held it in `thread_local!` HashMaps keyed by
`std:session-id` metadata, and the host had no idea what those ids
meant or when to clean them up.

ACT 0.7 fixes that. Stateful components now opt into a small new WIT
interface, `act:sessions/session-provider@0.1.0`. The interface is
deliberately tiny — three functions — and it changes nothing for the
80% of components that don't need it.

## The interface

```wit
package act:sessions@0.1.0;

interface session-provider {
  use act:core/types@0.4.0.{metadata, error};

  record session {
    id: string,
    metadata: metadata,
  }

  /// JSON Schema describing valid args for `open-session`.
  /// Hosts use this to validate before they invoke the component.
  get-open-session-args-schema: async func(metadata: metadata)
    -> result<string, error>;

  /// Open a session. `args` carries connection params and credentials.
  open-session: async func(args: metadata, metadata: metadata)
    -> result<session, error>;

  /// Polite shutdown — sync, advisory. The host MUST call this for
  /// every session it opened, before component deinit.
  close-session: func(session-id: string);
}
```

Subsequent capability calls (`tool-provider.list-tools`,
`tool-provider.call-tool`) pass the returned `id` as `std:session-id`
in their metadata. The component does its own state lookup. The host
keeps the wasm instance alive as long as it's serving sessions, and
closes whatever's still open before it tears the instance down.

If you used the old `metadata = {"url": "..."}` shape on the bridges,
this is a breaking change. The reasoning is in the next section.

## Three bridges, rebuilt

The whole reason `act:sessions` exists is that bridges need it. Three
of them just shipped on the new model:

### [`mcp-bridge`](https://github.com/actpkg/mcp-bridge) 0.2.0

Wraps a remote MCP server, exposes its tools as ACT tools.
`open-session` does the MCP `initialize` + `notifications/initialized`
handshake against the upstream and stashes the resulting
`Mcp-Session-Id` header for the lifetime of the session. The bridge
issues its own outward-facing id and maps the two NAT-style — agents
never see the upstream's id, so swapping upstream-session-ids on
expiry is invisible from the agent's side.

```bash
act run ghcr.io/actpkg/mcp-bridge:0.2.0 --mcp
# then, agent: open_session({"url": "https://upstream.example/mcp", "auth_token": "sk-..."})
#         →  {"id": "mcp_0", "metadata": {}}
# then, agent: tools/list with _meta.std:session-id = mcp_0
```

### [`openapi-bridge`](https://github.com/actpkg/openapi-bridge) 0.2.0

Loads an OpenAPI 3.x spec at runtime and exposes each operation as a
local ACT tool. `open-session({spec_url, headers})` fetches and parses
the spec eagerly, so connect or parse failures surface at open time
rather than 17 tool calls later. Path/query/header parameters and
JSON request bodies are flattened into a single tool argument schema,
auto-named from `operationId` (or synthesised from method + path).

The parsed spec is cached by `spec_url` so multiple sessions targeting
the same API share the parse — opening 10 sessions for the same spec
costs one fetch.

### [`act-http-bridge`](https://github.com/actpkg/act-http-bridge) 0.2.0

The simplest of the three. Proxies a remote ACT-HTTP host as local ACT
tools. `open-session({url, headers})`, then any `list-tools` /
`call-tool` is forwarded to the upstream component over HTTP. Useful
when you want one local component to delegate to a fleet of remote
ACT components without mounting all of them in your host config.

## Auth lives in open-session, not metadata

Until 0.7, `mcp-bridge` accepted `auth_token` as `metadata` on every
call. That was wrong on three counts.

**Auth is per-session, not per-call.** Once you've authenticated to
the upstream, every subsequent call within that session uses the same
identity. Stuffing the bearer into every `tools/call` is duplication
and a bug surface — what if some client puts it in some calls and not
others?

**Auth has a schema.** OAuth wants a token. HTTP basic wants a
username and password. mTLS wants a key and cert. Different per-component.
`open-session.args` is component-defined, validated by the host
against the schema returned from `get-open-session-args-schema` before
the credentials ever touch the wasm. There's no place in `metadata`
to carry that schema.

**Auth lives at one boundary.** With session args, the bearer flows
once: host configuration → host validation → wasm via `open-session`.
After that, the agent only ever sees the opaque session-id. If the
session-id leaks, the agent gets capability the operator already
granted. If the bearer leaked from per-call metadata, the agent —
or whoever observed metadata in transit — would have the upstream
credential itself.

Full guidance is in
[`ACT-AUTH.md`](https://github.com/actcore/act-spec/blob/main/spec/ACT-AUTH.md).

## Transport plumbing

The host exposes session lifecycle on the wires it already speaks.

**ACT-HTTP** gains three endpoints (per
[ACT-SESSIONS §6.2](https://github.com/actcore/act-spec/blob/main/spec/ACT-SESSIONS.md#62-act-http)):

```
POST  /sessions/open-args-schema   → JSON Schema (metadata in body)
POST  /sessions                    → 201 with session record
DELETE /sessions/{id}              → 204
```

Subsequent capability calls reference the session via `std:session-id`
in request body metadata or the `X-Act-Session-Id` header.

**MCP** synthesises two virtual tools whenever the underlying
component exports session-provider — `open_session` and
`close_session`, with `_meta.std:session-op` annotations so agents
recognise them as lifecycle ops, not ordinary capabilities. The agent
calls `open_session` once, threads `_meta.std:session-id` into every
subsequent `tools/call`, and finally calls `close_session`. The host
also forwards any `_meta` keys from the agent into the WIT call
metadata, so `std:session-id` reaches the component without any
host-side translation.

**ACT-CLI** picks up a new flag, `act call --session-args`. The host
opens a session, threads the returned id into the call's metadata as
`std:session-id`, runs the tool, and closes the session — all in one
process, so the wasm instance stays alive for the full sequence.

A self-contained demo: serve the `time` component locally, then
proxy through `act-http-bridge` and call it through the proxy.

```bash
# Terminal 1 — upstream ACT-HTTP server.
act run ghcr.io/actpkg/time:0.2.0 --http -l '[::1]:3000'

# Terminal 2 — one-shot call through the bridge.
act call ghcr.io/actpkg/act-http-bridge:0.2.0 get_current_time \
  --args '{}' \
  --session-args '{"url":"http://[::1]:3000"}' \
  --http-policy open
# 2026-05-07T12:00:00.000+00:00
```

The bridge instance opens a session that owns the upstream URL, calls
`get_current_time` through it, closes the session, and exits. With an
`openapi-bridge` instead of `act-http-bridge` and `--session-args
'{"spec_url":"..."}'` instead of `{"url":"..."}'`, the same shape
works for any OpenAPI 3.x spec.

`act session open-args-schema` is also still there for inspecting a
component's session args. Earlier 0.7.0 shipped `act session open` and
`act session close` as separate subcommands, but those were useless:
each invocation is a one-shot process whose wasm instance dies on
exit, so a session opened in one process is unreachable from a later
`call`. They were removed in 0.7.1, and `--session-args` replaces
both of them with the right shape — the open/call/close cycle in one
process — in 0.7.2.

## SDK ergonomics

For Rust components, the new
[`#[session_open]` / `#[session_close]`](https://github.com/actcore/act-sdk-rs/blob/main/act-sdk-macros/src/lib.rs)
markers on top of `act_sdk::SessionRegistry<T>` keep the boilerplate
small:

```rust
use act_sdk::prelude::*;
use act_sdk::SessionRegistry;

#[act_component(name = "counter")]
mod component {
    use super::*;

    pub struct Counter { value: u64 }

    thread_local! {
        static SESSIONS: SessionRegistry<Counter> =
            SessionRegistry::new("ctr");
    }

    #[derive(Deserialize, JsonSchema)]
    struct OpenArgs {
        #[serde(default)]
        start: u64,
    }

    #[session_open]
    fn open(args: OpenArgs) -> ActResult<String> {
        Ok(SESSIONS.with(|r| r.insert(Counter { value: args.start })))
    }

    #[session_close]
    fn close(id: String) {
        SESSIONS.with(|r| { r.remove(&id); });
    }

    // Tools read std:session-id via ActContext<MetaStruct>.
}
```

The macro derives `get-open-session-args-schema` from `OpenArgs` via
`schemars`, decodes the metadata-shaped wire args into the typed
struct, and emits the full session-provider Guest impl. The full
runnable example is
[examples/sessions-counter](https://github.com/actcore/act-sdk-rs/tree/main/examples/sessions-counter).

Components with dynamic tool catalogs — every bridge — currently
hand-roll `wit_bindgen::generate!` because `#[act_component]` only
emits a static `list-tools` from `#[act_tool]` declarations. That's a
known gap; an SDK-side affordance for dynamic catalogs is on the list.

## What's next

- **Host-side OAuth.** ACT-AUTH describes how a host reads
  `x-act-authorization-server` and `x-act-scopes` annotations on the
  open-session schema, runs the OAuth flow, and injects the bearer
  into args before calling `open-session`. The annotations are
  spec'd; the host implementation isn't there yet.
- **Auto-open from host config for `--mcp` / `--http`.** `act call`
  now opens / closes per-invocation via `--session-args`, but for the
  long-running transports the agent still has to call `open_session`
  itself. For "I always want this OpenAPI / MCP server / API"
  configurations, the host should pre-open the session at startup
  from config, so the agent sees ordinary tools and never thinks
  about the session at all.
- **Postgres component.** A component that authenticates via
  `open-session.args`, holds a real connection through the session,
  and does parameterised queries through the tools. Not ready yet —
  this'll be the first non-bridge stateful component on `actpkg`.
- **`SessionContext<T>` SDK sugar.** Drop the
  `ToolMeta { #[serde(rename = "std:session-id")] session_id }`
  boilerplate components currently write to read the session-id.

If you've got an OpenAPI spec, a remote MCP server, or an internal
ACT-HTTP fleet, the bridges are running on `ghcr.io/actpkg` ready for
`act run --mcp`. If you want to write a stateful component yourself,
the [sessions-counter
example](https://github.com/actcore/act-sdk-rs/tree/main/examples/sessions-counter)
is the smallest working template. Issues, ideas, and "this looks like
what I'd want for X but Y is missing" reports are welcome at
[github.com/actcore](https://github.com/actcore).
