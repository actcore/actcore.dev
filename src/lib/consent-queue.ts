/**
 * Concurrency-safe consent prompter queue for @actcore/web-runtime's `ask`
 * policy mode (used by PythonPlayground.svelte).
 *
 * WHY THIS EXISTS: a naive single-slot prompter (one `consentResolve` variable)
 * loses a promise the moment two `ask`s overlap — the second `requestConsent`
 * overwrites the first's `resolve`, so the first (a JSPI-suspended guest task)
 * hangs forever. micropip does exactly this: it fires two concurrent wasi:http
 * asks for the SAME host (pypi.org:443) before the user answers either. The
 * reference prompter integrators copy MUST be concurrency-safe on its own —
 * web-runtime's coalescing does not reliably prevent overlapping calls in the
 * browser, so this queue never drops a resolve.
 *
 * Behaviour:
 *   - FIFO queue of pending consent entries; the head is the ask to display.
 *   - Concurrent asks with the same `capId + op.key` (host:port) COALESCE onto
 *     one entry, so a single user decision resolves every same-host waiter.
 *   - `decide()` resolves all waiters on the head, then promotes the next entry.
 *   - `drain()` resolves everything still pending with a safe default (deny),
 *     leaving no dangling promise (called on session reset / teardown).
 *
 * Pure and framework-free so it is unit-testable without a browser or Svelte;
 * the component keeps its reactive `consentAsk` in sync with `current()`.
 */

/** Minimal shape the queue needs from a consent request. */
export interface QueueableAsk {
  capId: string;
  op: { key: string };
}

interface Entry<Ask, Verdict> {
  key: string;
  ask: Ask;
  resolves: Array<(v: Verdict) => void>;
}

export class ConsentQueue<Ask extends QueueableAsk, Verdict> {
  #queue: Entry<Ask, Verdict>[] = [];

  /**
   * Register a consent request. If an entry for the same `capId + host:port` is
   * already pending (shown or queued), the resolve is attached to it (coalesced)
   * instead of creating a second prompt.
   */
  enqueue(ask: Ask, resolve: (v: Verdict) => void): void {
    const key = keyOf(ask);
    const existing = this.#queue.find((e) => e.key === key);
    if (existing) {
      existing.resolves.push(resolve);
      return;
    }
    this.#queue.push({ key, ask, resolves: [resolve] });
  }

  /** The ask that should currently be shown (queue head), or null if idle. */
  current(): Ask | null {
    return this.#queue.length > 0 ? this.#queue[0].ask : null;
  }

  /**
   * Resolve every waiter on the current (head) entry with `verdict`, drop it,
   * and return the next ask to show (or null when the queue is empty).
   */
  decide(verdict: Verdict): Ask | null {
    const head = this.#queue.shift();
    if (head) for (const r of head.resolves) r(verdict);
    return this.current();
  }

  /**
   * Resolve ALL still-pending waiters (across every entry) with `verdict` and
   * clear the queue. Use with a deny verdict on reset/teardown so no promise is
   * left dangling.
   */
  drain(verdict: Verdict): void {
    const pending = this.#queue;
    this.#queue = [];
    for (const e of pending) for (const r of e.resolves) r(verdict);
  }

  /** Number of distinct pending prompts (same-host asks count once). */
  get size(): number {
    return this.#queue.length;
  }
}

/** Coalescing key: same capability + same host:port ⇒ one decision. */
function keyOf(ask: QueueableAsk): string {
  return `${ask.capId}|${ask.op.key}`;
}
