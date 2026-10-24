/** Next's local production server can canonicalize 127.0.0.1 to localhost in
 * Request.url. Accept only the actual incoming loopback Host at the same port
 * and protocol. Do not trust forwarded headers or broaden public-host checks.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const expected = new URL(req.url), host = req.headers.get("host");
  if (host) {
    let incoming: URL;
    try { incoming = new URL(expected.protocol + "//" + host); } catch { throw new Error("ORIGIN_DENIED"); }
    if (incoming.username || incoming.password || incoming.pathname !== "/" || incoming.search || incoming.hash) throw new Error("ORIGIN_DENIED");
    if (incoming.origin !== expected.origin) {
      if (!["localhost", "127.0.0.1"].includes(expected.hostname) || !["localhost", "127.0.0.1"].includes(incoming.hostname) || incoming.port !== expected.port) throw new Error("ORIGIN_DENIED");
      expected.host = incoming.host;
    }
  }
  if (origin !== expected.origin) throw new Error("ORIGIN_DENIED");
}
