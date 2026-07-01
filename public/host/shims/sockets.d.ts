/**
 * Browser wasi:sockets shim for @actcore/host.
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
 */
export declare const instanceNetwork: {
    instanceNetwork(): void;
};
export declare const ipNameLookup: {
    ResolveAddressStream: {
        new (): {};
    };
    dropResolveAddressStream(): void;
    subscribe(): void;
    resolveAddresses(): void;
    resolveNextAddress(): void;
    nonBlocking(): void;
    setNonBlocking(): void;
};
export declare const network: {
    Network: {
        new (): {};
    };
    dropNetwork(): void;
};
export declare const tcpCreateSocket: {
    createTcpSocket(): void;
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
    createUdpSocket(): void;
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
//# sourceMappingURL=sockets.d.ts.map