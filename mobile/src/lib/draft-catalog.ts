import type { createDraftStore } from "./draft-store";
export type NoteDraftLink = { key: string; kind: "note" | "community" | "amend"; target: string; personId: string; label: string; updatedAt: string };
export function draftKey(userId: string, agencyId: string, kind: string, target: string) {
  return `mohuddle.draft.${userId}.${agencyId}.${kind}.${target}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createDraftRepository(journal: ReturnType<typeof createDraftStore>) {
const indexes = new Map<string, Promise<unknown>>();
function entryFor(key: string, value: unknown): NoteDraftLink | null {
  const match = /^mohuddle\.draft\.[^.]+\.[^.]+\.(note|community|amend)\.(.+)$/.exec(key);
  if (!match) return null;
  const data = value as { form?: { person?: { id?: string; name?: string } }; fields?: Record<string, unknown>; individualId?: string };
  return { key, kind: match[1] as NoteDraftLink["kind"], target: match[2], personId: data.form?.person?.id ?? String(data.fields?.individualId ?? data.individualId ?? ""), label: data.form?.person?.name ?? "", updatedAt: new Date().toISOString() };
}
function indexKey(key: string) { return key.split(".").slice(0, 4).join(".") + ".catalog.notes"; }
async function updateIndex(key: string, entry: NoteDraftLink | null) {
  const index = indexKey(key);
  const next = (indexes.get(index) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const list = (await journal.read<NoteDraftLink[]>(index) ?? []).filter(item => item.key !== key);
    if (entry) list.unshift(entry);
    await journal.write(index, list);
  });
  indexes.set(index, next);
  try { await next; } finally { if (indexes.get(index) === next) indexes.delete(index); }
}
const drafts = {
  read: journal.read,
  async write(key: string, value: unknown) {
    await journal.write(key, value);
    const entry = entryFor(key, value);
    if (entry) await updateIndex(key, entry);
  },
  async clear(key: string) {
    await journal.clear(key);
    if (entryFor(key, {})) await updateIndex(key, null);
  },
};

async function listNoteDrafts(userId: string, agencyId: string, knownTargets: string[] = []) {
  const community = draftKey(userId, agencyId, "community", "new");
  const index = indexKey(community);
  const listed = await journal.read<NoteDraftLink[]>(index) ?? [];
  // Recover drafts written by the earlier OTA, before there was a Drafts list.
  const legacyKeys = [community, ...knownTargets.slice(0, 200).map(target => draftKey(userId, agencyId, "note", target))];
  for (const key of [...new Set(legacyKeys)].filter(key => !listed.some(item => item.key === key))) {
    const value = await journal.read(key);
    if (value) { const entry = entryFor(key, value); if (entry) await updateIndex(key, entry); }
  }
  const current = await journal.read<NoteDraftLink[]>(index) ?? [];
  const found: NoteDraftLink[] = [];
  for (const entry of current) if (await journal.read(entry.key)) found.push(entry);
  return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

return { ...drafts, listNoteDrafts };
}
