import { createDraftStore } from "./draft-store";
import { readValue, removeValue, writeValue } from "./storage";

export const drafts = createDraftStore({ read: readValue, write: writeValue, remove: removeValue });
export function draftKey(userId: string, agencyId: string, kind: string, target: string) {
  return `mohuddle.draft.${userId}.${agencyId}.${kind}.${target}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}
