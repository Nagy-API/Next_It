<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NEXORA Ops — guide for AI coding tools (Claude Code, Codex, Cursor…) and developers

> Read this whole file before changing anything. It explains what the system is, how every part fits,
> where each thing lives, the rules that must never break, and step-by-step recipes for common changes.
> Keep it up to date: when you change behaviour, update the matching section here in the same commit.

## 1. What this system is

**NEXORA Ops** is the private operations app of NEXORA (a creative/social-media agency in Cairo). It replaced an
Excel "content tracker". Every piece of content (Reel, Static post, Carousel, Story) moves through a fixed cycle of
steps; each step belongs to a team; finishing a step hands the work to the next team automatically, with the time
and the person recorded. Nothing is anonymous and history cannot be rewritten.

People and roles (seeded in `src/server/seed.ts`, managed in Settings → People):

| Person | Team(s) | Role |
| --- | --- | --- |
| Shahenda | leadership, social | CEO — **admin** + manager |
| King | content | Content creator — also **IT: admin + manager** (full access, same position) |
| Ammar | content | Content lead — manager |
| Kemo | content | Content creator |
| Ayman | media | Media Production lead — manager (does shooting by default) |
| Jana | media | Video editor (post-production by default) |
| Gannah | design | Graphic designer (in the Media Production department) |
| Esraa | social | Social media |
| Assem | account | Account manager — manager (delivers one-off projects) |

Brands (monthly plans): Vanilla Roza & Enlighten by Shahenda (King), NEXORA & OG Hub (Ammar), Blissify & Blissify Academy (Kemo).
One-off projects (e.g. SINAI) are client jobs that end in **Delivered** instead of being published.

## 2. Commands

```bash
npm install
npm run local          # easiest: built-in database (PGlite) in ./local-data, builds once, opens http://localhost:3000
npm run dev            # dev server (needs DATABASE_URL, or uses ./local-data)
npm run build          # production build
npm start              # production: next start (scripts/production.mjs); the server migrates + seeds itself on start
npm run lint && npm run typecheck   # typecheck uses tsconfig.check.json (includes tests/scripts); the build's tsconfig.json excludes them
npm test               # unit/integration tests (vitest) — needs TEST_DATABASE_URL (PostgreSQL)
npm run test:e2e       # browser tests (Playwright) — run against a FRESH seeded database, see §11
npm run db:generate    # after editing src/db/schema.ts → new SQL migration in drizzle/ (+ embeds it in src/db/migrations.generated.ts)
npm run db:migrate     # apply migrations
npm run db:seed        # first-time data (safe to repeat; only one-time upgrades run later)
node scripts/restore.mjs <backup.tar.gz> [folder]   # restore a built-in-database backup (app stopped)
```

Windows: `start-nexora.bat` (downloads a private Node.js if needed, installs, runs `npm run local`).
Default password for seeded accounts: `SEED_DEFAULT_PASSWORD` (default `Nexora@2026`); everyone must change it at first sign-in.

## 3. Languages & libraries — what each is used for

| Language / tool | Used for |
| --- | --- |
| **TypeScript** | All application code: rules, server logic, pages, components, tests |
| **React 19 + Next.js 16 (App Router)** | Pages, server components, **server actions** (all writes), API routes, `src/proxy.ts` (was "middleware") |
| **SQL / PostgreSQL** via **Drizzle ORM** | Database schema (`src/db/schema.ts`), migrations (`drizzle/*.sql`), queries |
| **PGlite** (`@electric-sql/pglite`) | Built-in PostgreSQL (WebAssembly) stored in a folder — no DB server needed |
| **Tailwind CSS v4** | Styling; colour tokens in `src/app/globals.css` (`@theme`) |
| **lucide-react** | Icons |
| **@node-rs/argon2** | Password hashing (Argon2id) |
| **exceljs** | Excel exports |
| **Vitest / Playwright** | Unit-integration tests / browser acceptance tests |
| **Batch + PowerShell** | `start-nexora.bat` (Windows one-click) |
| **Docker / YAML** | `Dockerfile`, `docker-compose.yml` |

## 4. Where everything lives

