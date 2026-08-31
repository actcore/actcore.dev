// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { rehypeAsciinema } from './src/lib/rehype-asciinema.ts';
import { fileURLToPath } from 'node:url';

import sitemap from '@astrojs/sitemap';

// @actcore/web-runtime imports jco's in-browser transpiler from a vendored bindgen at
// this subpath, which jco-transpile does not list in its package `exports`, so
// Vite/Rollup's resolver can't reach it — alias to the concrete file.
//
// TEMPORARY: point at a locally-built bindgen instead of node_modules. The
// published jco-transpile ships the *debug* js-component-bindgen (wasm-opt'd)
// instead of the release build — a debug/release obj/ filename collision in
// jco's build:release clobbers the release component with the 132 MiB debug one.
// Result: 8.9 MiB / ~56s vs this 3.1 MiB / ~7.5s. Revert to the node_modules
// path once upstream fixes the collision and republishes. See
// vendor/jco-bindgen-lto/README.md for the verified root cause + rebuild recipe.
const jcoBindgen = fileURLToPath(
    new URL(
        './vendor/jco-bindgen-lto/js-component-bindgen-component.js',
        import.meta.url,
    ),
);

export default defineConfig({
    site: 'https://actcore.dev',
    markdown: {
        rehypePlugins: [rehypeAsciinema],
    },
    vite: {
        plugins: [tailwindcss()],
        resolve: {
            alias: {
                '@bytecodealliance/jco-transpile/vendor/js-component-bindgen-component.js':
                    jcoBindgen,
            },
        },
        // @actcore/web-runtime runs jco's transpiler in a module Web Worker that
        // dynamic-imports the bindgen core wasm — needs ES worker format.
        worker: { format: 'es' },
        // The vendored bindgen is a ~9MB minified module; sourcemap generation
        // over it overflows rolldown's transform. We don't ship browser
        // sourcemaps for the demo bundle anyway.
        build: { sourcemap: false },
        esbuild: { sourcemap: false },
        optimizeDeps: {
            exclude: ['@actcore/web-runtime', '@bytecodealliance/jco-transpile'],
        },
        // @actcore/web-runtime is a linked dep (file:../host-browser) outside root; its
        // worker entry is fetched at runtime in dev.
        server: { fs: { allow: ['..'] } },
    },
    integrations: [svelte(), mermaid({
        theme: 'dark',
        autoTheme: true,
		}), starlight({
        title: 'ACT',
        description: 'Agent Component Tools — universal tool components built on WebAssembly',
        social: [
            { icon: 'github', label: 'GitHub', href: 'https://github.com/actcore' },
            { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/actcore' },
            { icon: 'rss', label: 'Blog RSS', href: '/blog/rss.xml' },
        ],
        sidebar: [
            {
                label: 'Start here',
                items: [
                    { slug: 'docs', label: 'What is ACT' },
                    { slug: 'docs/concepts' },
                    { slug: 'docs/install' },
                    { slug: 'docs/run-first-component' },
                    { slug: 'docs/components' },
                ],
            },
            {
                label: 'Build a component',
                items: [
                    { slug: 'docs/build/rust' },
                    { slug: 'docs/build/python' },
                    { slug: 'docs/build/manifest' },
                    { slug: 'docs/build/skills' },
                    { slug: 'docs/build/testing' },
                    { slug: 'docs/build/languages' },
                ],
            },
            {
                label: 'Host / run',
                items: [
                    { slug: 'docs/host/transports' },
                    { slug: 'docs/host/policy' },
                    { slug: 'docs/host/sessions' },
                    { slug: 'docs/host/credentials' },
                    { slug: 'docs/host/browser' },
                    { slug: 'docs/host/config' },
                    { slug: 'docs/host/troubleshooting' },
                ],
            },
            {
                label: 'Reference',
                items: [
                    { slug: 'docs/reference/cli' },
                    { slug: 'docs/reference/wit' },
                    { slug: 'docs/reference/std-keys' },
                ],
            },
            {
                label: 'Security',
                items: [
                    { slug: 'docs/security/csa-framework-mapping' },
                ],
            },
        ],
        customCss: ['./src/styles/custom.css'],
        head: [
            {
                tag: 'link',
                attrs: {
                    rel: 'preconnect',
                    href: 'https://fonts.googleapis.com',
                },
            },
            {
                tag: 'link',
                attrs: {
                    rel: 'preconnect',
                    href: 'https://fonts.gstatic.com',
                    crossorigin: true,
                },
            },
            {
                tag: 'link',
                attrs: {
                    rel: 'stylesheet',
                    href: 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&family=Instrument+Sans:wght@400;500;600;700&display=swap',
                },
            },
        ],
		}), sitemap()],
});