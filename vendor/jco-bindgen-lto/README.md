# Vendored LTO `js-component-bindgen` (temporary)

This directory holds a **locally-built, LTO-optimized** copy of jco's in-browser
transpiler bindgen, aliased into the demo build by `astro.config.mjs`.

## Why this exists

`@bytecodealliance/jco-transpile`'s **published** bindgen is not LTO-optimized —
its release CI restored a Rust build cache instead of compiling fresh, so fat-LTO
never ran. Measured on `python-env`:

| | published (0.4.1) | this LTO build |
|---|---|---|
| `js-component-bindgen-component.core.wasm` | 8.9 MiB | **3.1 MiB** |
| functions | 17,616 | **7,836** |
| transpile time | ~56 s | **~7.5 s** |

The upstream fix is merged (bytecodealliance/jco **#1737**, which builds the
release fresh) but **not yet released**. Until a fixed `jco-transpile` publishes,
the demo would otherwise bundle the slow (or, from the stale `^0.3.3` direct dep,
the 133 MiB *debug*) bindgen.

## How it was built

From a checkout of `bytecodealliance/jco` `main` (has #1732 + #1737):

```
pnpm install
pnpm --filter @bytecodealliance/jco-transpile run build:release
# → packages/jco-transpile/vendor/js-component-bindgen-component.{js,core.wasm,core2.wasm}
```

Only the three runtime files the bindgen `.js` needs are vendored here
(it also imports `@bytecodealliance/preview2-shim/*`, resolved from node_modules).

## TODO: remove me

When `@bytecodealliance/jco-transpile` publishes a release built by the fixed
workflow (version `> 0.4.1`, bindgen ~3 MiB), delete this directory and revert
the `jcoBindgen` alias in `astro.config.mjs` back to the `node_modules` path.
