#!/usr/bin/env bash
# Reproducible terminal demo for the "MCP servers, sandboxed" intro post.
#
# Record with:
#     asciinema rec --cols 96 --rows 28 --command 'bash demo.sh' demo.cast
#
# Render to SVG (public/blog/introducing-act-demo.svg) with:
#     ./render.sh

set -u

: "${ACT:=npx -y @actcore/act@latest}"

# Silence INFO-level tracing (component resolve / load logs) so the cast
# captures only the command output a reader actually cares about.
export RUST_LOG=warn

cyan=$'\e[36;1m'
bold=$'\e[1m'
reset=$'\e[0m'

prompt() {
    printf '%s$ %s%s%s\n' "${cyan}" "${bold}" "$1" "${reset}"
}

run() {
    prompt "$1"
    sleep 0.5
    eval "$1" || true
    sleep 3
}

clear
run "${ACT} info ghcr.io/actpkg/random:latest --tools"
