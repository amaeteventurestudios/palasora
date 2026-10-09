// Outbound link safety for user- or business-supplied websites (T-032). Only plain public http(s) URLs survive.
const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

export function safeExternalUrl(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 300 || /[\u0000-\u001f\u007f\s<>"'`\\]/.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null; // javascript:, data:, vbscript:, file:, ftp:...
  if (u.username || u.password) return null;                         // https://bank.example@evil.example
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some((r) => r.test(host))) return null;
  if (host.includes(":")) return null; // IPv6 literals: not accepted for business websites
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return null; // integer/hex IP encodings
  return u.toString();
}
