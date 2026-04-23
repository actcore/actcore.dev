#!/usr/bin/env bash
# Record demo.sh and publish three artifacts:
#   - public/blog/introducing-act-demo.cast  (served to asciinema-player on actcore.dev)
#   - public/blog/introducing-act-demo.gif   (fallback for dev.to / RSS / LinkedIn previews)
#
# Usage:
#     ./render.sh               # record & publish
#     ./render.sh --render-only # skip recording, re-publish from existing demo.cast
#
# Requirements:
#     asciinema — https://asciinema.org/ (brew/pipx install asciinema)
#     agg       — https://github.com/asciinema/agg (cargo install --git … agg
#                 or download binary release)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAST_LOCAL="${HERE}/demo.cast"
OUT_DIR="${HERE}/../../../public/blog"
CAST_PUB="${OUT_DIR}/introducing-act-demo.cast"
GIF_PUB="${OUT_DIR}/introducing-act-demo.gif"
mkdir -p "$OUT_DIR"

if [[ "${1:-}" != "--render-only" ]]; then
    : "${ACT:=npx -y @actcore/act@latest}"
    echo "→ pre-warming component cache"
    ${ACT} info ghcr.io/actpkg/random:latest >/dev/null 2>&1 || true

    echo "→ recording demo.sh → ${CAST_LOCAL}"
    rm -f "$CAST_LOCAL"
    asciinema rec --cols 96 --rows 28 \
        --command "bash ${HERE}/demo.sh" \
        "$CAST_LOCAL"
fi

if [[ ! -s "$CAST_LOCAL" ]]; then
    echo "error: no cast at ${CAST_LOCAL}" >&2
    exit 1
fi

echo "→ publishing cast → ${CAST_PUB}"
cp "$CAST_LOCAL" "$CAST_PUB"

if command -v agg >/dev/null 2>&1; then
    echo "→ rendering GIF via agg → ${GIF_PUB}"
    agg \
        --cols 96 --rows 28 \
        --theme monokai \
        --font-size 16 \
        --speed 1.3 \
        "$CAST_LOCAL" "$GIF_PUB"
    echo "→ wrote $(wc -c < "$GIF_PUB" | awk '{printf "%.1f KB", $1/1024}') of GIF"
else
    cat <<EOF >&2
warning: \`agg\` not found — skipping GIF.
    Install for dev.to / RSS fallback:
        cargo install --git https://github.com/asciinema/agg
        # or grab a prebuilt binary release and put it on PATH
    Then re-run:  ./render.sh --render-only
EOF
fi

echo "→ cast: $(wc -c < "$CAST_PUB" | awk '{printf "%.1f KB", $1/1024}')"
