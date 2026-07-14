/**
 * Pure classify/clean logic for the python-env exec demo (PythonPlayground.svelte).
 *
 * python-env's `exec` tool never raises a tool-error event — it embeds Python
 * tracebacks as `[error]\n…` text in the result. So the playground has to
 * classify a raw `{ text, isError }` into what to actually show:
 *
 *   - a POLICY DENIAL  → a clean, honest banner naming the capability + host,
 *     instead of the misleading micropip traceback (micropip rewrites a denied
 *     fetch into `ValueError: … make sure you entered a correct package name`).
 *   - a GENUINE ERROR  → the real traceback, unchanged except that the spurious
 *     top-level-`await` `SyntaxError: invalid syntax` artifact is stripped.
 *   - a SUCCESS        → the text as-is.
 *
 * A denial is detected from the STRUCTURED runtime audit signal when available
 * (an `AuditRecord{ capId:'wasi:http', decision:'deny'|'ask-deny', op.key }`
 * captured via `runComponent`'s `onAudit` sink); we fall back to the
 * `"… denied by policy: host:port"` text marker only when no structured signal
 * reached us. The structured path is preferred because micropip usually hides
 * the marker before it ever lands in the traceback.
 *
 * This module is intentionally free of any runtime imports so it can be unit
 * tested directly with `node --test` (see python-result.test.ts).
 */

/** A structured policy-denial signal (derived from the runtime audit sink). */
export interface DenialInfo {
  /** Capability id, e.g. `"wasi:http"`. */
  capId: string;
  /** Host without port, e.g. `"example.com"`. Absent when unknown. */
  host?: string;
  /**
   * Which kind of denial this was:
   *   - `'deny'`     — the host is outside the component's declared ceiling /
   *     the operator allowlist ("not in policy").
   *   - `'ask-deny'` — the policy WOULD allow it but asked, and the USER
   *     declined the consent prompt ("you declined").
   * Absent (text-marker fallback) ⇒ treated as `'deny'` (generic wording).
   */
  decision?: 'deny' | 'ask-deny';
}

/** What PythonPlayground should render for a completed exec run. */
export type DisplayResult =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'denied'; capId: string; host?: string; title: string; detail: string };

/** Human summary of the hosts this demo's wasi:http policy permits. */
const DEFAULT_POLICY_SUMMARY = 'pypi only';

/**
 * The spurious top-level-`await` detection artifact. python-env's exec harness
 * first `compile(code, "<act>", "eval")`s the code; multi-statement code throws
 * `SyntaxError: invalid syntax`, which is caught and re-run wrapped. When the
 * re-run then fails, Python chains the real exception onto that SyntaxError via
 * "During handling of the above exception, another exception occurred:". Both
 * are noise. We only strip the SyntaxError block when it is bridged into a
 * following exception — a genuine, final `SyntaxError: invalid syntax` (no
 * bridge) is left untouched.
 */
const TLA_ARTIFACT_RE =
  /Traceback \(most recent call last\):\n[\s\S]*?\nSyntaxError: invalid syntax\n+During handling of the above exception, another exception occurred:\n+/;

/** The raw denial marker the wasi:http shim throws: `… denied by policy: host:port`. */
const DENIED_MARKER_RE = /([\w:]+) denied by policy:\s*([^\s]+)/;

/**
 * Extract a human-readable message from any THROWN value.
 *
 * The engine's calls can reject with three shapes, checked in order:
 *   1. a WIT-safe error object `{ tag, val }` with a string `val` (e.g. the
 *      bounded exec timeout: `{ tag:'internal-error', val:'exec timed out …' }`)
 *      — these have no `.message`, so a naive `(e as Error).message` yields
 *      `undefined` and `String(e)` yields `"[object Object]"`;
 *   2. a JS `Error` (use `.message`);
 *   3. anything else (`String(e)`).
 */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'val' in e) {
    const val = (e as { val: unknown }).val;
    if (typeof val === 'string') return val;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Extract the host from a `"host:port"` key (tolerates IPv6 + a missing port). */
export function hostFromHostPort(key: string | undefined | null): string | undefined {
  if (!key) return undefined;
  // IPv6 literal host is bracketed, e.g. "[::1]:8080" → host "[::1]".
  if (key.startsWith('[')) {
    const close = key.indexOf(']');
    if (close !== -1) return key.slice(0, close + 1);
  }
  const i = key.lastIndexOf(':');
  const host = i > 0 ? key.slice(0, i) : key;
  return host || undefined;
}

/** Remove the top-level-`await` SyntaxError artifact from a traceback string. */
export function stripTopLevelAwaitArtifact(text: string): string {
  return text.replace(TLA_ARTIFACT_RE, '');
}

/** Best-effort denial detection from the raw error text (fallback path). */
function denialFromText(text: string): DenialInfo | null {
  const m = text.match(DENIED_MARKER_RE);
  if (!m) return null;
  return { capId: m[1], host: hostFromHostPort(m[2]) };
}

function looksLikeError(text: string): boolean {
  return text.includes('[error]') || text.includes('Traceback (most recent call last):');
}

// A host OUTSIDE the policy/ceiling: "not in policy".
function policyDenyTitle(capId: string, host: string | undefined, summary: string): string {
  const where = host ? `host "${host}"` : 'host';
  return `denied — ${capId} · ${where} not in policy (${summary})`;
}
const POLICY_DENY_DETAIL =
  'The sandbox only reaches hosts its policy allows — this one was not, so the request never left your tab.';

// A host the policy WOULD allow, but the user declined the consent prompt.
function askDenyTitle(capId: string, host: string | undefined): string {
  const to = host ? ` to "${host}"` : '';
  return `denied — you declined ${capId}${to}`;
}
const ASK_DENY_DETAIL =
  'The sandbox asked before connecting; you denied it, so nothing left your tab.';

/**
 * Classify a raw exec result into what to display.
 *
 * @param raw     the `{ text, isError }` returned by the engine's exec call.
 * @param denial  structured denial captured from the audit sink, if any.
 * @param opts.policySummary human summary of the allowed hosts (default "pypi only").
 */
export function classifyResult(
  raw: { text: string; isError: boolean },
  denial?: DenialInfo | null,
  opts?: { policySummary?: string },
): DisplayResult {
  const summary = opts?.policySummary ?? DEFAULT_POLICY_SUMMARY;

  // Prefer the structured signal; fall back to the text marker only if absent.
  const d = denial ?? denialFromText(raw.text);
  if (d) {
    // A user decline ('ask-deny') gets honest "you declined" wording — the host
    // IS permitted by policy, so "not in policy" would be self-contradictory.
    const userDeclined = d.decision === 'ask-deny';
    return {
      kind: 'denied',
      capId: d.capId,
      host: d.host,
      title: userDeclined
        ? askDenyTitle(d.capId, d.host)
        : policyDenyTitle(d.capId, d.host, summary),
      detail: userDeclined ? ASK_DENY_DETAIL : POLICY_DENY_DETAIL,
    };
  }

  // Not a denial: strip the top-level-await artifact from whatever we show.
  const cleaned = stripTopLevelAwaitArtifact(raw.text);
  if (raw.isError || looksLikeError(cleaned)) {
    return { kind: 'error', text: cleaned };
  }
  return { kind: 'ok', text: cleaned };
}
