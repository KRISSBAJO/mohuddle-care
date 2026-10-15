import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Six-digit codes from an authenticator app (RFC 6238, the kind Google Authenticator and Microsoft
 * Authenticator make): a shared secret, the time in 30-second steps, HMAC-SHA1.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Not a base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* A new secret for an authenticator app: 20 random bytes, as the app expects them typed or scanned. */
export const newSecret = () => base32Encode(randomBytes(20));

/* The code for one 30-second step. */
export function codeAt(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (at = Date.now()) => Math.floor(at / 30_000);

/*
 * Checks a typed code, allowing one step either side for a phone clock that is a little off. Returns
 * the step it matched, so the caller can refuse the same code twice, or null.
 */
export function checkCode(secret: string, typed: string, at = Date.now()) {
  const code = typed.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepOf(at);
  for (const step of [now, now - 1, now + 1]) {
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

/* The link an authenticator app opens to add the account. */
export const otpauthUrl = (secret: string, account: string, issuer = "Mohuddle") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/* The secret in groups of four, easier to type into an app. */
export const groupSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();
