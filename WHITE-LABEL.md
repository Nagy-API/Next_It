# Using this system for another company

Everything that makes it "NEXORA" can be changed **without touching code**.

## 1. From the app (easiest, any time)

Sign in as an admin → **Settings → Company & branding**:

| Setting | Where it shows |
| --- | --- |
| Company name | Sign-in page, chat, reports, Excel file names |
| System name | Browser tab title |
| Who to ask for an account | Sign-in page ("No account? Ask …") |
| Main colour | Buttons, links, highlights, charts' accents |
| Dark colour | Sidebar, headers, text |
| Logo (light version) | Sidebar and sign-in page (dark background) |
| Icon / symbol | Next to the logo, watermark, browser tab icon |

**Reset to default** brings back the original look. Every change is written to the Activity log.

## 2. A brand-new company (empty system)

Start it once with `SEED_DEMO=0` and it creates **only an admin account** (no NEXORA team, brands or demo content):

```bash
SEED_DEMO=0 ADMIN_USERNAME=admin ADMIN_NAME="Mona" SEED_DEFAULT_PASSWORD="choose-a-strong-one" \
COMPANY_NAME="Acme Studio" BRAND_PRIMARY="#E11D48" BRAND_DARK="#1F1B2E" npm run local
```

Then sign in, set the logo in Settings → Company & branding, add people (Settings → People — tick
*Manager* for the leads), brands (Settings → Brands, with the default person for each step) and platforms.

On Windows, put the same variables in a `.env` file next to `package.json` (one `NAME=value` per line)
and double-click `start-nexora.bat`.

## 3. Defaults in code (optional)

- `src/config/brand.ts` — default name, colours and logo files.
- `public/brand/` — the default logo images (replace the files, keep the names).
- `src/app/icon.png` / `src/app/apple-icon.png` — default browser icons.
- `src/app/globals.css` — the full colour palette (`@theme`), if you want to change more than the two brand colours.

## What stays the same for every company

The workflow (Content → Pre-production → Post-production / Design → Social → Published, or → Delivered for
one-off projects), versions and approvals, deadlines, tasks, chat, notifications, dashboard and Excel reports.
Dates and "today" use Cairo time (`src/lib/dates.ts`, `TIMEZONE`).
