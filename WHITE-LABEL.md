# Using this system for another company

Branding lives **in the code, in one file** — so a person or an AI coding tool can change it safely
without touching anything else.

## The files to change

| What | File |
| --- | --- |
| Company name, system name, tagline, who to ask for an account | `src/config/brand.ts` → `BRAND.name`, `appName`, `tagline`, `adminContact` |
| The two brand colours (everything else is mixed from them) | `src/config/brand.ts` → `BRAND.colors.primary`, `BRAND.colors.dark` |
| Logos | `public/brand/` (replace the PNGs, keep the names) — or change the paths in `BRAND.logos` |
| Browser tab icons | `src/app/icon.png`, `src/app/apple-icon.png` |
| The full palette (status colours, greys…) — rarely needed | `src/app/globals.css` → `@theme` |
| Chart colours (optional) | `src/components/charts.tsx` → `STAGE_RAMP` |
| Timezone ("today", deadlines) | `src/lib/dates.ts` → `TIMEZONE` (default `Africa/Cairo`) |

After changing them: `npm run typecheck && npm run build`, then restart.

## Starting empty (no NEXORA team, brands or demo content)

Run the first start with `SEED_DEMO=0`. It creates **one admin account** and the usual platforms:

```bash
SEED_DEMO=0 ADMIN_USERNAME=admin ADMIN_NAME="Mona" SEED_DEFAULT_PASSWORD="a-long-temporary-password" npm run local
```

The admin must change that password on first sign-in. Then add people (Settings → People — tick *Manager*
for the leads), brands (Settings → Brands, with the default person per step) and platforms.

## What stays the same for every company

The workflow (Content → Pre-production → Post-production / Design → Social → Published, or → Delivered for
one-off projects), versions and approvals, deadlines, tasks, chat, notifications, dashboard, Excel reports and security.
