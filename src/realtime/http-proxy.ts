import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";

export function localUpstream(value: string | undefined): URL | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("CHAT_HTTP_UPSTREAM must name a local HTTP server on 127.0.0.1.");
  }
  return url;
}

// One paid service: WebSockets stay here; ordinary requests stream to Next on a private port.
export function proxyHttp(request: IncomingMessage, response: ServerResponse, upstream: URL) {
  if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
    response.writeHead(400).end();
    return;
  }
  const outgoing = httpRequest({ hostname: upstream.hostname, port: upstream.port, path: request.url, method: request.method, headers: request.headers }, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers);
    incoming.on("error", () => response.destroy());
    incoming.pipe(response);
  });
  outgoing.on("error", () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(502, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("The app is restarting. Try again shortly.");
  });
  request.on("aborted", () => outgoing.destroy());
  request.on("error", () => outgoing.destroy());
  response.on("close", () => { if (!response.writableEnded) outgoing.destroy(); });
  request.pipe(outgoing);
}
