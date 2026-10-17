import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export function clientIpProof(ip: string, at: string, key: string) {
  return createHmac("sha256", key).update(JSON.stringify([ip, at])).digest("hex");
}

export function verifiedClientIp(headers: Headers, key: string | undefined, now = Date.now()): string | null {
  if (!key || key.length < 32) return null;
  const ip = headers.get("x-mohuddle-client-ip") ?? "";
  const at = headers.get("x-mohuddle-client-ip-at") ?? "";
  const proof = headers.get("x-mohuddle-client-ip-signature") ?? "";
  if (!isIP(ip) || !/^\d{13}$/.test(at) || Math.abs(now - Number(at)) > 300_000 || !/^[a-f0-9]{64}$/.test(proof)) return null;
  const expected = Buffer.from(clientIpProof(ip, at, key), "hex");
  return timingSafeEqual(Buffer.from(proof, "hex"), expected) ? ip : null;
}
