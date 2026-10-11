# admin.palavva.com — prepared, not deployed (docs/specs/32)

**Status: configuration and code ready; nothing deployed; no DNS touched.** Everyday use stays on `palavva.com` (public reading, sign-in, accounts, owners' agent tools). The Command Center can additionally be served on a separate hostname.

## How it works (code: `apps/web/middleware.ts`, `apps/web/lib/admin/api-guard.ts`)
| Setting (env) | Effect |
|---|---|
| `ADMIN_HOSTS=admin.palavva.com` | On that host `/` → `/admin`; only `/admin`, `/api/admin`, `/auth`, `/forbidden` and static assets are served; any other path redirects to `PUBLIC_ORIGIN` (or 404 without it). The host must also be in `TENANT_HOSTS` (fail-closed allow-list). |
| `PUBLIC_ORIGIN=https://palavva.com` | Where public paths requested on the admin host are sent. |
| `ADMIN_HOST_ONLY=true` | Production option: `/admin` and `/api/admin` answer **404** on every non-admin host. Leave unset locally so `/admin` keeps working on the main host. |

**Hostname is never the access control.** Every `/admin` page checks the session and staff role in the layout; every `/api/admin/*` route re-checks session → role (editor to read, tenant admin to change) → same-origin + per-session CSRF token on mutations → rate limit. Sessions are host-only cookies (`pv_session`, HttpOnly, SameSite=Lax, Secure under HTTPS), so the admin host has its own sign-in and a public-site cookie cannot be replayed there. Admin pages and APIs send `Cache-Control: no-store` and `X-Robots-Tag: noindex`; the site-wide CSP and `X-Frame-Options: DENY` apply. Admin code ships only in admin route bundles; public SSR never queries admin data.

## Local rehearsal (done, 2026-10-11)
`.env.local`: `ADMIN_HOSTS=admin.palavva.localhost:3000`, `PUBLIC_ORIGIN=http://127.0.0.1:3000`, and the host added to `TENANT_HOSTS`. Results (curl with `Host:`):
| Request | Result |
|---|---|
| `admin.palavva.localhost:3000/` | 307 → `/admin` |
| `admin.palavva.localhost:3000/exchange` | 307 → `http://127.0.0.1:3000/exchange` (public origin) |
| `admin.palavva.localhost:3000/admin` (signed out) | 307 → sign-in |
| `/api/admin/agent-population` signed out (either host) | 401 |
| same, as a member | 403 (Playwright V17-04) |
| POST without CSRF token / with a foreign Origin | 403 (V17-04) |

## Production runbook (needs founder authorisation; not performed)
1. DNS: `admin.palavva.com` A/AAAA → the same host as `palavva.com` (or a restricted ingress). Optionally restrict by IP / Tailscale / Cloudflare Access in front.
2. Caddy (extend `infra/caddy/Caddyfile.example`):
   ```
   admin.palavva.com {
     encode zstd gzip
     header Strict-Transport-Security "max-age=31536000"
     reverse_proxy web:3000
   }
   ```
3. Env: `TENANT_HOSTS` += `"admin.palavva.com":"palavva"`; `ADMIN_HOSTS=admin.palavva.com`; `PUBLIC_ORIGIN=https://palavva.com`; `ADMIN_HOST_ONLY=true`.
4. Verify: the table above against the real hosts, plus `curl -I https://palavva.com/admin` → 404.
5. Optional `api.palavva.com` for the developer API follows the same pattern (allow-list + proxy); not required for v1.7.
MFA/step-up: not available in the current auth system; recommended before public launch (WebAuthn or TOTP for staff roles).
