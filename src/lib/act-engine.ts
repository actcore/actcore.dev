/**
 * Real engine for the python.astro demo.
 *
 * Wires the ACT browser host (@actcore/web-runtime) + WebLLM into three operations the
 * PythonPlayground.svelte component drives:
 *   1. loadComponent() — fetch + instantiate python-env in a WASI sandbox, open
 *      a session, and inject the sample CSV so `pd.read_csv("sample.csv")` works
 *      with ZERO filesystem capability (pure compute, data injected in-process).
 *   2. runExec()       — call the python-env `exec` tool against that session.
 *   3. loadModel() / askModel() — a small local LLM (WebLLM) that WRITES pandas
 *      and calls the SAME `exec` tool via prompt-based tool dispatch.
 *
 * NOTE on load performance: this uses @actcore/web-runtime's in-tab transpile. The
 * ~100MB component transpile is CPU-heavy on first load (see ACT-150 for the AOT
 * pre-transpile that removes the freeze). Everything here is real: real
 * numpy/pandas, real capability sandbox, real local model.
 */
import { runComponent } from '@actcore/web-runtime';
import type { ConsentAsk, Verdict, AuditRecord } from '@actcore/web-runtime';
import { encode as cborEncode } from 'cbor2';
import { hostFromHostPort, type DenialInfo } from './python-result';
import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';

export type { ConsentAsk, Verdict };
export type { DenialInfo } from './python-result';

// ── config ──────────────────────────────────────────────────────────────────

// The signed python-env component is pulled straight from the actpkg.dev OCI
// registry — the SAME artifact the `claude mcp add` CTA installs — and its bytes
// are verified against the manifest digest client-side (the trust anchor). We
// use the `sci` tag: the scientific build with real numpy/pandas (~113MB). The
// lean `latest`/`0.16.0` tags (~49MB) have no numpy/pandas.
const OCI = {
  host: 'actpkg.dev',
  repo: 'library/python-env',
  tag: 'sci',
  tokenEndpoint: 'https://actpkg.dev/api/v1/token', // actpkg serves permissive CORS
  base: 'https://actpkg.dev',
};
const SHIM_BASE_URL = () => location.origin + '/preview2-shim/';
const WASI_HTTP_SHIM_URL = () => location.origin + '/host/shims/wasi-http.js';
const WASI_SOCKETS_SHIM_URL = () => location.origin + '/host/shims/sockets.js';

// Smallest WebLLM model that reliably follows a "write one line of pandas + emit
// a tool_call" prompt. ~0.9GB one-time download, cached in CacheStorage after.
// (q4f32 over q4f16 to dodge WGSL shader-compile failures on some GPUs.)
const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

export const SAMPLE_CSV = `region,product,sales
EU,Widget,300
EU,Gadget,300
EU,Gizmo,300
EU,Doohickey,300
US,Widget,400
US,Gadget,350
US,Gizmo,400
US,Doohickey,350
US,Thingamajig,350
APAC,Widget,300
APAC,Gadget,320
APAC,Gizmo,320`;

export const DEFAULT_CODE =
  'import pandas as pd\ndf = pd.read_csv("sample.csv")\ndf.groupby("region").sales.sum()';

// ── example scenarios (combobox in the demo panel) ───────────────────────────
//
// `pandas` and `image` are pure local compute. `install` demonstrates a real
// `install`-from-PyPI over wasi:http — re-enabled after fixing ACT-153: jco's
// `_lowerFlatOption` treated an empty trailers option (`undefined`) as `some`,
// crashing wasi:http body completion (patched in @actcore/web-runtime's patches.ts,
// pending bytecodealliance/jco#1722), plus a per-byte body-drain throughput fix
// in host-browser's wasi:http shim (43 KB body: an effective hang → ~70 ms).
//
// `install` is python-env's own tool (see _pip.py), backed by wasi:http — not
// reachable via `import micropip` in exec code (that hits micropip's default
// Pyodide-oriented compat layer, which falls back to raw sockets the sandbox
// correctly denies). `_pip` is already imported by app.py, so it's importable
// here, and app.py's exec harness supports a top-level `await` (same
// PyCF_ALLOW_TOP_LEVEL_AWAIT pattern CPython's own asyncio REPL and Pyodide's
// console use), so `await _pip.install(...)` runs for real, no wrapper needed.

export interface Example {
  id: string;
  label: string;
  code: string;
}

