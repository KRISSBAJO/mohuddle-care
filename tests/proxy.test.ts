import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const base = new URL(process.env.APP_URL ?? "http://localhost:3400");
const request = (path: string, host = base.host) =>
  new NextRequest(new URL(path, `${base.protocol}//${host}`), { headers: { host } });

test("anonymous visitors can open the public homepage on the main address", () => {
  const response = proxy(request("/"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("the public homepage does not open the staff Hub to anonymous visitors", () => {
  const response = proxy(request("/app"));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
});

test("the hosted platform homepage rewrites to Mohuddle without changing agency routing", () => {
  const previous = process.env.PUBLIC_SITE;
  process.env.PUBLIC_SITE = "mohuddle";
  try {
    const response = proxy(request("/"));
    assert.equal(new URL(response.headers.get("x-middleware-rewrite")!).pathname, "/mohuddle");
    assert.equal(new URL(proxy(request("/", `milestone.${base.host}`)).headers.get("location")!).pathname, "/app");
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_SITE;
    else process.env.PUBLIC_SITE = previous;
  }
});

test("agency, shared and admin home addresses still route to their own sign-in flow", () => {
  for (const [subdomain, path] of [["milestone", "/app"], ["app", "/login"], ["admin", "/owner"]]) {
    const response = proxy(request("/", `${subdomain}.${base.host}`));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, path);
  }
});
