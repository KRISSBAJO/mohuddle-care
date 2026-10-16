import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { agencyKey, storage } from "@/server/docs/storage";

/*
 * Photos for an incident, such as an injury or damage. Stored privately with the agency's other
 * files and only ever reached through the Hub, which checks who is asking first.
 */

export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 12;

/* The reporter can add photos to their own report; managers to any. */
export async function addIncidentPhoto(user: SessionUser, incidentId: string, body: Buffer, contentType: string, caption = ""): Promise<{ id: string; error?: undefined } | { error: string; id?: undefined }> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const ext = PHOTO_TYPES[type];
  if (!ext) return { error: "Send a photo: JPEG, PNG, WebP or HEIC." };
  if (!body.length || body.length > MAX_PHOTO_BYTES) return { error: "Photos can be up to 10 MB." };
  const [incident] = await db.select({ id: schema.incidents.id, reportedBy: schema.incidents.reportedBy }).from(schema.incidents).where(eq(schema.incidents.id, incidentId)).limit(1);
  if (!incident) return { error: "That incident is not on record." };
  if (!canManage(user) && (!user.staffId || incident.reportedBy !== user.staffId)) return { error: "Only the person who reported it, or a manager, can add photos." };
  const existing = await db.select({ id: schema.incidentPhotos.id }).from(schema.incidentPhotos).where(eq(schema.incidentPhotos.incidentId, incidentId));
  if (existing.length >= MAX_PHOTOS) return { error: `An incident can have up to ${MAX_PHOTOS} photos.` };

  const key = await agencyKey(`incidents/${incidentId}/${randomUUID()}.${ext}`);
  await storage().put(key, body, type);
  const [row] = await db.insert(schema.incidentPhotos).values({ incidentId, storageKey: key, contentType: type, size: body.length, caption: caption.slice(0, 300), takenBy: user.id }).returning({ id: schema.incidentPhotos.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "incident:photo", entity: "incident", entityId: incidentId });
  return { id: row.id };
}

export function photosFor(incidentId: string) {
  return db
    .select({ id: schema.incidentPhotos.id, caption: schema.incidentPhotos.caption, createdAt: schema.incidentPhotos.createdAt, by: schema.users.name })
    .from(schema.incidentPhotos)
    .leftJoin(schema.users, eq(schema.users.id, schema.incidentPhotos.takenBy))
    .where(eq(schema.incidentPhotos.incidentId, incidentId))
    .orderBy(asc(schema.incidentPhotos.createdAt));
}

/* One photo's file, for the Hub to pass on. The row rules keep it to the asker's agency. */
export async function photoFile(id: string) {
  const [photo] = await db.select().from(schema.incidentPhotos).where(eq(schema.incidentPhotos.id, id)).limit(1);
  if (!photo) return null;
  const file = await storage().read(photo.storageKey);
  return { ...file, contentType: photo.contentType };
}
