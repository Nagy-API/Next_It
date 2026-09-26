# NEXORA Ops

NEXORA's internal content operations system — replaces the Excel content tracker.

Every Reel, Static, Carousel and Story moves through a fixed cycle that the system knows from its type:

| Work | Route |
| --- | --- |
| Monthly Reel | Content → Media Production → Social Media → **Published** |
| Monthly Static / Carousel | Content → Graphic Design → Social Media → **Published** |
| Monthly Story | Content → Social Media → **Published** |
| One-off project deliverable | Content → Media / Design → **Delivered** (no Social) |

Completing a stage records who and when, hands the work to the next stage, and — if it was late — moves the next
stages' deadlines by the same delay so nobody is blamed for waiting. Anyone can send work back to an earlier stage
with an optional note. Social publishing is tracked per platform; the item is Published once every planned platform is live.
Every change is written to an append-only history that the database refuses to edit or delete.

## Start it (one line)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Compose) installed and running.

```bash
git clone https://github.com/Nagy-API/Nexora_System.git && cd Nexora_System && docker compose up -d --build
```

Open **http://localhost:3000** and sign in as `shahenda` / `Nexora@2026`.
The database, tables and starting data are created automatically on first start; data is kept between restarts.
Stop with `docker compose down` (add `-v` only if you want to wipe all data).
Other devices on the office network can use `http://<this-computer's-IP>:3000`.

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
| `DATABASE_URL` | yes | PostgreSQL connection string |
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
| `jana` | Jana | Media Production, Graphic Design |
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
DATABASE_URL=postgres://…/nexora_e2e npm run db:seed
npm run build && DATABASE_URL=postgres://…/nexora_e2e npm start -- -p 3001
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
