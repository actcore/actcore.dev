// Unit tests for the pure classify/clean logic used by PythonPlayground.svelte.
// Run with Node's built-in test runner (Node >= 23 strips TS types natively):
//   node --test src/lib/python-result.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyResult,
  stripTopLevelAwaitArtifact,
  hostFromHostPort,
  errorMessage,
} from './python-result.ts';

// The exact traceback python-env's exec harness produces when a top-level-`await`
// install is DENIED network access: the eval-mode compile throws
// `SyntaxError: invalid syntax`, the harness re-runs wrapped, and micropip's
// failure is chained onto that SyntaxError via "During handling …". Both the
// SyntaxError block and the bridge line are noise that must never be shown.
const TLA_ARTIFACT_TRACEBACK = [
  '[error]',
  'Traceback (most recent call last):',
  '  File "/2/app.py", line 188, in _run',
  '    result_value = eval(',
  '                   ^^^^^',
  '  File "<act>", line 1',
  '    import _pip',
  '    ^^^^^^',
  'SyntaxError: invalid syntax',
  '',
  'During handling of the above exception, another exception occurred:',
  '',
  'Traceback (most recent call last):',
  '  File "/2/app.py", line 202, in _run',
  '    await pending',
  '  File "/lib/python3.13/site-packages/micropip/_commands/install.py", line 142, in install',
  '    raise ValueError(',
  "ValueError: Can't fetch metadata for 'humanize'. Please make sure you have entered a",
  'correct package name and correctly specified index_urls (if changing the default).',
].join('\n');

const ORDINARY_EXCEPTION = [
  '[error]',
  'Traceback (most recent call last):',
  '  File "<act>", line 1, in <module>',
  "NameError: name 'foo' is not defined",
].join('\n');

const GENUINE_SYNTAX_ERROR = [
  '[error]',
  'Traceback (most recent call last):',
  '  File "<act>", line 1',
  '    def foo(:',
  '           ^',
  'SyntaxError: invalid syntax',
].join('\n');

// (a) A POLICY denial — host outside the declared ceiling/allowlist
//     (decision 'deny') → "not in policy" banner, NOT the micropip traceback.
test('policy deny (out-of-policy host) renders a "not in policy" banner', () => {
  const d = classifyResult(
    { text: TLA_ARTIFACT_TRACEBACK, isError: false },
    { capId: 'wasi:http', host: 'example.com', decision: 'deny' },
  );
  assert.equal(d.kind, 'denied');
  assert.equal(d.kind === 'denied' && d.host, 'example.com');
  assert.equal(d.kind === 'denied' && d.capId, 'wasi:http');
  assert.equal(
    d.kind === 'denied' && d.title,
    'denied — wasi:http · host "example.com" not in policy (pypi only)',
  );
  assert.equal(
    d.kind === 'denied' && d.detail,
    'The sandbox only reaches hosts its policy allows — this one was not, so the request never left your tab.',
  );
  // The misleading micropip traceback must not leak into the denial view.
  assert.ok(d.kind === 'denied' && !d.title.includes('ValueError'));
  assert.ok(d.kind === 'denied' && !d.detail.includes('Traceback'));
});

// A USER decline of a consent prompt for a host the policy WOULD allow
//     (decision 'ask-deny') → "you declined" wording, never "not in policy"
//     (pypi.org IS the allowance — the user just said no).
test('ask-deny (user declined consent) renders "you declined" wording', () => {
  const d = classifyResult(
    { text: TLA_ARTIFACT_TRACEBACK, isError: false },
    { capId: 'wasi:http', host: 'pypi.org', decision: 'ask-deny' },
  );
  assert.equal(d.kind, 'denied');
  assert.equal(d.kind === 'denied' && d.host, 'pypi.org');
  assert.equal(
    d.kind === 'denied' && d.title,
    'denied — you declined wasi:http to "pypi.org"',
  );
  assert.equal(
    d.kind === 'denied' && d.detail,
    'The sandbox asked before connecting; you denied it, so nothing left your tab.',
  );
  // Must NOT use the contradictory "not in policy" wording here.
  assert.ok(d.kind === 'denied' && !d.title.includes('not in policy'));
});

// A policy deny with no known host still produces an honest banner (no empty quotes).
test('policy deny with unknown host omits the host quotes', () => {
  const d = classifyResult({ text: '', isError: false }, { capId: 'wasi:http', decision: 'deny' });
  assert.equal(d.kind, 'denied');
  assert.equal(
    d.kind === 'denied' && d.title,
    'denied — wasi:http · host not in policy (pypi only)',
  );
});

