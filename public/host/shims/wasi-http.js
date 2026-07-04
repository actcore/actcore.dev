// Implementation of host-view's wasi:http p3 imports. Public API is the union
// of `client` + `types` exports — these are the symbols jco's transpile pulls
// off the URL we hand it via `map: ['wasi:http/*', shims/wasi-http.js#*]`.
//
// Gen-types (`src/generated/interfaces/wasi-http-{client,types}.d.ts`) drive
// the public shape; see the conformance check at the bottom of this file.
import { internalError, FIELD_VALUE_RE, FORBIDDEN, TOKEN_RE, } from './wasi-http-internal.js';
const TEXT_DECODER = new TextDecoder();
function decodeFieldValue(v) {
    // FieldValue is Uint8Array per WIT, but be lenient if a string slips in.
    return typeof v === 'string' ? v : TEXT_DECODER.decode(v);
}
export class Fields {
    #immutable = false;
    // Preserves insertion order + original casing for `copyAll`.
    #entries = [];
    // Lowercase-keyed view for `get`/`has`/`delete`/`set`. Each bucket holds
    // references to the same tuples stored in `#entries` so we can keep them
    // in sync.
    #table = new Map();
    constructor() { }
    static fromList(entries) {
        const f = new Fields();
        for (const [k, v] of entries)
            f.append(k, v);
        return f;
    }
    get(name) {
        return (this.#table.get(name.toLowerCase()) ?? []).map(([, v]) => v);
    }
    has(name) {
        return this.#table.has(name.toLowerCase());
    }
    set(name, value) {
        if (this.#immutable)
            throw { tag: 'immutable' };
        if (!TOKEN_RE.test(name))
            throw { tag: 'invalid-syntax' };
        const lower = name.toLowerCase();
        if (FORBIDDEN.has(lower))
            throw { tag: 'forbidden' };
        for (const v of value) {
            if (!FIELD_VALUE_RE.test(decodeFieldValue(v))) {
                throw { tag: 'invalid-syntax' };
            }
        }
        // Drop existing entries for this name (preserving insertion order for
        // other names).
        const existing = this.#table.get(lower);
        if (existing && existing.length > 0) {
            this.#entries = this.#entries.filter((e) => !existing.includes(e));
            existing.length = 0;
        }
        else if (!existing) {
            this.#table.set(lower, []);
        }
        const bucket = this.#table.get(lower);
        for (const v of value) {
            const entry = [name, v];
            this.#entries.push(entry);
            bucket.push(entry);
        }
    }
    'delete'(name) {
        if (this.#immutable)
            throw { tag: 'immutable' };
        const lower = name.toLowerCase();
        const bucket = this.#table.get(lower);
        if (bucket && bucket.length > 0) {
            this.#entries = this.#entries.filter((e) => !bucket.includes(e));
        }
        this.#table.delete(lower);
    }
    getAndDelete(name) {
        const out = this.get(name);
        if (out.length > 0)
            this.delete(name);
        return out;
    }
    append(name, value) {
        if (this.#immutable)
            throw { tag: 'immutable' };
        if (!TOKEN_RE.test(name))
            throw { tag: 'invalid-syntax' };
        if (!FIELD_VALUE_RE.test(decodeFieldValue(value))) {
            throw { tag: 'invalid-syntax' };
        }
        const lower = name.toLowerCase();
        if (FORBIDDEN.has(lower))
            throw { tag: 'forbidden' };
        const entry = [name, value];
        this.#entries.push(entry);
        const bucket = this.#table.get(lower);
        if (bucket)
            bucket.push(entry);
        else
            this.#table.set(lower, [entry]);
    }
    copyAll() {
        return this.#entries.map(([k, v]) => [
            k,
            typeof v === 'string' ? v : v.slice(),
        ]);
    }
    clone() {
        return Fields.fromList(this.#entries);
    }
    // Internal: response headers are immutable per WIT spec.
    _lockInternal() {
        this.#immutable = true;
    }
}
export class RequestOptions {
    #connect;
    #firstByte;
    #betweenBytes;
    #immutable = false;
    constructor() { }
    getConnectTimeout() {
        return this.#connect;
    }
    setConnectTimeout(duration) {
        this.#guard();
        this.#connect = duration;
    }
    getFirstByteTimeout() {
        return this.#firstByte;
    }
    setFirstByteTimeout(duration) {
        this.#guard();
        this.#firstByte = duration;
    }
    getBetweenBytesTimeout() {
        return this.#betweenBytes;
    }
    setBetweenBytesTimeout(duration) {
        this.#guard();
        this.#betweenBytes = duration;
    }
    clone() {
        const c = new RequestOptions();
        c.#connect = this.#connect;
        c.#firstByte = this.#firstByte;
        c.#betweenBytes = this.#betweenBytes;
        return c;
    }
    #guard() {
        if (this.#immutable)
            throw { tag: 'immutable' };
    }
    _lockInternal() {
        this.#immutable = true;
    }
}
export class Request {
    // Public for shim internals (used by client.send) but jco only touches the
    // setter / getter methods below.
    method = { tag: 'get' };
    pathWithQuery = undefined;
    scheme = undefined;
    authority = undefined;
    headers;
    body = undefined;
    trailers;
    options = undefined;
    // gen-types models the resource constructor as `private constructor()`; the
    // public way to make one is `Request.new(...)`. We can't make the
    // constructor strictly private without breaking the static factory below,
    // but discourage external use by name-prefixing the params.
    constructor(headers, body, trailers, options) {
        this.headers = headers;
        this.body = body;
        this.trailers = trailers;
        this.options = options;
    }
    static 'new'(headers, contents, trailers, options) {
        const req = new Request(headers, contents, trailers, options);
        // Per WIT: headers/options accessed via getters are immutable.
        headers._lockInternal();
        options?._lockInternal();
        // The future resolves to the outcome of transmission. For a freshly
        // constructed request that hasn't been handed off yet, we resolve with
        // ok(); client.send replaces this when it actually sends.
        const future = Promise.resolve({
            tag: 'ok',
            val: undefined,
        });
        return [req, future];
    }
    getMethod() {
        return this.method;
    }
    setMethod(method) {
        this.method = method;
    }
    getPathWithQuery() {
        return this.pathWithQuery;
    }
    setPathWithQuery(pathWithQuery) {
        this.pathWithQuery = pathWithQuery;
    }
    getScheme() {
        return this.scheme;
    }
    setScheme(scheme) {
        this.scheme = scheme;
    }
    getAuthority() {
        return this.authority;
    }
    setAuthority(authority) {
        this.authority = authority;
    }
    getOptions() {
        return this.options;
    }
    getHeaders() {
        return this.headers;
    }
    static consumeBody(this_, _res) {
        const body = this_.body ??
            new ReadableStream({
                start(controller) {
                    controller.close();
                },
            });
        return [body, this_.trailers];
    }
}
// jco's emitted `_trampoline54` for `[static]response.consume-body` calls
// `Response.consumeBody(rsc0, futureResult3)`, destructures the returned tuple
// `[tuple4_0, tuple4_1]`, then probes `tuple4_0` with `symbolAsyncIterator in
// _`, then `symbolIterator in _`, then `instanceof _PlatformReadableStream`
// (= `globalThis.ReadableStream`). The chosen branch becomes `readFn5` whose
// `.next()`/`.read()` results feed `hostWriteEnd.write(values)` — and the
// inner `lowerFn` is `_lowerFlatU8`, which writes ONE byte per value via
// `setUint32(ptr, ctx.vals[0], true)`. NOTE: this does NOT require the reader
// to yield one `number` per read — jco's `PendingValueQueue.appendReadValue`
// batches array-like values and `drainInto` re-expands them to individual u8s
// before `_lowerFlatU8`. So `consumeBody` yields the whole `Uint8Array` in one
// chunk (see ACT-153; the old per-byte enqueue was ~95 B/s). `tuple4_1` is
// written verbatim to memory as an
// Int32 — for our purposes a resolved Promise<{tag:'ok'}> is fine, jco's
// trailers wiring is invoked separately. This is **Branch B** of the Task 7
// plan: synchronous static method returning [stream, futureValue].
export class Response {
    statusCode = 200;
    headers;
    body = undefined;
    // Internal buffer populated by `client.send`. The data flow lands here
    // before `consumeBody` lowers it into a `ReadableStream<number>` for jco.
    _bufferedBody = undefined;
    trailers;
    constructor(headers, body, trailers) {
        this.headers = headers;
        this.body = body;
        this.trailers = trailers;
    }
    static 'new'(headers, contents, trailers) {
        const resp = new Response(headers, contents, trailers);
        headers._lockInternal();
        const future = Promise.resolve({
            tag: 'ok',
            val: undefined,
        });
        return [resp, future];
    }
    getStatusCode() {
        return this.statusCode;
    }
    setStatusCode(statusCode) {
        if (statusCode < 100 || statusCode > 999) {
            // WIT spec says "fails if the status-code given is not a valid http
            // status code". Surface as a plain Error since this method has no
            // typed error in the WIT.
            throw new Error('status-code out of range');
        }
        this.statusCode = statusCode;
    }
    getHeaders() {
        return this.headers;
    }
    static consumeBody(this_, _res) {
        // If a body stream was provided directly (synthetic Response in tests),
        // honor it. Otherwise lower the buffered Uint8Array from `client.send`
        // into a ReadableStream<number> — one byte per chunk, because jco's
        // stream lowering invokes `_lowerFlatU8` on each `value` returned from
        // the stream's reader (see the block comment above `class Response`).
        if (this_.body)
            return [this_.body, this_.trailers];
        const bytes = this_._bufferedBody ?? new Uint8Array(0);
        // Enqueue the already-buffered body as ONE chunk. An earlier revision
        // enqueued one byte per chunk on the belief that jco's `_lowerFlatU8`
        // requires each stream value to be a single `number` — that is wrong. jco
        // pulls values via the reader, and `PendingValueQueue.appendReadValue`
        // batches array-like values (Uint8Array included) while `drainInto`
        // re-expands them to individual u8s for `_lowerFlatU8` on the write side.
        // The per-byte path cost a full async-task round-trip PER BYTE (~95 B/s; a
        // 43 KB body took minutes / effectively hung). Whole-buffer enqueue drains
        // the same body in <100 ms, byte-for-byte identical (verified). See ACT-153.
        // The stream is nominally `ReadableStream<number>` per gen-types; the
        // Uint8Array cast is intentional — jco expands it per-u8 (see above).
        let sent = false;
        const body = new ReadableStream({
            pull(controller) {
                if (!sent) {
                    sent = true;
                    if (bytes.length > 0)
                        controller.enqueue(bytes);
                }
                controller.close();
            },
        });
        return [body, this_.trailers];
    }
}
export const types = {
    Fields,
    Request,
    RequestOptions,
    Response,
};
function methodToString(m) {
    switch (m.tag) {
        case 'get': return 'GET';
        case 'head': return 'HEAD';
        case 'post': return 'POST';
        case 'put': return 'PUT';
        case 'delete': return 'DELETE';
        case 'connect': return 'CONNECT';
        case 'options': return 'OPTIONS';
        case 'trace': return 'TRACE';
        case 'patch': return 'PATCH';
        case 'other': return m.val;
    }
}
function schemeToString(s) {
    if (!s)
        return 'https';
    if (s.tag === 'HTTP')
        return 'http';
    if (s.tag === 'HTTPS')
        return 'https';
    return s.val;
}
function fetchErrorToCode(e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes('refused'))
        return { tag: 'connection-refused' };
    if (lower.includes('not found') || lower.includes('getaddrinfo')) {
        return { tag: 'destination-not-found' };
    }
    if (lower.includes('timeout'))
        return { tag: 'connection-timeout' };
    return internalError(msg);
}
export const client = {
    async send(request) {
        const method = methodToString(request.getMethod());
        const scheme = schemeToString(request.getScheme());
        const authority = request.getAuthority();
        if (!authority)
            throw internalError('request missing authority');
        const path = request.getPathWithQuery() ?? '/';
        const url = `${scheme}://${authority}${path}`;
        // `Headers` is locally aliased to `Fields`; use the global fetch class
        // explicitly to avoid shadowing.
        const fetchHeaders = new globalThis.Headers();
        for (const [name, value] of request.getHeaders().copyAll()) {
            const decoded = typeof value === 'string'
                ? value
                : new TextDecoder().decode(value);
            fetchHeaders.append(name, decoded);
        }
        // Task 6 only exercises bodyless methods (GET / HEAD). Request bodies are
        // a Task 7 problem — `request.body` is a `ReadableStream<number>` (a
        // stream of byte ints, not bytes), and lowering that into a fetch body
        // requires the consume-body wiring we're deferring.
        let nativeResp;
        try {
            nativeResp = await fetch(url, {
                method,
                headers: fetchHeaders,
            });
        }
        catch (e) {
            throw fetchErrorToCode(e);
        }
        // Build the WIT Response. The constructor is private; go through the
        // static `Response.new(...)` factory like callers must. Then attach the
        // buffered body — `_bufferedBody` is Task 6's stopgap until Task 7 wires
        // a real ReadableStream through `consumeBody`.
        const respHeaders = new Fields();
        for (const [name, value] of nativeResp.headers.entries()) {
            // Skip forbidden response headers (e.g. set-cookie isn't forbidden, but
            // host/connection/keep-alive in a response are nonsensical and would
            // throw). undici's MockAgent doesn't synthesise these in our tests but
            // real fetch responses might include `connection: close` etc.
            try {
                respHeaders.append(name, new TextEncoder().encode(value));
            }
            catch (e) {
                // Drop forbidden / invalid-syntax headers silently; the alternative
                // would be to fail the whole response on a peer-controlled header.
                if (typeof e === 'object' && e !== null && 'tag' in e &&
                    e.tag === 'forbidden') {
                    continue;
                }
                throw e;
            }
        }
        // Task 7 will replace this with the real trailers future from the fetch
        // response (HTTP/2 trailers via response.trailer where available). For
        // Task 6 we resolve with no trailers.
        const noTrailers = Promise.resolve({ tag: 'ok', val: undefined });
        const [wasiResp] = Response.new(respHeaders, undefined, noTrailers);
        wasiResp.statusCode = nativeResp.status;
        wasiResp._bufferedBody = new Uint8Array(await nativeResp.arrayBuffer());
        return wasiResp;
    },
};
// `satisfies true` forces the conditional to resolve to `true`. If drift
// makes the conditional resolve to `never`, the literal `true` is not
// assignable to `never` and tsc errors at that line.
//
// For `client.send` we only check the member exists and is callable —
// nominal class brands (private constructor() in gen-types' Request /
// Response) prevent direct param/return assignability even though the
// runtime objects are the same. The class checks below give us drift
// detection on the actual shape.
const _checkClient = true;
const _checkClientSendArity = true;
const _checkFieldsInstance = true;
const _checkFieldsStatic = true;
const _checkRequestInstance = true;
const _checkRequestStatic = true;
const _checkRequestOptionsInstance = true;
const _checkResponseInstance = true;
const _checkResponseStatic = true;
void [
    _checkClient,
    _checkClientSendArity,
    _checkFieldsInstance,
    _checkFieldsStatic,
    _checkRequestInstance,
    _checkRequestStatic,
    _checkRequestOptionsInstance,
    _checkResponseInstance,
    _checkResponseStatic,
];
//# sourceMappingURL=wasi-http.js.map