const IMAGE_CODE = [
  'import io',
  'from PIL import Image, ImageDraw',
  'totals = df.groupby("region").sales.sum()',
  'img = Image.new("RGB", (320, 200), "white")',
  'draw = ImageDraw.Draw(img)',
  'max_val = totals.max()',
  'bar_w = 320 // len(totals)',
  'for i, (region, val) in enumerate(totals.items()):',
  '    h = int(val / max_val * 160)',
  '    x0, x1 = i * bar_w + 15, (i + 1) * bar_w - 15',
  '    y0, y1 = 180 - h, 180',
  '    draw.rectangle([x0, y0, x1, y1], fill=(70, 130, 180))',
  '    draw.text((x0, 185), region, fill="black")',
  'buf = io.BytesIO()',
  'img.save(buf, format="PNG")',
  'show(buf.getvalue())',
].join('\n');

export const EXAMPLES: Example[] = [
  {
    id: 'pandas',
    label: 'pandas — groupby sales by region',
    code: DEFAULT_CODE,
  },
  {
    id: 'image',
    label: 'Pillow — render a chart, return a PNG',
    code: IMAGE_CODE,
  },
  {
    id: 'install',
    label: 'install — pull humanize from pypi, then use it',
    code:
      'import _pip\nawait _pip.install("humanize")\nimport humanize\nhumanize.naturalsize(df.sales.sum() * 1000)',
  },
  {
    id: 'escape',
    label: 'escape — reach a non-PyPI host (denied by policy)',
    code:
      'import _pip\n# The sandbox may only reach PyPI. Ask it to fetch from another host —\n# the capability policy denies it before the request leaves your tab.\nawait _pip.install("https://example.com/anything-1.0-py3-none-any.whl")',
  },
];

// ── types ───────────────────────────────────────────────────────────────────

export interface ComponentHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolProvider: any;
  sessionId: string;
  columns: string[];
}

export interface ExecResult {
  text: string;
  ms: number;
  isError: boolean;
  /** Set when the exec call emitted a binary content part (e.g. via `show()`). */
  image?: { mime: string; dataUrl: string };
  /**
   * Set when the runtime's capability policy DENIED a capability during this
   * call (captured from the structured audit sink, not by scraping the Python
   * traceback). Lets the UI render an honest denial banner instead of the
   * misleading micropip "wrong package name" ValueError.
   */
  denial?: DenialInfo;
}

export type ProgressFn = (loaded: number, total: number) => void;

// ── cbor / metadata helpers ─────────────────────────────────────────────────

function cbor(v: unknown): Uint8Array {
  return cborEncode(v, { dcbor: true } as never) as Uint8Array;
}

function sessionMeta(sessionId: string): Array<[string, Uint8Array]> {
  return [['std:session-id', cbor(sessionId)]];
}

// ── capability-denial capture (structured audit sink) ───────────────────────
//
// The runtime hands us a structured `AuditRecord` for every capability decision
// via `runComponent`'s `onAudit`. exec calls are serialized (the UI gates on a
// single in-flight run), so we latch denials seen during the current `callExec`
// and attach them to that call's result — far more reliable than regex-matching
// the traceback, which micropip rewrites into a "wrong package name" ValueError.

let currentCallDenials: DenialInfo[] = [];

/** Map a denial `AuditRecord` to a UI-facing `DenialInfo`, else null. */
function denialFromAudit(r: AuditRecord): DenialInfo | null {
  if (r.decision !== 'deny' && r.decision !== 'ask-deny') return null;
  return { capId: r.capId, host: hostFromHostPort(r.op?.key), decision: r.decision };
}

// ── component load + session + CSV injection ────────────────────────────────

/**
 * Stream the blob in a single request with `Accept: application/wasm`.
 *
 * actpkg.dev sits behind Cloudflare, which force-enables compression for
 * `Accept: application/wasm` — so the wire transfer is br/gzip-compressed
 * (well under the ~96MB point at which a raw uncompressed single stream gets
 * reset), and the browser transparently decompresses. Progress is tracked
 * against the known (decompressed) layer size.
 */
async function downloadBlobStream(
  url: string,
  size: number,
  auth: Record<string, string>,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { ...auth, Accept: 'application/wasm' } });
  if (!r.ok) throw new Error(`blob: HTTP ${r.status}`);
  if (!r.body) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, size);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Pull the signed component from actpkg.dev via the OCI distribution spec and
 * verify its bytes against the manifest digest (the trust anchor: neither a
 * malicious proxy nor registry can serve tampered bytes undetected).
 */
