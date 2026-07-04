import { type ErrorCode } from './wasi-http-internal.js';
import type { Duration, FieldName, FieldValue, Method, Scheme, StatusCode, Result } from '../generated/interfaces/wasi-http-types.js';
import type { ResourceOp } from '../policy/types.js';
/**
 * Minimal port the http PEP calls. Widened in the consent task to resolve
 * `ask`; `runComponent` installs the real engine before instantiation.
 * v1 limitation: a single module-level slot ⇒ one governed component per
 * page realm at a time (see the design spec).
 */
export interface HttpPolicyPort {
    decideHttp(op: ResourceOp): Promise<'allow' | 'deny'>;
}
export declare function __setActivePolicy(p: HttpPolicyPort | null): void;
type Headers = Fields;
type Trailers = Fields;
export declare class Fields {
    #private;
    constructor();
    static fromList(entries: Array<[FieldName, FieldValue]>): Fields;
    get(name: FieldName): Array<FieldValue>;
    has(name: FieldName): boolean;
    set(name: FieldName, value: Array<FieldValue>): void;
    'delete'(name: FieldName): void;
    getAndDelete(name: FieldName): Array<FieldValue>;
    append(name: FieldName, value: FieldValue): void;
    copyAll(): Array<[FieldName, FieldValue]>;
    clone(): Fields;
    _lockInternal(): void;
}
export declare class RequestOptions {
    #private;
    constructor();
    getConnectTimeout(): Duration | undefined;
    setConnectTimeout(duration: Duration | undefined): void;
    getFirstByteTimeout(): Duration | undefined;
    setFirstByteTimeout(duration: Duration | undefined): void;
    getBetweenBytesTimeout(): Duration | undefined;
    setBetweenBytesTimeout(duration: Duration | undefined): void;
    clone(): RequestOptions;
    _lockInternal(): void;
}
export declare class Request {
    method: Method;
    pathWithQuery: string | undefined;
    scheme: Scheme | undefined;
    authority: string | undefined;
    headers: Fields;
    body: ReadableStream<number> | undefined;
    trailers: Promise<Result<Trailers | undefined, ErrorCode>>;
    options: RequestOptions | undefined;
    private constructor();
    static 'new'(headers: Headers, contents: ReadableStream<number> | undefined, trailers: Promise<Result<Trailers | undefined, ErrorCode>>, options: RequestOptions | undefined): [Request, Promise<Result<void, ErrorCode>>];
    getMethod(): Method;
    setMethod(method: Method): void;
    getPathWithQuery(): string | undefined;
    setPathWithQuery(pathWithQuery: string | undefined): void;
    getScheme(): Scheme | undefined;
    setScheme(scheme: Scheme | undefined): void;
    getAuthority(): string | undefined;
    setAuthority(authority: string | undefined): void;
    getOptions(): RequestOptions | undefined;
    getHeaders(): Headers;
    static consumeBody(this_: Request, _res: Promise<Result<void, ErrorCode>>): [
        ReadableStream<number>,
        Promise<Result<Trailers | undefined, ErrorCode>>
    ];
}
export declare class Response {
    statusCode: StatusCode;
    headers: Fields;
    body: ReadableStream<number> | undefined;
    _bufferedBody: Uint8Array | undefined;
    trailers: Promise<Result<Trailers | undefined, ErrorCode>>;
    private constructor();
    static 'new'(headers: Headers, contents: ReadableStream<number> | undefined, trailers: Promise<Result<Trailers | undefined, ErrorCode>>): [Response, Promise<Result<void, ErrorCode>>];
    getStatusCode(): StatusCode;
    setStatusCode(statusCode: StatusCode): void;
    getHeaders(): Headers;
    static consumeBody(this_: Response, _res: Promise<Result<void, ErrorCode>>): [
        ReadableStream<number>,
        Promise<Result<Trailers | undefined, ErrorCode>>
    ];
}
export declare const types: {
    Fields: typeof Fields;
    Request: typeof Request;
    RequestOptions: typeof RequestOptions;
    Response: typeof Response;
};
export declare const client: {
    send(request: Request): Promise<Response>;
};
export type { ErrorCode };
//# sourceMappingURL=wasi-http.d.ts.map