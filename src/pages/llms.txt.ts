import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

/**
 * llms.txt (https://llmstxt.org) — a curated, LLM-readable index of the site,
 * the docs equivalent of robots.txt for crawlers. Generated at build time from
 * the content collections so it cannot drift from the pages it lists: a new
 * docs page or blog post shows up without anyone remembering this file.
 *
 * Order for docs mirrors the sidebar in astro.config.mjs; anything not in the
 * list is appended, so a page is never missing, only unordered.
 */
export const GET: APIRoute = async () => {
    const docs = await getCollection("docs");
    const posts = (await getCollection("blog"))
        .filter((post) => !post.data.draft)
        .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
        .slice(0, 10);

    const lines: string[] = [];
    const p = (s = "") => lines.push(s);

    p("# ACT (Agent Component Tools)");
    p();
    p(
        "> A protocol for packaging tools as WebAssembly components: one self-documenting " +
            ".wasm serves AI agents over MCP (stdio or Streamable HTTP), developers over a CLI, " +
            "and browsers via a web runtime. Components are sandboxed by hard capability " +
            "ceilings (filesystem, network, sockets, credentials) that the host intersects " +
            "with the operator's grants — nothing leaves the sandbox unasked. Ready-made " +
            "components ship from the registry at actpkg.dev.",
    );
    p();

    p("## Docs");
    p();
    for (const entry of orderedDocs(docs)) {
        p(`- [${entry.data.title}](https://actcore.dev/${docsSlug(entry)}/)${suffix(entry.data.description)}`);
    }
    p();

    p("## Blog");
    p();
    for (const post of posts) {
        p(
            `- [${post.data.title}](https://actcore.dev/blog/${post.id}/)${suffix(post.data.description)} ` +
                `(${post.data.pubDate.toISOString().slice(0, 10)})`,
        );
    }
    p();

    p("## Related");
    p();
    p(
        "- [actpkg.dev](https://actpkg.dev): the component registry — catalog with capability " +
            "severity ratings, OCI pulls (`act run actpkg.dev/library/<name>`), and per-component " +
            "agent install guides ([llms.txt](https://actpkg.dev/llms.txt))",
    );
    p("- [GitHub](https://github.com/actcore): the actcore organization — spec, CLI, SDKs, components");
    p("- [Wasm-by-example Python demo](https://actcore.dev/python): CPython compiled to WASI running pandas in the browser");
    p();

    return new Response(lines.join("\n"), {
        headers: { "content-type": "text/markdown; charset=utf-8" },
    });
};

/** Docs entries in curated sidebar order, then any newer pages, all stable. */
function orderedDocs(docs: CollectionEntry<"docs">[]): CollectionEntry<"docs">[] {
    const rank = new Map(SIDEBAR_ORDER.map((id, i) => [id, i]));
    return [...docs].sort(
        (a, b) =>
            (rank.get(a.id) ?? SIDEBAR_ORDER.length) - (rank.get(b.id) ?? SIDEBAR_ORDER.length) ||
            a.id.localeCompare(b.id),
    );
}

/** Same order as the `sidebar` in astro.config.mjs, as content-entry ids.
 * The loader consumes a trailing `index`, so the landing docs page is `docs`. */
const SIDEBAR_ORDER = [
    "docs",
    "docs/concepts",
    "docs/install",
    "docs/run-first-component",
    "docs/components",
    "docs/build/rust",
    "docs/build/python",
    "docs/build/manifest",
    "docs/build/skills",
    "docs/build/testing",
    "docs/build/languages",
    "docs/host/transports",
    "docs/host/policy",
    "docs/host/sessions",
    "docs/host/credentials",
    "docs/host/browser",
    "docs/host/config",
    "docs/host/troubleshooting",
    "docs/reference/cli",
    "docs/reference/wit",
    "docs/reference/std-keys",
    "docs/security/csa-framework-mapping",
];

/**
 * Entry id → URL path. Starlight serves `docs` (its landing page) at
 * `/docs/`; every other id maps one-to-one. The trailing-`index` trim keeps
 * this correct whichever way the loader spells the landing page.
 */
function docsSlug(entry: CollectionEntry<"docs">): string {
    return entry.id.replace(/(^|\/)index$/, "");
}

function suffix(description: string | undefined): string {
    return description ? `: ${description}` : "";
}