```
src/
  config/brand.ts        ← BRANDING: company name, app name, colours, logo paths (the ONLY place to rebrand)
  proxy.ts               ← runs before every page: sign-in redirect + per-request CSP nonce
  app/
    layout.tsx           ← root HTML; injects brand colours; forces per-request rendering (CSP nonce)
    globals.css          ← Tailwind v4 theme tokens (colours, shadows, fonts)
    actions.ts           ← ALL server actions (form handlers). Thin: parse FormData → call src/server/* → message
    login/               ← sign-in page + form
    privacy/             ← public privacy & security policy
    (app)/               ← everything behind sign-in (shared layout = sidebar/top bar)
      layout.tsx         ← loads user, counts, people; shows FirstPassword screen when a password is temporary
      first-password.tsx ← "choose your own password" screen
      my-work/           ← My tasks (per person): content tasks, tasks from managers, approvals, filters
      overview/          ← personal "move now (48h)" + pipeline; agency sections for managers
      chat/              ← Team chat (page + client room with @mentions, polling /api/chat)
      stats/             ← Dashboard (managers)
      activity/          ← Activity log (managers)
      brands/            ← brand list + month plan (list/calendar, filters, month Canva/Drive links)
      items/[id]/        ← one content item: stepper, current step panel, versions, platforms, comments, history
      projects/          ← one-off clients & projects (owner, delete/restore)
      add/               ← add content (rows or "Paste a list" with preview)
      team/              ← people directory; team/[username] = personal numbers (self or managers)
      settings/          ← Brands (default people per step), People (admins), Platforms, My account
      work/, search/     ← all open work with filters; search
    api/
      notifications/     ← bell feed (GET, polled every 30 s)
      chat/              ← new chat messages since a time (GET, polled every 4 s)
      avatar/[id]/       ← profile photos (signed-in only)
      export/dashboard, export/person/[username] ← Excel downloads
      backup/            ← admin: download a full backup (built-in database)
  components/            ← UI. handoff.tsx = task cards + step panels (content/shoot/versions/social);
                           shell.tsx = sidebar/top bar; bell.tsx; tasks.tsx; comments.tsx; charts.tsx;
                           avatar.tsx (photos + manager star); client.tsx (ActionForm, Modal, Popover, toasts)
  domain/                ← PURE rules, no database: workflow.ts (stages, routes, deadlines, health),
                           permissions.ts (who can do what)
  server/                ← everything that reads/writes the database
    workflow.ts          ← stage transitions: complete/hand-off, send back, assign, deadlines, versions, shoot
    items.ts             ← create/update/delete items, comments, bulk actions, month links
    tasks.ts             ← manager tasks (one-off / repeating)
    chat.ts              ← Team chat + @mention parsing
    admin.ts             ← brands, projects, platforms, people, photos
    queries.ts           ← read models (WorkItem with stages/versions/platforms/health), activity, insights
    stats.ts             ← dashboard numbers, month-over-month, bell alerts, notifications
    notify.ts            ← writes notifications (same transaction as the change)
    activity.ts          ← writes the immutable activity log
    auth.ts, sessions.ts ← sign-in cookie, sessions (hashed tokens), current user
    security.ts          ← sign-in lock-outs, client IP; lib/passwords.ts = password rules, safe redirects
    export.ts            ← Excel workbooks
  db/schema.ts           ← ALL tables (Drizzle). db/index.ts = PostgreSQL or PGlite connection; db/local.ts = PGlite lock, backups, self-healing
  lib/                   ← dates (Cairo timezone), paste parser, ranges, passwords
drizzle/                 ← SQL migrations, in order. Never edit an applied migration — add a new one. Embedded in src/db/migrations.generated.ts.
scripts/                 ← migrate, seed (thin wrapper), local.mjs, production.mjs, restore.mjs
tests/                   ← *.test.ts (vitest, real PostgreSQL) and e2e/acceptance.spec.ts (Playwright)
docs/                    ← SECURITY.md, DEPLOY-HOSTINGER.md
```

## 5. Data model (src/db/schema.ts)

- **users** — username, name, title, `teams[]` (leadership/content/media/design/social/account), `isAdmin`, `isManager`,
  `passwordHash` (Argon2id), `mustChangePassword`, `avatar` (data URL), `chatReadAt`, `isActive`.
- **sessions** — `id` = SHA-256 of the cookie token (raw token never stored), `expiresAt`.
- **login_attempts** — every sign-in attempt (for lock-outs).
- **brands** — name, colour, default person per step: `defaultCreatorId` (content), `defaultShootId`, `defaultMediaId` (editing), `defaultDesignId`, `defaultSocialId`.
- **content_plans** — one per brand + month; month `canvaUrl` and `driveFolderUrl`.
- **clients / projects** — one-off work; `projects.ownerId` (content person), `deletedAt`.
- **content_items** — title, type (reel/static/carousel/story), plan XOR project, `canvaUrl`, `driveUrl` (latest file),
  posting date/time, `slideNumber`, shoot date/time/duration/location, `completedAt`, `cancelledAt` (= deleted).
