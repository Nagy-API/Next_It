# Security & privacy — how NEXORA Ops is protected

Plain-language version for staff: `/privacy` in the app. This file is the technical reference.

| Area | What's in place | Where |
| --- | --- | --- |
| Passwords | Argon2id hashes; 10+ chars, mixed, not common, not the username | `src/server/admin.ts`, `src/lib/passwords.ts` |
| Temporary passwords | New accounts, admin resets and seeded accounts must be changed at first sign-in; nothing else works until then | `users.mustChangePassword`, `src/app/(app)/layout.tsx`, `run()` in `src/app/actions.ts`, `scripts/seed.ts` |
| Brute force | 5 failures / username or 30 / IP in 15 min → locked 15 min; attempts kept 30 days | `src/server/security.ts`, `login_attempts` |
| Account enumeration | Same message for unknown user and wrong password; dummy hash for unknown users | `src/server/sessions.ts` |
| Sessions | 32-byte random token; only SHA-256 stored; httpOnly, SameSite=Lax, Secure in production; 14 days, renewed while used; ended by password change; "sign out on all devices" | `src/server/sessions.ts`, `src/server/auth.ts` |
| Redirects | Only same-site paths after sign-in | `safeNext` |
| Authorization | Every server function checks permissions itself; pages redirect when not allowed | `src/domain/permissions.ts`, `src/server/*` |
| CSRF | Writes only through Next.js server actions (Origin checked) + SameSite cookie | Next.js |
| XSS | React escaping; no user HTML; per-request CSP nonce + `strict-dynamic`; no third-party scripts | `src/proxy.ts` |
| Clickjacking / sniffing | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` | `src/proxy.ts`, `next.config.ts` |
| Transport | HSTS 1 year; `upgrade-insecure-requests` over HTTPS | `next.config.ts`, `src/proxy.ts` |
| Links | Only http(s) links are stored (`normalizeUrl`) | `src/server/workflow.ts` |
| Uploads | Profile photos: PNG/JPEG/WEBP data URLs, size-limited, re-encoded in the browser; served only to signed-in users with nosniff | `src/server/admin.ts`, `src/app/api/avatar` |
| Audit trail | Append-only activity log (database trigger rejects edits/deletes) | `drizzle/0001_activity_log_immutable.sql` |
| Privacy | No analytics/trackers/ads; one first-party cookie; fonts self-hosted; staff numbers visible to self + managers only | `/privacy` |
| Dependencies | `npm audit` clean (uuid pinned via `overrides`) | `package.json` |
| Backups | Automatic every 10 min when changed (`~/nexora-ops-data-backups`, outside the web folder, last 30) + admin download + restore script; corrupted folder → restored automatically | `src/db/local.ts`, `src/app/api/backup`, `scripts/restore.mjs` |
| Secrets | Only environment variables; `.env` is git-ignored | `.env.example` |

## Checklist before going live

- [ ] HTTPS certificate active for the domain.
- [ ] `NODE_ENV=production`, `DATABASE_URL` outside the app folder, strong `SEED_DEFAULT_PASSWORD`.
- [ ] Everyone changed the temporary password (Settings → People shows who hasn't signed in).
- [ ] First backup downloaded and stored privately.
- [ ] `npm audit` shows 0 vulnerabilities.

## Reporting

Security concerns go to the admins (Shahenda, King). Deactivate a person's account immediately when they leave
(Settings → People → Deactivate) — this also signs them out everywhere.
