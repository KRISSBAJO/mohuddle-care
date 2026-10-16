import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { DocumentError } from "@/server/docs/service";
import { drawnImage, SIGNATURE_FONTS, typedImage, type SignatureFont, type Stroke } from "@/server/docs/signature-image";
import { clientIp, signRequested } from "@/server/docs/sign-request";

export const dynamic = "force-dynamic";

const drawing = z.object({
  strokes: z.array(z.array(z.tuple([z.number().min(-50).max(5000), z.number().min(-50).max(5000)])).max(2000)).max(80),
  box: z.object({ width: z.number().min(10).max(5000), height: z.number().min(10).max(5000) }),
});

const input = z.object({
  itemId: z.uuid(),
  method: z.enum(["drawn", "typed"]),
  typedName: z.string().trim().max(120).default(""),
  typedInitials: z.string().trim().max(8).default(""),
  font: z.enum(Object.keys(SIGNATURE_FONTS) as [SignatureFont, ...SignatureFont[]]).default("apple"),
  signature: drawing.optional(),
  initials: drawing.optional(),
  initialsCount: z.number().int().min(0).max(500),
  consent: z.literal(true),
  consentedAt: z.iso.datetime(),
});

/*
 * Signs a requested document from the phone. The phone sends the typed name (with a handwriting
 * font) or the lines drawn with a finger; the server draws the images and signs as the website does.
 */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", parsed.error.issues.some(issue => issue.path[0] === "consent") ? "Agree to sign electronically first." : "The signature could not be read. Try again.");
    const data = parsed.data;
    let signaturePng: Buffer;
    let initialsPng: Buffer;
    try {
      if (data.method === "typed") {
        signaturePng = typedImage(data.typedName, data.font, "signature");
        initialsPng = typedImage(data.typedInitials, data.font, "initials");
      } else {
        if (!data.signature) return problem(400, "invalid", "Draw your signature.");
        signaturePng = drawnImage(data.signature.strokes as Stroke[], data.signature.box, "signature");
        // Drawn initials are optional on the phone; without them the typed initials are used.
        initialsPng = data.initials ? drawnImage(data.initials.strokes as Stroke[], data.initials.box, "initials") : typedImage(data.typedInitials, data.font, "initials");
      }
    } catch (error) {
      if (error instanceof DocumentError) return problem(400, "invalid", error.message);
      throw error;
    }
    const result = await signRequested({
      itemId: data.itemId,
      token: null,
      method: data.method,
      typedName: data.typedName,
      typedInitials: data.typedInitials,
      signaturePng,
      initialsPng,
      initialsCount: data.initialsCount,
      appliedFields: [],
      consentedAt: new Date(data.consentedAt),
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    });
    return result.ok ? reply({ id: result.id }) : problem(result.status, "refused", result.error);
  },
  { writes: true },
);