- **stages** — one row per step of an item: `kind` (content, shooting, media, design, social, delivery), `position`,
  `status` (waiting/active/done), `assigneeId`, `deadline` + `originalDeadline` + `shiftDays` (automatic delay shifts),
  `round` (+1 each send-back), `progress` (not_started/processing/adjusting/waiting_approval), exception fields.
- **stage_completions** — append-only fact per completion (credited person, lateness, round) → fair statistics.
- **versions** — v1, v2… per media/design step: url, note, status (pending/approved/changes/replaced), reviewer.
- **platforms / item_platforms** — per-platform publishing status, date, live link.
- **comments** — threads (one level), `mentionUserId` (waits for their reply), `resolvedAt`, `deletedAt`.
- **tasks** — manager-given tasks: assignee, due, `recurrence` (none/daily/weekly/monthly), `seriesId`, `doneAt`, `deletedAt`.
- **chat_messages** — Team chat, `mentions[]`, `deletedAt`.
- **notifications** — per person; `kind`, `title`, `body`, `itemId` or `href`, `readAt`.
- **activity_log** — IMMUTABLE history (a DB trigger in `drizzle/0001_activity_log_immutable.sql` rejects UPDATE/DELETE/TRUNCATE).

## 6. The workflow (src/domain/workflow.ts + src/server/workflow.ts)

Routes by type (`routeFor`):
- Reel: **content → shooting (Pre-production) → media (Post-production / editing) → social → Published**
- Static / Carousel: **content → design → social**
- Story: **content → social**
- One-off project: same, but the last step is **delivery** (no social) → **Delivered**.

Hand-off (`handOff`): the person finishes their step and it goes to the next one. Content may choose the target
(`handoffTargets`: shooting, media (skip shooting), design, social/delivery); the route is rebuilt (`rerouteTx`).
Completing a step (`completeStageTx`) records who/when, credits the assignee, measures lateness, shifts downstream
deadlines by the delay (once — `propagatedDelayDays`), activates the next step, resets its progress, notifies the
next person (or the whole team if nobody is assigned), and logs everything.

Versions & approval (post-production and design, `isReviewed(kind)`): the editor/designer calls `submitVersion`
(Drive link) → progress becomes *Waiting approval* and the reviewer is notified (the item's content creator / project
owner, else managers). `reviewVersion` approve → the step completes automatically (lateness measured at upload time);
request changes (note required) → progress *Adjusting*, a comment is added, the next version opens. Completing a
reviewed step directly (`completeStage`/`handOff`) is allowed only for reviewers (managers/content) as an override.

Deadlines: only managers set them; once set only the admin changes them (`setStageDeadlineTx`). A step that hasn't
received the work is never "late" (`stageHealth` → blocked/waiting). Admin can mark lateness as an exception.
Send back (`returnToStage`): anyone, to an earlier step, optional note → that step reopens (round+1, *Adjusting*),
later steps go back to waiting, the person is notified.
Social: pasting a live link marks that platform Published; when every planned platform is published the item is
done automatically; un-publishing reopens Social.
"Hot": posting or current deadline within 48 hours (`isHot` in queries.ts) → highlighted and sorted first.

## 7. Permissions (src/domain/permissions.ts) — always enforced on the server

`isManager(w) = w.isAdmin || w.isManager`.

| Action | Who |
| --- | --- |
| Do a step (`doStage`) | the assignee, the step's team, admin; delivery: account/content/managers |
| Choose who does a step (`assign`) | managers (anyone can "take" unassigned work of their own team) |
| Set a deadline | managers — change/remove a set one: admin only |
| Approve versions (`review`) | managers + content team |
| Add/edit/delete content (`editContent`) | managers + content |
| Posting date | managers + content + social |
| Shoot plan | managers + media + content |
| Publishing (platforms) | managers + social |
| Give tasks, Dashboard, Activity log, everyone's numbers, dashboard export | managers |
| Brands, people, platforms, backups | admin |
| Comment, chat, send back | everyone |

Rules: every server function asserts its permission itself (never rely on hiding a button). Pages redirect when
not allowed (e.g. `/activity`, `/stats`). Add new permissions to `can` and use them in both the server function and the UI.

## 8. Things that happen automatically (don't make people do them)

