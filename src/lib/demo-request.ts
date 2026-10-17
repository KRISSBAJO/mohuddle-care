type Result = { ok: boolean; error?: string };
const LIMIT = 16_384;

/* This public form only accepts same-origin, small JSON requests for demo enquiries. */
export async function handleDemoRequest(request: Request, publicOrigin: string, save: (data: FormData) => Promise<Result>) {
  const reply = (body: Result, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("origin") !== new URL(publicOrigin).origin) return reply({ ok: false, error: "Please submit the form from our website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false, error: "Please use the demo form." }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ ok: false, error: "Please complete the form." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMIT) {
      await reader.cancel();
      return reply({ ok: false, error: "Your message is too long." }, 413);
    }
    chunks.push(value);
  }
  let data: Record<string, unknown>;
  try {
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    data = parsed;
  } catch { return reply({ ok: false, error: "Please check the form." }, 400); }
  const form = new FormData();
  for (const key of ["name", "email", "phone", "interest", "message", "website"]) {
    if (data[key] !== undefined && typeof data[key] !== "string") return reply({ ok: false, error: "Please check the form." }, 400);
    form.set(key, (data[key] as string | undefined) ?? "");
  }
  form.set("kind", "demo");
  const result = await save(form);
  return reply(result, result.ok ? 200 : 400);
}
