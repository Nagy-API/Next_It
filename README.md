# NEXORA Ops

> **Developers & AI tools:** start with [AGENTS.md](AGENTS.md) (full system guide). Security: [docs/SECURITY.md](docs/SECURITY.md).
> Hosting: [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md). Branding: [`src/config/brand.ts`](src/config/brand.ts).

NEXORA's internal content operations system — replaces the Excel content tracker.

Every Reel, Static, Carousel and Story moves through a fixed cycle that the system knows from its type:

| Work | Route |
| --- | --- |
| Monthly Reel | Content → Pre-production (shooting) → Post-production (editing) → Social Media → **Published** |
| Monthly Static / Carousel | Content → Graphic Design → Social Media → **Published** |
| Monthly Story | Content → Social Media → **Published** |
| One-off project deliverable | Content → (Shooting →) Editing / Design → **Delivered** (no Social) |

Completing a stage records who and when, hands the work to the next stage, and — if it was late — moves the next
stages' deadlines by the same delay so nobody is blamed for waiting. Anyone can send work back to an earlier stage
with an optional note. Social publishing is tracked per platform; the item is Published once every planned platform is live.
Every change is written to an append-only history that the database refuses to edit or delete.

## Easiest: run it on one computer (no Docker, no database install)

1. Download this repository as a ZIP (GitHub → **Code → Download ZIP**) and extract it.
2. Windows: double-click **`start-nexora.bat`**. If Node.js isn't installed it downloads its own private copy into the
   folder (nothing is installed on the computer). Mac/Linux: install Node.js LTS, then run `npm install && npm run local`.

The first start installs and builds (a few minutes), then opens **http://localhost:3000** — sign in as
`shahenda` / `Nexora@2026` — you'll be asked to choose your own password. Keep the window open while using it; close it (or Ctrl+C) to stop.
Data is saved in the `local-data` folder next to the app, using a built-in PostgreSQL engine (PGlite).
Other devices on the office network can use `http://<this-computer's-IP>:3000`.
For a shared server, use Docker or a real PostgreSQL server (below).

## Start it with Docker (one line)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Compose) installed and running.

```bash
git clone https://github.com/Nagy-API/Nexora_System.git && cd Nexora_System && docker compose up -d --build
```

Open **http://localhost:3000** and sign in as `shahenda` / `Nexora@2026`.
The database, tables and starting data are created automatically on first start; data is kept between restarts.
Stop with `docker compose down` (add `-v` only if you want to wipe all data).
Other devices on the office network can use `http://<this-computer's-IP>:3000`.

## How the team uses it

- **Everyone lands on "My tasks"** (managers on the Overview) — the work waiting for them from every brand and project,
  with *Everything / Today / This week / This month* filters. Anything posting or due within **48 hours** is highlighted 🔥
  and sits at the top. Finished work leaves the list but is counted (and compared with last month).
- **Content** writes on the month's Canva (each item has a slide number) and sends it on: Reels go to **Pre-production**
  (or straight to editing), Posts/Carousels to **Graphic Design**.
- **Pre-production**: the shoot day, time, how long and where — then *Shooting done → send to editing*.
- **Post-production & Graphic Design** send **versions**: paste the Drive link to v1 → the content creator (or a manager)
  **approves** it and it moves on by itself, or **requests changes** with a comment → v2 opens, and so on.
- **Social** pastes each platform's live link → that platform is Published; when all planned platforms are live the item is done.
- **Status like the old sheet**: Not started → Processing → Adjusting → Waiting approval (set automatically where possible).
- **Managers** (Shahenda, Ammar, Ayman, Assem — star ⭐ on their photo) **give tasks** to anyone, once or repeating every
  day/week/month (the next one is created when it's done), choose who does a step, set deadlines (locked once set — only the
  admin changes them), see the **Dashboard**, **Activity log** and everyone's numbers, and **export Excel reports**.
- **Team chat** for everyone, with **@mentions**; @Name also works in comments. Both notify the person.
- **Notifications** (the bell + optional desktop pop-ups): new task, approvals, changes requested, mentions, deadlines,
  finished; plus live reminders for late work and anything due in the next 48 hours.
