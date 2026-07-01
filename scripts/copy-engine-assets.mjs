// Copies the demo engine's browser shims into public/ so the python.astro page
// can serve them same-origin:
//   • preview2-shim/  — @bytecodealliance/preview2-shim browser build
//                       (wasi:cli/clocks/filesystem/io/random)
//   • host/shims/     — @actcore/host's own wasi:http + wasi:sockets shims
//                       (the sockets shim carries the resource classes the
//                       preview2-shim browser build omits — now upstream in
//                       host-browser, so nothing is patched here)
//
// The python-env.wasm itself is NOT copied: the page pulls the signed component
// straight from the actpkg.dev OCI registry and verifies the digest client-side
// (see src/lib/act-engine.ts).
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const R = (...p) => resolve(root, ...p);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(R('public'), { recursive: true });

  const p2 = R('node_modules/@bytecodealliance/preview2-shim/dist/browser');
  if (await exists(p2)) {
    await cp(p2, R('public/preview2-shim'), { recursive: true });
    console.log('copied preview2-shim');
  } else {
    console.warn('WARN: preview2-shim browser build not found; run npm install first');
  }

  const hostShims = R('node_modules/@actcore/host/dist/shims');
  if (await exists(hostShims)) {
    await mkdir(R('public/host'), { recursive: true });
    await cp(hostShims, R('public/host/shims'), { recursive: true });
    console.log('copied host shims (wasi-http + sockets)');
  } else {
    console.warn('WARN: @actcore/host dist/shims not found; is host-browser built?');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