async function pullFromOci(onProgress?: ProgressFn): Promise<Uint8Array> {
  // 1. anonymous pull token
  const tokenUrl = `${OCI.tokenEndpoint}?service=${OCI.host}&scope=repository:${OCI.repo}:pull`;
  const tokenResp = await fetch(tokenUrl);
  if (!tokenResp.ok) throw new Error(`oci token: HTTP ${tokenResp.status}`);
  const tokenJson = (await tokenResp.json()) as { token?: string; access_token?: string };
  const token = tokenJson.token ?? tokenJson.access_token;
  if (!token) throw new Error('oci token endpoint returned no token');
  const auth = { Authorization: `Bearer ${token}` };

  // 2. manifest
  const manifestResp = await fetch(`${OCI.base}/v2/${OCI.repo}/manifests/${OCI.tag}`, {
    headers: {
      ...auth,
      Accept:
        'application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json',
    },
  });
  if (!manifestResp.ok) throw new Error(`oci manifest: HTTP ${manifestResp.status}`);
  const manifest = (await manifestResp.json()) as {
    layers?: Array<{ mediaType: string; digest: string; size: number }>;
  };
  const layer =
    manifest.layers?.find((l) => l.mediaType === 'application/wasm') ?? manifest.layers?.[0];
  if (!layer) throw new Error('oci manifest has no wasm layer');

  // 3. blob — single compressed stream (Accept: application/wasm → Cloudflare
  //    compresses; browser decompresses), verified against the manifest digest.
  const bytes = await downloadBlobStream(
    `${OCI.base}/v2/${OCI.repo}/blobs/${layer.digest}`,
    layer.size,
    auth,
    onProgress,
  );

  // 4. verify digest — the trust anchor
  const expected = layer.digest.replace(/^sha256:/, '').toLowerCase();
  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(`oci digest mismatch — expected sha256:${expected}, got sha256:${actual}`);
  }
  return bytes;
}

/**
 * The setup code run once per session: install a read_csv shim so
 * `pd.read_csv("sample.csv")` resolves to the injected CSV text with NO
 * filesystem capability, and preload a DataFrame `df` for the model to use.
 */
function setupCode(csv: string): string {
  const literal = JSON.stringify(csv);
  return [
    'import pandas as _pd, io as _io',
    `_SAMPLE_CSV = ${literal}`,
    'if not getattr(_pd, "_actcore_patched", False):',
    '    __orig_read_csv = _pd.read_csv',
    '    def __read_csv(path, *a, **k):',
    '        if isinstance(path, str) and path == "sample.csv":',
    '            return __orig_read_csv(_io.StringIO(_SAMPLE_CSV), *a, **k)',
    '        return __orig_read_csv(path, *a, **k)',
    '    _pd.read_csv = __read_csv',
    '    _pd._actcore_patched = True',
    'df = _pd.read_csv("sample.csv")',
    'list(df.columns)',
  ].join('\n');
}

export async function loadComponent(
  onProgress?: ProgressFn,
  requestConsent?: (ask: ConsentAsk) => Promise<Verdict>,
): Promise<ComponentHandle> {
  const bytes = await pullFromOci(onProgress);
  // in-tab transpile + instantiate in a WASI capability sandbox
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inst = (await runComponent(bytes, {
    name: 'python-env',
    shimBase: SHIM_BASE_URL(),
    wasiHttpShimUrl: WASI_HTTP_SHIM_URL(),
    wasiSocketsShimUrl: WASI_SOCKETS_SHIM_URL(),
    requestConsent,
    onAudit: (r) => {
      const d = denialFromAudit(r);
      if (d) currentCallDenials.push(d);
    },
  })) as any;
  const toolProvider = inst.toolProvider;
  const sessionProvider = inst.sessionProvider;
  if (!sessionProvider) throw new Error('python-env did not expose a session-provider');

  const sess = await sessionProvider.openSession([], []);
  const sessionId: string = sess.id;

  // Inject the sample CSV + preload df; capture the column list.
  const setup = await callExec(toolProvider, sessionId, setupCode(SAMPLE_CSV));
  let columns: string[] = ['region', 'product', 'sales'];
  try {
    const m = setup.text.match(/\[([^\]]*)\]/);
    if (m) columns = m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);
  } catch {
    /* keep default columns */
  }
  return { toolProvider, sessionId, columns };
}

/** Re-inject a user-provided CSV into the same session (still 0 fs capability). */
export async function injectCsv(h: ComponentHandle, csv: string): Promise<string[]> {
  const setup = await callExec(h.toolProvider, h.sessionId, setupCode(csv));
  const m = setup.text.match(/\[([^\]]*)\]/);
  const cols = m ? m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean) : h.columns;
  h.columns = cols;
  return cols;
}