- **Default people per brand and step** (Settings → Brands), e.g. Shooting → Ayman, Editing → Jana, Design → Gannah, Social → Esraa.
- **One-off projects** are assigned to a content creator (they write and approve every deliverable) and can be deleted/restored.
- **Profile photos**: Settings → My account → Upload a photo.
- **Delete** is available on items, projects, tasks, comments and chat messages; history is always kept.

## Use it for another company

Name, colours and logos live in one file: **`src/config/brand.ts`** (plus the images in `public/brand/`).
A clean install for a new company (admin account only, no NEXORA data) starts with `SEED_DEMO=0`.
See [WHITE-LABEL.md](WHITE-LABEL.md).

## Stack

- Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4
- PostgreSQL 14+ with Drizzle ORM (SQL migrations in `drizzle/`)
- Username + password auth: Argon2id hashes, random session tokens stored hashed in the DB, httpOnly cookies
- Vitest (domain + database integration tests) and Playwright (browser acceptance tests)

## Run it without Docker

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npm run db:migrate            # creates the schema
npm run db:seed               # team, brands, platforms, Vanilla Roza · October 2026
npm run dev                   # http://localhost:3000
```

Production: `npm run build && npm start`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | no | PostgreSQL connection string. Unset (or `file:<folder>`) = built-in local database in `./local-data` |
| `SEED_DEFAULT_PASSWORD` | no | Initial password for every seeded account (default `Nexora@2026`) |
| `INSECURE_COOKIES` | no | Set to `1` only if production runs over plain HTTP (e.g. office LAN without TLS) |
| `TEST_DATABASE_URL` | tests | Database used by `npm test` (never your real one) |

### Seeded accounts

All use `SEED_DEFAULT_PASSWORD`. Everyone should change it under **Settings → My account**.

| Username | Person | Team(s) |
| --- | --- | --- |
| `shahenda` | Shahenda — CEO, account admin | Leadership, Social Media |
| `assem` | Assem | Account Management |
| `ammar`, `king`, `kemo` | Content creators | Content Creation |
| `ayman` | Ayman | Media Production |
| `jana` | Jana | Media Production (with Ayman) |
| `gannah` | Gannah | Graphic Design |
| `esraa` | Esraa | Social Media |

Only admins (Shahenda, or anyone she grants it to) can create, edit, deactivate accounts or reset passwords.
There is no public sign-up.

## Checks

```bash
npm run lint && npm run typecheck
npm test                      # uses TEST_DATABASE_URL
```

Browser acceptance tests change data, so run them against a throwaway database:

```bash
createdb nexora_e2e
DATABASE_URL=postgres://…/nexora_e2e npm run db:migrate
DATABASE_URL=postgres://…/nexora_e2e SEED_FORCE_PASSWORD_CHANGE=0 npm run db:seed
npm run build && DATABASE_URL=postgres://…/nexora_e2e npx next start -p 3001
E2E_BASE_URL=http://localhost:3001 npm run test:e2e
```

## Where things live

- `src/domain/workflow.ts` — the rules: routes, lateness, deadline shifting, social completion (pure, unit-tested)
- `src/server/workflow.ts`, `src/server/items.ts`, `src/server/admin.ts` — every change, transactional and logged
- `src/server/queries.ts` — read models for the screens
- `src/app/(app)/…` — pages; `src/app/actions.ts` — server actions
- `drizzle/0001_activity_log_immutable.sql` — the trigger that makes the history append-only

## Notes

- Dates and "today" are Africa/Cairo. Weeks start on Saturday.
- Canva: each item stores a direct link to its page (e.g. `canva.link/…`). Automatic import from Canva is not included —
  the Canva Connect API needs a registered/reviewed integration and OAuth per user, and does not reliably expose page
  titles. Instead, **Add content → Paste a list** reads a whole month pasted from Canva, the old Excel sheet or a message
  (titles, links, dates, times and types are detected; "OFF" lines are skipped) with a preview before saving.
