import type { ErrorCode as GenErrorCode } from '../generated/interfaces/wasi-http-types.js';
export type ErrorCode = GenErrorCode;
export declare function internalError(msg: string): ErrorCode;
export declare const TOKEN_RE: RegExp;
export declare const FIELD_VALUE_RE: RegExp;
export declare const FORBIDDEN: Set<string>;
//# sourceMappingURL=wasi-http-internal.d.ts.map