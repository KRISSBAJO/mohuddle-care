import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { once } from "node:events";
import { localUpstream, proxyHttp } from "../src/realtime/http-proxy";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}
const close = (server: Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });

test("hosted chat only proxies to a private loopback Next server", () => {
  assert.equal(localUpstream(undefined), null);
  for (const value of ["https://127.0.0.1:1234", "http://public.example:1234", "http://secret@127.0.0.1:1234", "http://127.0.0.1:1234/path"]) assert.throws(() => localUpstream(value));
});

test("hosted proxy preserves request bodies, routing, host, IP headers and multiple cookies", async () => {
  const upstream = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.writeHead(201, { "set-cookie": ["one=1; HttpOnly", "two=2; Secure"], "content-type": "application/json" });
    res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, ip: req.headers["x-real-ip"], body }));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createServer((req, res) => proxyHttp(req, res, localUpstream(`http://127.0.0.1:${upstreamPort}`)!));
  const port = await listen(gateway);
  try {
    const response = await new Promise<{ status: number | undefined; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port, path: "/api/chat/test?x=1", method: "POST", headers: { host: "mohuddle.com", "x-real-ip": "192.0.2.1" } }, incoming => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", chunk => { body += chunk; });
        incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body }));
      });
      request.on("error", reject);
      request.end("test recording");
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers["set-cookie"]?.length, 2);
    assert.deepEqual(JSON.parse(response.body), { method: "POST", url: "/api/chat/test?x=1", host: "mohuddle.com", ip: "192.0.2.1", body: "test recording" });
  } finally { await close(gateway); await close(upstream); }
});

test("hosted proxy returns a controlled restart response when Next is unavailable", async () => {
  const unused = createServer();
  const unusedPort = await listen(unused);
  await close(unused);
  const gateway = createServer((req, res) => proxyHttp(req, res, localUpstream(`http://127.0.0.1:${unusedPort}`)!));
  const port = await listen(gateway);
  try { assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 502); }
  finally { await close(gateway); }
});