Content with a Canva link is delivered on creation; next step activates on completion; brand default person per
step is assigned; the only member of a team gets the work; whoever finishes an unassigned step gets the credit;
deadlines shift for upstream delays; *Adjusting* on send-back / changes; *Waiting approval* on version upload;
Published when all platforms are live; repeating tasks create the next one; slide numbers continue per month;
notifications for new work, approvals, changes, mentions, deadlines, finished; bell alerts for late / due / 48h.

## 9. Branding — how to rebrand (for NEXORA or another company)

Edit **only** `src/config/brand.ts` (`BRAND.name`, `appName`, `tagline`, `adminContact`, `colors.primary`,
`colors.dark`, `logos.*`) and replace images in `public/brand/` + `src/app/icon.png` / `apple-icon.png`.
`brandCss()` turns the two colours into the whole palette. NEXORA identity: navy `#0B1639`, electric blue `#3B82F6`
— don't introduce other brand colours. Status colours (ok/warn/bad/back) live in `globals.css`. See WHITE-LABEL.md.
There is intentionally **no** in-app branding screen.

## 10. Security & privacy — rules that must never be weakened (details: docs/SECURITY.md)

- Passwords: Argon2id; policy in `src/lib/passwords.ts` (10+ chars, mixed, not common, not the username);
  temporary passwords (new accounts, admin resets, seeded accounts) force a change at first sign-in
  (`mustChangePassword`, enforced in `(app)/layout.tsx` and in `run()` in actions.ts).
- Sign-in: 5 failures per username / 30 per IP in 15 min → locked (`src/server/security.ts`); same error for unknown
  users and wrong passwords; constant-time-ish dummy hash; only same-site redirects (`safeNext`).
- Sessions: random 32-byte token in an httpOnly, SameSite=Lax cookie (Secure in production), only its SHA-256 stored;
  14 days, renewed while used; password change signs out other devices; "Sign out on all devices".
- Headers: per-request CSP with nonce + `strict-dynamic` (`src/proxy.ts`), no framing, nosniff, HSTS, strict referrer,
  permissions policy (`next.config.ts`). Pages render per request (root layout reads headers) so the nonce works.
