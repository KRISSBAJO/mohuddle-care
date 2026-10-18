import { z } from "zod";
const input = z.object({ fields: z.record(z.string().max(200), z.union([z.string().max(6000), z.array(z.string().max(500)).max(60)])) });
export function noteFields(raw: unknown) {
  const parsed = input.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data.fields).length > 400) return null;
  const form = new FormData();
  for (const [key, value] of Object.entries(parsed.data.fields)) for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return form;
}
