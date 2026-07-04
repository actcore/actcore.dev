/**
 * Browser wasi:sockets shim for @actcore/web-runtime.
 *
 * preview2-shim's browser build ships wasi:sockets as method-only stub objects
 * that OMIT the resource-class constructors (ResolveAddressStream, Network,
 * TcpSocket, UdpSocket, IncomingDatagramStream, OutgoingDatagramStream). jco's
 * generated glue destructures those classes at instantiation
 * (`const { ResolveAddressStream } = ipNameLookup`) and throws
 * "unexpectedly undefined local import" if they're missing — which any
 * wasi:http-importing component (whose wasip3 world transitively pulls in
 * wasi:sockets) triggers even when it never touches the network.
 *
 * This shim provides the full export surface WITH the resource classes as inert
 * stubs. Sockets/DNS are never actually exercised by the pure-compute components
 * we run in the tab; the constructors only need to EXIST so instantiation
 * succeeds. host-browser routes `wasi:sockets/*` here (see transpile.ts) instead
 * of at the preview2-shim base.
 *
 * DENY, DON'T CRASH: the three resource-creation entry points below —
 * `resolveAddresses` (DNS), `createTcpSocket`, `createUdpSocket` — are the only
 * ways guest code can ever obtain a live socket/lookup resource; every other
 * method in this file is unreachable unless one of those three succeeds. Their
 * WIT signatures return `result<_, error-code>`, and jco's generated glue wraps
 * each call in `try { ... } catch (e) { ret = { tag: 'err', val:
 * getErrorPayload(e) } }` — but `getErrorPayload` only treats `e` as the error
 * payload if `e` is NOT a plain `Error` (a thrown `Error` gets RE-THROWN
 * uncaught instead of becoming a clean `result::err`, verified by reading the
 * transpiled glue). So denial must throw the raw `error-code` string value
 * (e.g. `'access-denied'`), never `new Error(...)` — a plain Error here
 * doesn't deny the call, it corrupts the CPython/JSPI interpreter state
 * (`Fatal Python error: ... the GIL is released`), which is worse than useless
 * for a "sealed sandbox" story. Everything else in this file stays a bare
 * no-op stub: unreachable code, so its shape doesn't matter.
 *
 * `instance-network()` is the one exception to "deny at the entry point": its
 * WIT signature is `func() -> network` — no `result<>`, so it has NO error
 * channel at all (getting the ambient network capability TOKEN is defined to
 * never fail; the denial belongs at the point that token is actually used).
 * It must return a real `Network` instance — returning `undefined` fails the
 * caller's `instanceof Network` check with an uncaught "Resource error: Not a
 * valid Network resource", which (same as above) never reaches Python as a
 * clean exception. `Network` is declared once here so `instanceNetwork()` and
 * `network.Network` share the identical class the generated glue checks
 * `instanceof` against.
 */
export interface SocketsPolicyPort {
    noteSocketsDenied(): void;
}
export declare function __setSocketsPolicy(p: SocketsPolicyPort | null): void;
declare function denyAccess(): never;
declare class Network {
}
export declare const instanceNetwork: {
    instanceNetwork(): Network;
};
export declare const ipNameLookup: {
    ResolveAddressStream: {
        new (): {};
    };
    dropResolveAddressStream(): void;
    subscribe(): void;
    resolveAddresses: typeof denyAccess;
    resolveNextAddress(): void;
    nonBlocking(): void;
    setNonBlocking(): void;
};
export declare const network: {
    Network: typeof Network;
    dropNetwork(): void;
};
export declare const tcpCreateSocket: {
    createTcpSocket: typeof denyAccess;
};
export declare const tcp: {
    TcpSocket: {
        new (): {};
    };
    subscribe(): void;
    dropTcpSocket(): void;
    bind(): void;
    connect(): void;
    listen(): void;
    accept(): void;
    localAddress(): void;
    remoteAddress(): void;
    addressFamily(): void;
    setListenBacklogSize(): void;
    keepAlive(): void;
    setKeepAlive(): void;
    noDelay(): void;
    setNoDelay(): void;
    unicastHopLimit(): void;
    setUnicastHopLimit(): void;
    receiveBufferSize(): void;
    setReceiveBufferSize(): void;
    sendBufferSize(): void;
    setSendBufferSize(): void;
    nonBlocking(): void;
    setNonBlocking(): void;
    shutdown(): void;
};
export declare const udpCreateSocket: {
    createUdpSocket: typeof denyAccess;
};
export declare const udp: {
    UdpSocket: {
        new (): {};
    };
    IncomingDatagramStream: {
        new (): {};
    };
    OutgoingDatagramStream: {
        new (): {};
    };
    subscribe(): void;
    dropUdpSocket(): void;
    bind(): void;
    connect(): void;
    receive(): void;
    send(): void;
    localAddress(): void;
    remoteAddress(): void;
    addressFamily(): void;
    unicastHopLimit(): void;
    setUnicastHopLimit(): void;
    receiveBufferSize(): void;
    setReceiveBufferSize(): void;
    sendBufferSize(): void;
    setSendBufferSize(): void;
    nonBlocking(): void;
    setNonBlocking(): void;
};
export {};
//# sourceMappingURL=sockets.d.ts.map