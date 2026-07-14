// Unit tests for the concurrency-safe consent prompter queue used by
// PythonPlayground.svelte. Run with Node's built-in test runner:
//   node --test src/lib/consent-queue.test.ts
//
// Regression target: micropip fires TWO concurrent wasi:http `ask`s for the
// SAME host (pypi.org:443) before any decision. The old single-slot prompter
// overwrote its one `resolve`, orphaning the first ask's promise → the
// JSPI-suspended guest hung forever. The queue must never drop a resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConsentQueue } from './consent-queue.ts';

type Ask = { capId: string; op: { key: string } };
type Verdict = { allow: boolean; remember: 'once' | 'session' | 'always' };

const ALLOW: Verdict = { allow: true, remember: 'once' };
const DENY: Verdict = { allow: false, remember: 'once' };

function ask(key: string, capId = 'wasi:http'): Ask {
  return { capId, op: { key } };
}

// (a) Two concurrent asks for the SAME host → one prompt, one decision resolves
//     BOTH promises (the exact micropip → pypi.org:443 hang scenario).
test('two concurrent asks for the SAME host show one prompt; one decision resolves both', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  const got: Verdict[] = [];
  q.enqueue(ask('pypi.org:443'), (v) => got.push(v));
  q.enqueue(ask('pypi.org:443'), (v) => got.push(v));
  assert.equal(q.size, 1, 'coalesced into a single pending entry');
  assert.equal(q.current()?.op.key, 'pypi.org:443');
  const next = q.decide(ALLOW);
  assert.equal(next, null, 'no further prompt');
  assert.equal(q.size, 0);
  assert.deepEqual(got, [ALLOW, ALLOW], 'both waiters resolved — neither orphaned');
});

// (b) Two concurrent asks for DIFFERENT hosts → prompt one at a time; both resolve.
test('two concurrent asks for DIFFERENT hosts prompt one at a time; both resolve', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  let a: Verdict | undefined;
  let b: Verdict | undefined;
  q.enqueue(ask('a.com:443'), (v) => (a = v));
  q.enqueue(ask('b.com:443'), (v) => (b = v));
  assert.equal(q.size, 2);
  assert.equal(q.current()?.op.key, 'a.com:443', 'first host shown first');

  const afterFirst = q.decide(ALLOW);
  assert.equal(afterFirst?.op.key, 'b.com:443', 'second host promoted after first decision');
  assert.deepEqual(a, ALLOW);
  assert.equal(b, undefined, 'second waiter untouched until its own decision');

  const afterSecond = q.decide(DENY);
  assert.equal(afterSecond, null);
  assert.deepEqual(b, DENY);
  assert.equal(q.size, 0);
});

// (c) A pending ask at reset → resolved with the safe default (deny); nothing dangling.
test('drain (session reset) resolves every pending waiter with deny — no dangling promise', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  const got: Verdict[] = [];
  q.enqueue(ask('pypi.org:443'), (v) => got.push(v)); // shown
  q.enqueue(ask('pypi.org:443'), (v) => got.push(v)); // coalesced onto the same entry
  q.enqueue(ask('files.pythonhosted.org:443'), (v) => got.push(v)); // queued behind
  assert.equal(q.size, 2, 'two distinct hosts pending (same-host coalesced)');

  q.drain(DENY);
  assert.equal(q.size, 0);
  assert.equal(q.current(), null);
  assert.deepEqual(got, [DENY, DENY, DENY], 'all three waiters (incl. coalesced) denied');
});

// Coalescing is keyed on capId+host, so different capabilities to the same host
// remain distinct decisions.
test('different capabilities to the same host are NOT coalesced', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  q.enqueue(ask('pypi.org:443', 'wasi:http'), () => {});
  q.enqueue(ask('pypi.org:443', 'wasi:sockets'), () => {});
  assert.equal(q.size, 2);
});

// Models run()/rerun()'s exec-end `finally`: an ask abandoned by a failing call
// is drained, so a leaked entry can't wedge the NEXT call — its ask shows fresh.
test('an abandoned ask drained at exec-end leaves the next call fresh', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  const abandoned: Verdict[] = [];
  // A failing install orphaned this ask (the guest unwound without a decision).
  q.enqueue(ask('pypi.org:443'), (v) => abandoned.push(v));
  assert.equal(q.size, 1);

  // exec-end finally drains it with deny.
  q.drain(DENY);
  assert.deepEqual(abandoned, [DENY], 'abandoned waiter resolved, not orphaned');
  assert.equal(q.current(), null, 'nothing wedged for the next run');

  // The next run's ask shows fresh and resolves normally.
  let next: Verdict | undefined;
  q.enqueue(ask('pypi.org:443'), (v) => (next = v));
  assert.equal(q.current()?.op.key, 'pypi.org:443', 'fresh prompt for the next run');
  q.decide(ALLOW);
  assert.deepEqual(next, ALLOW);
});

// A fresh ask for a host decided earlier queues a new prompt (decisions are per-request).
test('a new ask after a decision creates a fresh prompt', () => {
  const q = new ConsentQueue<Ask, Verdict>();
  let first: Verdict | undefined;
  q.enqueue(ask('pypi.org:443'), (v) => (first = v));
  q.decide(ALLOW);
  assert.deepEqual(first, ALLOW);
  assert.equal(q.current(), null);

  let second: Verdict | undefined;
  q.enqueue(ask('pypi.org:443'), (v) => (second = v));
  assert.equal(q.current()?.op.key, 'pypi.org:443', 'fresh prompt shown');
  q.decide(DENY);
  assert.deepEqual(second, DENY);
});
