/* Server-to-server transport for an optional, self-hosted speech runtime. */
export function scribeService(url: string | undefined, key: string | undefined, transport: typeof fetch = fetch) {
  if (!url && !key) return null;
  if (!url || !key || key.length < 32) throw new Error("Configure the speech service URL and a key of at least 32 characters together.");
  const parsed = new URL(url);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("The speech service must use HTTPS, without URL credentials or query parameters.");
  const origin = parsed.toString().replace(/\/$/, "");
  return {
    async raw(path: string, init: RequestInit = {}) {
      if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid speech service path.");
      return transport(`${origin}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${key}` }, redirect: "error", credentials: "omit", cache: "no-store", signal: init.signal ?? AbortSignal.timeout(300_000) });
    },
    async json<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await this.raw(path, init);
      if (!response.ok) throw new Error("The speech service could not complete this request.");
      return response.json() as Promise<T>;
    },
  };
}
