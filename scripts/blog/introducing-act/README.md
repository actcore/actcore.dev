# Terminal demo — "MCP servers, sandboxed"

Reproducible assets for the intro blog post's embedded terminal demo.

## Source of truth

- **`demo.sh`** — the shell script whose output is what readers see. Edit
  this when command flags rename, output shape changes, or we want to
  swap the demo component.
- **`demo.cast`** — the last recorded session. Checked in so the cast
  survives re-clones and the asciinema.org upload can be re-run without
  re-recording.

## Hosting

The blog embed lives on **asciinema.org** (public). Both actcore.dev and
dev.to resolve their embeds against the same asciinema.org cast ID —
actcore.dev via a client-side script substitution, dev.to via its
native `{% asciinema ID %}` liquid tag. We intentionally don't self-host
the `.cast` in `public/blog/` so there's one canonical source.

## Prerequisites

```bash
brew install asciinema   # macOS
pipx install asciinema   # pip-based systems
asciinema auth           # first time; opens a browser
```

## Workflows

### Record + upload (first time or after a `demo.sh` change)

```bash
./render.sh --upload
# → records demo.cast, uploads to asciinema.org, prints cast URL + ID
```

Then paste the cast URL into the post, as an ordinary markdown link
sitting on its own line:
```
src/content/blog/2026-04-23-introducing-act.md
    [Terminal demo: act info …](https://asciinema.org/a/NEW_ID)
```

### Re-upload the existing demo.cast without re-recording

```bash
./render.sh --upload-only
```

### Just record, don't upload

```bash
./render.sh
```

Useful while iterating on `demo.sh` timings before burning an
asciinema.org ID.

## How the embed resolves

The post's markdown contains a single markdown link to the asciinema.org
cast, sitting alone in its own paragraph. That one source resolves three
ways without any duplicated content:

| Target | Source | Mechanism |
|---|---|---|
| actcore.dev | standalone `<a href="https://asciinema.org/a/X">…</a>` | Client-side JS detects the block-level anchor and replaces it with `<script src="https://asciinema.org/a/X.js">` |
| dev.to | same link | `devto.xml` RSS substitutes the anchor with `{% embed https://asciinema.org/a/X %}`, which dev.to resolves through asciinema.org's registered oEmbed provider |
| generic RSS readers | same link | `rss.xml` leaves the link untouched — feed readers can't execute JS, and a plain link is the graceful fallback |

Source of substitution logic: `src/pages/blog/[...slug].astro` and
`src/lib/rss-items.ts`.
