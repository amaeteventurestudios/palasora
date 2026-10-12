// ISSUE-23 staff MFA: time-based one-time codes (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits), the format every authenticator
// app understands. No new dependency: Node's crypto does the HMAC. Secrets are stored encrypted (AES-256-GCM) and recovery codes only
// as SHA-256 hashes.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** HOTP value for one counter (RFC 4226 dynamic truncation). */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (ms: number = Date.now()): number => Math.floor(ms / 1000 / 30);
export const totp = (secretB32: string, ms: number = Date.now()): string => hotp(base32Decode(secretB32), stepAt(ms));

/** Accepts the current step and one either side (clock drift). Returns the matched step, or null. A step at or below
 *  `lastUsedStep` is refused so an intercepted code cannot be replayed. */
export function verifyTotp(secretB32: string, code: string, lastUsedStep = -1, ms: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32), now = stepAt(ms);
  for (const s of [now - 1, now, now + 1]) {
    if (s <= lastUsedStep) continue;
    const want = Buffer.from(hotp(key, s)), got = Buffer.from(code);
    if (want.length === got.length && timingSafeEqual(want, got)) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = "Palavva Command Center"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export const hashCode = (c: string): string => createHash("sha256").update(c.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => { const r = randomBytes(5).toString("hex"); return `${r.slice(0, 5)}-${r.slice(5)}`; });
}

// AES-256-GCM sealing with a 32-byte key; stored form "v1:<iv>:<tag>:<ciphertext>" (base64url parts).
export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}
export function unseal(sealed: string, key: Buffer): string | null {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}