- Server actions only (Next checks Origin); every write goes through `run()` → permission checks in src/server/*.
- Inputs: links go through `normalizeUrl` (http/https only); uploads are image data URLs with type+size checks; SVG not allowed.
- Activity log is append-only at the database level. Deleting = soft delete; history kept.
- No third-party scripts, analytics or trackers; fonts self-hosted by next/font.
- Secrets only in environment variables — never commit `.env`. The repo is private.
When adding features: check permissions in the server function, log to activity in the same transaction,
validate every input, never render user HTML (`dangerouslySetInnerHTML` only for our own CSS), never add external
scripts/CDNs (the CSP will block them anyway — don't loosen it).

## 11. Testing

- `npm test` — vitest against PostgreSQL (`TEST_DATABASE_URL`); tests never delete data (activity log is immutable),
  every fixture has a unique suffix (`tests/helpers.ts`: `makeUser`, `makeManager`, `makeBrand`).
- `npm run test:e2e` — Playwright, serial scenarios through the real UI as each person. Needs a fresh database seeded
  with `SEED_FORCE_PASSWORD_CHANGE=0`, a production build and `E2E_BASE_URL`:
  ```bash
  createdb nexora_e2e && export DATABASE_URL=postgres://…/nexora_e2e
  npm run db:migrate && SEED_FORCE_PASSWORD_CHANGE=0 npm run db:seed
  npm run build && SEED_FORCE_PASSWORD_CHANGE=0 npx next start -p 3001 &
  E2E_BASE_URL=http://localhost:3001 npm run test:e2e
  ```
- Before every commit: `npm run lint && npm run typecheck && npm test`, and the e2e suite for UI changes.

## 12. Recipes

**Add a field to content items** → add the column in `schema.ts` → `npm run db:generate` → include it in
`WorkItem`/`enrich` (queries.ts) → update `updateItem` (items.ts) with validation + activity log → form in
`items/[id]/parts.tsx` → action field in `updateItemAction` → test.

**Add a workflow step** → add the kind to `STAGE_KINDS` (schema; migration adds the enum value) → `STAGE_META`,
`routeFor`, `handoffTargets`, `routeAfter` (workflow.ts) → `STAGE_TEAM` (notify.ts and queries.ts) → default person
column on brands if needed + `defaultAssigneeTx` → UI panel in `handoff.tsx` (`QuickAction`, `HandOffPanel`) → stepper
(`flow.tsx`) → pipelines (`overview`, `bulk-list`, `work`) → tests.

**Add a permission** → add to `can` in permissions.ts → assert it in the server function → use it to show/hide UI → test.

**Add a page** → folder under `src/app/(app)/…/page.tsx` (server component; `await requireUser()`; check permission;
`PageProps<"/route">` types come from `npx next typegen`) → link in `components/shell.tsx`.

**Add a notification type** → extend `NotificationKind` (notify.ts) → call `notify(tx, actor, userIds, {...})` inside
the same transaction → icon in `bell.tsx`.

**Change people / defaults for a fresh install** → `src/server/seed.ts` (TEAM, MANAGERS, BRANDS). For EXISTING installs
add a one-time upgrade function guarded by an activity-log marker (see `kingFullAccess`) — never overwrite choices
people made in Settings.

**Change colours / logo / name** → §9.  **Timezone** → `TIMEZONE` in `src/lib/dates.ts`.

## 13. Deployment & Git

- GitHub repo `Nagy-API/Nexora_System` (private). Work on a branch → pull request → merge to `main`.
  Commit messages explain *why*. Never commit `.env`, `local-data/`, backups or `node_modules`.
- Hostinger (Node.js web app on `ops.nexoraaagency.com`): step-by-step in **docs/DEPLOY-HOSTINGER.md**.
- Docker: `docker compose up -d --build` (PostgreSQL + app). Any VPS: `npm ci && npm run build && npm start`.
- Data safety: the built-in database folder must live OUTSIDE the app folder in production
  (`src/db/index.ts` defaults to `~/nexora-ops-data` when the server runs in production without `DATABASE_URL`). Automatic backups go to `~/nexora-ops-data-backups`; admins can also download one in My account; restore by hand with
  `node scripts/restore.mjs`.

## 14. Gotchas

- **`npm run build` uses webpack (`next build --webpack`), on purpose.** On Hostinger the Turbopack build crashed on `globals.css`
  ("node process exited before we could connect to it") — the host restricts the child processes Turbopack starts for PostCSS.
  Webpack handles the CSS in-process, and `next.config.ts` builds with one process (`experimental.cpus: 1, workerThreads: true`).
  Local `npm run dev` still uses Turbopack. Don't switch the build back without testing on Hostinger.

- **Build tools must stay in `dependencies`** (`tailwindcss`, `@tailwindcss/postcss`, `typescript`, `@types/*`): hosts that install with
  `NODE_ENV=production` skip devDependencies, and the build then dies (Turbopack "PostCSS" crash). Keep test/lint tools (`vitest`,
  `playwright`, `eslint`, `drizzle-kit`) in devDependencies, and keep `tests/`, `scripts/` and tool configs excluded from `tsconfig.json`.
  Verify with `NODE_ENV=production npm ci && npm run build`.

- **The server prepares its own database.** `src/instrumentation.ts` → `prepareDatabase()` (`src/server/setup.ts`) runs the
  migrations and `seed()` before the first request. Hostinger deploys only `.next`, `node_modules`, `public` and `package.json`
  (no `drizzle/` folder), so the migrations are embedded in `src/db/migrations.generated.ts` by `scripts/embed-migrations.mjs`
  (runs in `npm run build` and `npm run db:generate`; a test fails if it's stale). Hostinger runs plain `next start`
  (not `npm start`), so never move this back into a start script only. If it fails the server refuses to start — read the runtime log.
  `.env` is loaded by Next too: a local `.env` with a PostgreSQL `DATABASE_URL` wins over the built-in database.
- This is **Next.js 16**: `src/proxy.ts` (not middleware), async `params`/`searchParams`, route types from `next typegen`.
  Read `node_modules/next/dist/docs/` before using an API you're unsure about.
- **PGlite is single-process — two processes on one folder corrupt it for good** ("PANIC: could not locate a valid checkpoint
  record" → `Aborted()`). It happened on Hostinger, which starts the new server before the old one stops. `src/db/local.ts`
  guards it: a lock file `<folder>.lock` (one owner; a newer process asks the older one to hand over after 10 s, and the older one
  closes cleanly and exits), automatic backups every 10 min when the work changed (`<folder>-backups`, last 30), and self-healing
  at start (a folder that won't open is renamed `<folder>.broken-<time>` — never deleted — and the newest backup is restored).
  Never open the folder with `new PGlite(...)` anywhere else, and don't run scripts against it while the app runs (they refuse).
- `revalidatePath("/", "layout")` after writes is done by `run()`.
- UI text is English (the team asked for it). Egyptian-Arabic is only used when talking to the owner.
- Popovers and modals render in a portal (client.tsx) so containers never clip them — keep it that way.