// ── exec tool call ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callExec(toolProvider: any, sessionId: string, code: string): Promise<ExecResult> {
  currentCallDenials = []; // latch denials seen during THIS call only
  const t0 = performance.now();
  const result = await toolProvider.callTool('exec', cbor({ code }), sessionMeta(sessionId));
  const ms = Math.round(performance.now() - t0);
  const events = result.tag === 'immediate' ? result.val : await drainStream(result.val);
  const parts: string[] = [];
  let isError = false;
  let image: ExecResult['image'];
  for (const ev of events) {
    if (ev.tag === 'content') {
      const raw = ev.val.mimeType as unknown;
      const mime =
        typeof raw === 'string'
          ? raw
          : raw && (raw as { tag?: string }).tag === 'some'
            ? String((raw as { val: string }).val)
            : 'text/plain';
      const data =
        ev.val.data instanceof Uint8Array ? ev.val.data : new Uint8Array(ev.val.data as number[]);
      if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/plain') {
        parts.push(new TextDecoder().decode(data));
      } else if (mime.startsWith('image/')) {
        let binary = '';
        for (const byte of data) binary += String.fromCharCode(byte);
        image = { mime, dataUrl: `data:${mime};base64,${btoa(binary)}` };
      } else {
        parts.push(`(${mime}, ${data.length} bytes)`);
      }
    } else {
      isError = true;
      const msg =
        ev.val.message?.tag === 'plain'
          ? ev.val.message.val
          : (ev.val.message?.val?.[0]?.[1] ?? ev.val.kind ?? 'error');
      parts.push(`${ev.val.kind ?? 'error'}: ${msg}`);
    }
  }
  // A capability denial during this call wins over whatever the guest managed
  // to write into `text` (micropip masks it as a "wrong package name" error).
  const denial = currentCallDenials.length
    ? currentCallDenials[currentCallDenials.length - 1]
    : undefined;
  return { text: parts.join('\n').trim(), ms, isError, image, denial };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drainStream(stream: ReadableStream<any>): Promise<any[]> {
  const out: unknown[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out as never[];
}

export async function runExec(h: ComponentHandle, code: string): Promise<ExecResult> {
  return callExec(h.toolProvider, h.sessionId, code);
}

// ── local model (WebLLM) + prompt-based tool dispatch ───────────────────────

let engine: MLCEngineInterface | null = null;
let engineLoading: Promise<MLCEngineInterface> | null = null;

export type ModelProgressFn = (report: { text: string; progress: number }) => void;

export async function loadModel(onProgress?: ModelProgressFn): Promise<void> {
  if (engine) return;
  if (!engineLoading) {
    engineLoading = CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (r: InitProgressReport) =>
        onProgress?.({ text: r.text, progress: r.progress }),
    }).then((e) => {
      engine = e;
      return e;
    });
  }
  await engineLoading;
}

const TOOL_CALL_RE = /<tool_call\s+name="exec"\s*>\s*([\s\S]*?)\s*<\/tool_call>/;

function systemPrompt(columns: string[]): string {
  return [
    'You run locally in the user\'s browser tab. A pandas DataFrame named `df` is',
    `already loaded with columns: ${columns.join(', ')}.`,
    'To answer a question about the data, call the `exec` tool with a single line',
    'of pandas that evaluates to the answer. Emit EXACTLY one block and nothing',
    'else:',
    '',
    '  <tool_call name="exec">{"code": "df.groupby(\\"region\\").sales.sum()"}</tool_call>',
    '',
    'Rules: valid JSON; reference `df`; one expression; no prose before the block.',
  ].join('\n');
}

export interface AskResult {
  code: string;
  result: string;
  isError: boolean;
  denial?: DenialInfo;
}

/** The model writes pandas and calls the same exec tool. Returns code + result. */
export async function askModel(h: ComponentHandle, question: string): Promise<AskResult> {
  if (!engine) throw new Error('model not loaded');
  const messages = [
    { role: 'system' as const, content: systemPrompt(h.columns) },
    { role: 'user' as const, content: question },
  ];
  const resp = await engine.chat.completions.create({
    messages,
    temperature: 0.1,
    stream: false,
  });
  const raw = resp.choices[0]?.message.content ?? '';
  const m = raw.match(TOOL_CALL_RE);
  let code = '';
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      code = String(parsed.code ?? '').trim();
    } catch {
      code = '';
    }
  }
  if (!code) {
    // Fallback: if the model emitted a bare pandas line, use it.
    const line = raw.split('\n').map((l) => l.trim()).find((l) => l.startsWith('df'));
    code = line ?? '';
  }
  if (!code) return { code: raw.trim(), result: '(model did not emit a tool call)', isError: true };
  const exec = await runExec(h, code);
  return { code, result: exec.text, isError: exec.isError, denial: exec.denial };
}