// An ask-deny with no known host still reads honestly ("you declined", no quotes).
test('ask-deny with unknown host omits the host quotes', () => {
  const d = classifyResult({ text: '', isError: false }, { capId: 'wasi:http', decision: 'ask-deny' });
  assert.equal(d.kind, 'denied');
  assert.equal(d.kind === 'denied' && d.title, 'denied — you declined wasi:http');
});

// A denial detected only from the error text marker (no structured signal) has
// no decision to go on → defaults to the generic "not in policy" wording.
test('denial detected from the "denied by policy" text marker defaults to policy wording', () => {
  const text = 'error: wasi:http denied by policy: pypi.org:443';
  const d = classifyResult({ text, isError: true });
  assert.equal(d.kind, 'denied');
  assert.equal(d.kind === 'denied' && d.host, 'pypi.org');
  assert.equal(d.kind === 'denied' && d.capId, 'wasi:http');
  assert.ok(d.kind === 'denied' && d.title.includes('not in policy'));
});

// (b) A traceback carrying the top-level-await SyntaxError artifact →
//     artifact removed, the real traceback kept intact.
test('top-level-await SyntaxError artifact is stripped, real traceback kept', () => {
  const d = classifyResult({ text: TLA_ARTIFACT_TRACEBACK, isError: false });
  assert.equal(d.kind, 'error');
  const shown = d.kind === 'error' ? d.text : '';
  assert.ok(!shown.includes('SyntaxError: invalid syntax'), 'SyntaxError artifact removed');
  assert.ok(
    !shown.includes('During handling of the above exception'),
    'exception bridge removed',
  );
  assert.ok(!shown.includes('import _pip'), 'artifact code frame removed');
  // Everything after the artifact survives untouched.
  assert.ok(shown.includes("ValueError: Can't fetch metadata for 'humanize'"));
  assert.ok(shown.includes('await pending'));
  assert.ok(shown.startsWith('[error]'));
});

// stripTopLevelAwaitArtifact is idempotent and leaves clean text alone.
test('stripTopLevelAwaitArtifact leaves artifact-free text unchanged', () => {
  assert.equal(stripTopLevelAwaitArtifact(ORDINARY_EXCEPTION), ORDINARY_EXCEPTION);
  assert.equal(stripTopLevelAwaitArtifact('hello world'), 'hello world');
});

// (c) An ordinary user exception is shown normally, in full.
test('ordinary exception is shown normally with a full traceback', () => {
  const d = classifyResult({ text: ORDINARY_EXCEPTION, isError: false });
  assert.equal(d.kind, 'error');
  assert.equal(d.kind === 'error' && d.text, ORDINARY_EXCEPTION);
});

// A genuine (final) SyntaxError is NOT stripped — only the chained artifact is.
test('a genuine final SyntaxError is preserved', () => {
  const d = classifyResult({ text: GENUINE_SYNTAX_ERROR, isError: false });
  assert.equal(d.kind, 'error');
  assert.ok(d.kind === 'error' && d.text.includes('SyntaxError: invalid syntax'));
});

// A normal successful result passes through as-is.
test('a successful result passes through as kind=ok', () => {
  const text = 'region\nAPAC     940\nEU      1200\nUS      1850\nName: sales, dtype: int64';
  const d = classifyResult({ text, isError: false });
  assert.equal(d.kind, 'ok');
  assert.equal(d.kind === 'ok' && d.text, text);
});

// errorMessage: pull a readable string out of any THROWN value. The bounded
// exec timeout rejects with a WIT-safe error OBJECT `{ tag, val }` (no
// `.message`), which used to render as "[object Object]".
test('errorMessage reads a WIT-safe error object\'s string val', () => {
  const witErr = { tag: 'internal-error', val: 'exec timed out after 30s — reset and try again' };
  assert.equal(errorMessage(witErr), 'exec timed out after 30s — reset and try again');
});

test('errorMessage reads a JS Error message', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
});

test('errorMessage returns a plain string as-is', () => {
  assert.equal(errorMessage('just a string'), 'just a string');
});

test('errorMessage falls back to String() for anything else', () => {
  // Object without a string `val` → not a WIT error → String().
  assert.equal(errorMessage({ tag: 'x', val: 42 }), '[object Object]');
  assert.equal(errorMessage(null), 'null');
  assert.equal(errorMessage(undefined), 'undefined');
});

// hostFromHostPort helper: strips the :port, tolerates IPv6 + missing port.
test('hostFromHostPort strips the port and handles edge cases', () => {
  assert.equal(hostFromHostPort('example.com:443'), 'example.com');
  assert.equal(hostFromHostPort('pypi.org:443'), 'pypi.org');
  assert.equal(hostFromHostPort('example.com'), 'example.com');
  assert.equal(hostFromHostPort('[::1]:8080'), '[::1]');
  assert.equal(hostFromHostPort(''), undefined);
  assert.equal(hostFromHostPort(undefined), undefined);
});
