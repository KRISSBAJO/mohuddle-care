import { z } from "zod";
import { addIncidentPhoto, MAX_PHOTO_BYTES } from "@/server/incident-photos";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* Adds one photo to an incident. The body is the image itself, with its content type. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return problem(404, "not_found", "That incident is not on record.");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) return problem(413, "too_big", "Photos can be up to 10 MB.");
    const uploadId = request.headers.get("x-upload-id") ?? undefined;
    if (uploadId && !z.uuid().safeParse(uploadId).success) return problem(400, "invalid", "Unknown photo request.");
    const result = await addIncidentPhoto(user, id, Buffer.from(await request.arrayBuffer()), request.headers.get("content-type") ?? "", new URL(request.url).searchParams.get("caption") ?? "", uploadId);
    return result.error !== undefined ? problem(400, "refused", result.error) : reply({ id: result.id });
  },
  { writes: true },
);
