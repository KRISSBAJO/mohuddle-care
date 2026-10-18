import { createDraftRepository } from "./draft-catalog";
import { createDraftStore } from "./draft-store";
import { readValue, removeValue, writeValue } from "./storage";
export { draftKey, type NoteDraftLink } from "./draft-catalog";
export const drafts = createDraftRepository(createDraftStore({ read: readValue, write: writeValue, remove: removeValue }));
export const listNoteDrafts = drafts.listNoteDrafts;
