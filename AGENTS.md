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
| Kemo | content | Content creator — also **IT: admin + manager** (like King) |
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
  config/brand.ts        ← BRANDING DEFAULTS (owners change them without code in Settings → Workspace)
  proxy.ts               ← runs before every page: sign-in redirect + per-request CSP nonce
  app/
    layout.tsx           ← root HTML; injects brand colours; forces per-request rendering (CSP nonce)
    globals.css          ← Tailwind v4 theme tokens (colours, shadows, fonts)
    actions.ts           ← server actions (form handlers). Thin: parse FormData → call src/server/* → message
    space-actions.ts     ← server actions for Spaces and their dashboards (same run() pattern)
    login/               ← sign-in page + form
    privacy/             ← public privacy & security policy
    (app)/               ← everything behind sign-in (shared layout = sidebar/top bar)
      layout.tsx         ← loads user, counts, people; shows FirstPassword screen when a password is temporary
      first-password.tsx ← "choose your own password" screen
      my-work/           ← My tasks (per person): posting today, my shoots, my brands first, each brand by day (or my own
                           drag order, personal_order); approvals; "Sent, waiting approval"
      overview/          ← "The agency today": tiles, Big updates, Posting today, shoots today/tomorrow, move now (48h),
                           Team right now, mood / kudos / birthdays / stars (module "fun"), pipeline, brands
      shoots/            ← Shoot schedule (week / month / list): item shoots + standalone slots (several per day), crew, notes;
                           « » a month, ‹ › a day; phones get a day strip / dot calendar with the picked day's list;
                           an item's planned day can be cancelled (here or on its Pre-production step)
      tasks/             ← (removed: Day tasks) redirects to My tasks
      spaces/            ← Spaces (workflow builder): list (+ deleted spaces to restore), new/ = the template library
                           (space / whiteboard / doc / sheet, by shelf, with previews), [id] (tabs: Tasks + its pages;
                           List / Board / Calendar; lists as one row; one Filter button; "+" column picker),
                           [id]/settings, [id]/t/[taskId] (one task), [id]/p/[pageId] (a doc, whiteboard or sheet)
      dashboards/        ← Spaces dashboards: build one (scope + cards), [id] = live view
      quick/             ← Quick update: a whole step at once (paste a list of links → Save all), every team
      reports/           ← Reports (managers): People / Brands for today, a week, a month; Excel
      chat/              ← Team chat (page + client room with @mentions, photos/PDF/any file, polling /api/chat)
      stats/             ← Dashboard (managers)
      activity/          ← Activity log (managers)
      brands/            ← brand list + month plan (list/calendar, filters, month Canva/Drive links)
      items/[id]/        ← one content item: stepper, current step panel, versions, platforms, comments, history
      projects/          ← one-off clients & projects (owner, delete/restore)
      add/               ← add content (rows or "Paste a list" with preview)
      team/              ← people directory; team/[username] = personal numbers (self or managers)
      settings/          ← Workspace (white label, modules, auto pause), Messages (daily message lines + Big updates),
                           Access (per-person permissions), Brands (default people per step, deleted brands to restore),
                           People, Platforms, My account (photo, birthday, password) — tabs by permission
      work/, search/     ← all open work with filters; search
    api/
      notifications/     ← bell feed (GET, polled every 30 s)
      chat/              ← new chat messages since a time + who's online + who's typing + reactions (GET, polled every 3 s);
                           chat/typing (POST "I'm typing", kept 6 s in memory)
      avatar/[id]/       ← profile photos (signed-in only); brand-logo/[id]/ = brand logos (cached by hash)
      files/             ← POST upload (25 MB, allowed types only); files/[id]/ = open/download (signed-in only)
      export/dashboard, export/person/[username] (?from&to), export/report, export/plan (?brand&m: one brand's month:
                           title, posting date, Canva slide link…) ← Excel downloads
      backup/            ← admin: download a full backup (built-in database)
      workspace-asset/[key] ← the workspace's uploaded logos (public: the sign-in page shows them)
  components/            ← UI. handoff.tsx = task cards + step panels (content/shoot/versions with options/social),
                           ProgressPicker + ChangesBanner; send-back.tsx; attachments.tsx; date-input.tsx (dd/mm/yyyy);
                           platform-icon.tsx (app marks); notes-bar.tsx; report-parts.tsx; scroll-memory.tsx;
                           shell.tsx = sidebar (resizable + hideable, cookie "sb"; ⋯ menus to delete a brand / space with
                           typed name, danger.tsx) + top bar (greeting, daily message, search, theme-toggle.tsx, bell);
                           back-link.tsx (Back goes where you came from); inline-edit.tsx (rename / re-date in place);
                           people.tsx (Big updates, reactions, mood, kudos); reorder.tsx; shoots.tsx;
                           pages/ (doc-editor, whiteboard, sheet-editor); spaces/field-picker.tsx;
                           bell.tsx; tasks.tsx; comments.tsx; charts.tsx;
                           avatar.tsx (photos + manager star / role label); client.tsx (ActionForm, Modal, Popover, toasts)
  domain/                ← PURE rules, no database: workflow.ts (stages, routes, deadlines, health), shoot.ts (times),
                           pages.ts (doc / whiteboard / sheet content + cleanContent), page-templates.ts,
                           space-templates-extra.ts (more spaces + ALL_SPACE_TEMPLATES), field-formula.ts, priority.ts,
                           permissions.ts (who can do what: PERMISSIONS keys + defaults + per-person overrides),
                           spaces.ts (status kinds, priorities, column types, templates, automation catalogue)
  server/                ← everything that reads/writes the database
    workflow.ts          ← stage transitions: complete/hand-off, send back, assign, deadlines, versions, shoot
    items.ts             ← create/update/delete items, comments, bulk actions, month links
    tasks.ts             ← manager tasks (one-off / repeating); without a brand they show in My tasks
    attachments.ts       ← files & links on items and tasks (files on disk next to the database, see §5)
    reports.ts           ← people report (finished, time, from–to per day, open) and brands report
    notes.ts             ← team notes (12 h); quick.ts = Quick update (many rows through the normal workflow)
    chat.ts              ← Team chat + @mention parsing; files on messages; deleting a message removes its files
                           and the poll's `recent` ids make it disappear for everyone
    notebook.ts          ← My notebook (private notes), owner-only
    admin.ts             ← brands, projects, platforms, people, photos
    queries.ts           ← read models (WorkItem with stages/versions/platforms/health), activity, insights
    stats.ts             ← dashboard numbers, month-over-month, bell alerts, notifications
    notify.ts            ← writes notifications (same transaction as the change)
    activity.ts          ← writes the immutable activity log
    auth.ts, sessions.ts ← sign-in cookie, sessions (hashed tokens), current user
    security.ts          ← sign-in lock-outs, client IP; lib/passwords.ts = password rules, safe redirects
    export.ts            ← Excel workbooks
    settings.ts          ← workspace settings (name, colours, logos, watermark, modules, auto pause), cached in memory
    access.ts            ← Settings → Access (permission overrides; someone always keeps "Manage access")
    auto-pause.ts        ← every 5 min: stops clocks left running past the pause time; runs due-date automations
    time.ts              ← correcting worked time (edit / add / remove a stretch), logged
    fun.ts               ← Big updates, daily message (Settings → Messages, never shows who wrote it), reactions, kudos,
                           moods, birthdays, stars of the week
    shoots.ts            ← shoot schedule (item shoots + slots), "shot" → editing item / task for the editor
    pages.ts             ← docs / whiteboards / sheets in spaces (create, autosave, rename, copy, delete)
    order.ts             ← each person's own order in My tasks
    spaces.ts            ← Spaces: spaces, members, statuses, folders, lists, columns, tasks, subtasks, comments,
                           the task clock and the automations engine (fire / runAction, max 3 levels deep)
    dashboards.ts        ← Spaces dashboards (scope + widgets), dashboardData() computes everything live
  db/schema.ts           ← ALL tables (Drizzle). db/index.ts = PostgreSQL or PGlite connection; db/local.ts = PGlite lock, backups, self-healing
  lib/                   ← formula.ts (sheet formulas, hand-written parser — never eval), sidebar.ts, dates (Cairo timezone, formatDuration, formatDMY), links.ts (name a link: Canva / Google Doc / Drive…),
                           paste parser, ranges, passwords
drizzle/                 ← SQL migrations, in order. Never edit an applied migration — add a new one. Embedded in src/db/migrations.generated.ts.
scripts/                 ← migrate, seed (thin wrapper), local.mjs, production.mjs, restore.mjs, tracker-to-seed.mjs (Excel → import data)
tests/                   ← *.test.ts (vitest, real PostgreSQL) and e2e/acceptance.spec.ts (Playwright)
docs/                    ← SECURITY.md, DEPLOY-HOSTINGER.md
```

## 5. Data model (src/db/schema.ts)

- **users** — username, name, title, `teams[]` (leadership/content/media/design/social/account), `isAdmin`, `isManager`,
  `roleLabel` (shown instead of "Manager", e.g. "IT"), `passwordHash` (Argon2id), `mustChangePassword`, `avatar` (data URL), `chatReadAt`, `isActive`.
- **sessions** — `id` = SHA-256 of the cookie token (raw token never stored), `expiresAt`.
- **login_attempts** — every sign-in attempt (for lock-outs).
- **brands** — name, colour, `logoUrl` (small PNG data URL, uploaded in Settings → Brands; pages get `/api/brand-logo/<id>?v=<hash>`
  via `brandLogoSrc`, never the image itself), default person per step: `defaultCreatorId` (content), `defaultShootId`, `defaultMediaId` (editing), `defaultDesignId`, `defaultSocialId`.
- **content_plans** — one per brand + month; month `canvaUrl` and `driveFolderUrl`.
- **clients / projects** — one-off work; `projects.ownerId` (content person), `deletedAt`.
- **content_items** — title, type (reel/static/carousel/story), plan XOR project, `canvaUrl` (the content link: ANY link, optional), `driveUrl` (latest file),
  posting date/time, `slideNumber`, shoot date/time/duration/location + extras (`shootPeople`, `shootRentals(Ready)`,
  `shootPurchases(Ready)`, all optional), `completedAt`, `cancelledAt` (= deleted).
- **stages** — one row per step of an item: `kind` (content, shooting, media, design, social, delivery), `position`,
  `status` (waiting/active/done), `assigneeId`, `deadline` + `originalDeadline` + `shiftDays` (automatic delay shifts),
  `round` (+1 each send-back), `progress` (not_started/processing/adjusting/changes_requested/scheduled/waiting_approval/paused),
  `scheduledFor` (the day, when Scheduled), exception fields.
- **work_sessions** — the step's clock: one row per stretch of In progress / Adjusting (`kind`), `startedAt`, `endedAt`,
  `endReason` (sent/done/status/paused/auto_paused/returned/reassigned/cancelled, edited/added). Written by `trackTimeTx`
  (workflow.ts), `autoPauseClocks` and the time corrections in time.ts (`editedById`/`editedAt`), never by hand.
- **attachments** — files and links on an item (`itemId`), a task (`taskId`), a month plan (`planId`, "Month links & files"),
  a chat message (`chatMessageId`) or a private note (`privateNoteId`); files: `storageKey` (random name) in
  `filesDir()` = `<database folder>-files` (production `~/nexora-ops-data-files`, outside the app folder); `deletedAt`.
  A file uploaded with no target waits for its form (chat composer, comment) and is linked by `linkPendingTx`.
- **private_notes** — My notebook (notebook.ts, notebook-actions.ts, components/notebook.tsx; strip bubble, sidebar,
  user menu, key N): title, body, colour, pinned, files. ONLY the owner reads, changes, deletes or opens its files — not
  managers, not admins (checked in notebook.ts, attachments.ts `checkTarget` / `removeAttachment` / `readAttachment`).
- **notes** — team notes: text, colour, `expiresAt` (12 h); one live note per person. **alert_dismissals** — bell reminders
  a person cleared today (`<alertId>@<day>`).
- **stage_completions** — append-only fact per completion (credited person, lateness, round) → fair statistics.
- **versions** — v1, v2… per media/design step: url (+ `altUrls`: more options of the same post), note, status
  (pending/approved/changes/replaced), reviewer, `chosenUrl` (the option approved → becomes the item's `driveUrl`).
- **platforms / item_platforms** — per-platform publishing status, date, live link.
- **comments** — threads (one level), `mentionUserId` (waits for their reply), `resolvedAt`, `deletedAt`.
- **tasks** — manager-given tasks: assignee, due, `recurrence` (none/daily/weekly/monthly), `seriesId`, `status`
  (todo/in_progress/scheduled/waiting — the person picks it; `scheduledDate` for scheduled; done = `doneAt`), `deletedAt`.
- **chat_messages** — Team chat, `mentions[]`, `deletedAt`.
- **notifications** — per person; `kind`, `title`, `body`, `itemId` or `href`, `readAt`.
- **permission_overrides** — per person + key (from `PERMISSIONS`): allow true/false. No row = the default rule.
- **workspace_settings** — key/value: `workspace` (names, colours, watermark, modules, autoPauseAt) and `image.*` (logos).
- **announcements** — Big updates (`title`, `pinned`, `expiresAt`, `deletedAt`); reactions in **reactions**
  (targetKind announcement / chat / kudos + target + user + emoji). **kudos**, **moods** (one per person per day).
- **shoots** — standalone shoot slots: title, brand, day, start/end, location, people, rentals/purchases (+ready), notes,
  crewIds, after none|edit + editorId, status planned|shot|cancelled, itemId/taskId (made when shot). Item shoots use
  content_items `shootDate/shootTime/shootEndTime/shootNotes/shootCrewIds`.
- **space_pages** — docs / whiteboards / sheets in a space: kind, title, icon, content jsonb (only via `cleanContent`).
- **personal_order** — my own order in My tasks (`item:<id>` → position). users: `lastSeenAt` (online), `birthday` (MM-DD).
  brands: `deletedAt` (soft delete with its items; restore). tasks / content_items: `priority` (urgent | important | null).
  attachments: `commentId` (files written with a comment). space_fields: `config` (formula, rollup, button settings).
- **Spaces**: `spaces` (privacy, colour, icon, optional brand), `space_members` (admin/member/viewer), `space_statuses`
  (kind open/active/review/done/closed — active runs the clock, done/closed set `completedAt`), `folders`, `lists`,
  `space_fields` (custom columns: text, number, money, date, dropdown, labels, checkbox, link, email, phone, person,
  rating, progress), `work_tasks` (+ `parentId` for subtasks, `dueFiredAt`), `work_task_assignees`, `work_task_values`,
  `work_task_comments` (`system` = history line / automation), `work_task_sessions` (the task clock),
  `automations` (trigger + actions jsonb, runs), `dashboards` (scope + widgets). Attachments get `workTaskId`.
- **activity_log** — IMMUTABLE history (a DB trigger in `drizzle/0001_activity_log_immutable.sql` rejects UPDATE/DELETE/TRUNCATE).

## 6. The workflow (src/domain/workflow.ts + src/server/workflow.ts)

Routes by type (`routeFor`):
- Reel: **content → shooting (Pre-production) → media (Post-production / editing) → social → Published**
- Static / Carousel: **content → design → social**
- Story: **content → social**
- One-off project: same, but the last step is **delivery** (no social) → **Delivered**.

Hand-off (`handOff`): the person finishes their step and it goes to the next one. Steps can be skipped: content may
choose shooting, media (skip shooting), design or social/delivery; a shoot may go to media, design or social
(`handoffTargets`); the route is rebuilt (`rerouteTx`). The content link is optional and can be any link; content sent
straight to Social can carry the final file (`driveUrl`). Anyone sending work on may pick the next person: themselves or
someone in that step's team (managers: anyone) — `assertMayChoose`.
Completing a step (`completeStageTx`) records who/when, credits the assignee, measures lateness, shifts downstream
deadlines by the delay (once — `propagatedDelayDays`), activates the next step, resets its progress, notifies the
next person (or the whole team if nobody is assigned), and logs everything.

Versions & approval (post-production and design, `isReviewed(kind)`): the editor/designer calls `submitVersion`
(Drive link, optionally more options in `altUrls`) → progress becomes *Waiting approval* and the reviewer is notified (the
item's content creator / project owner, else managers). `reviewVersion` approve (with several options the reviewer must
pick one: `chosenUrl`) → the step completes automatically (lateness measured at upload time); request changes (note
required) → progress *Changes requested*, a comment is added; the person reads it and presses "OK, I'm on it"
(*Adjusting*, the clock runs) or schedules it for a day (*Scheduled*). Completing a
reviewed step directly (`completeStage`/`handOff`) is allowed only for reviewers (managers/content) as an override.

Deadlines: only managers set them; once set only the admin changes them (`setStageDeadlineTx`). A step that hasn't
received the work is never "late" (`stageHealth` → blocked/waiting). Admin can mark lateness as an exception.
Send back (`returnToStage`): anyone, to an earlier step, optional note, optionally choosing who fixes it (themselves or that
team; managers anyone) → that step reopens (round+1, *Changes requested*), later steps go back to waiting, the person is notified.
Time: `trackTimeTx` keeps one open `work_sessions` row while a step is In progress / Adjusting for its person; it closes on
Waiting approval (version sent), done, Scheduled, Paused, send-back, reassignment or delete. **Automatic pause**
(auto-pause.ts, every 5 min): a clock still running at the workspace pause time (default 21:00 Cairo; one started
later pauses at midnight) is closed at that instant and the step reads *Paused*. People with "Edit worked time" (admins;
Assem by default) correct times on the item page ("Time on each step").
Shoot extras (Pre-production): how many people, things to rent / buy, each ticked "ready"; shown in `ShootSummary`.
Shooting never needs "In progress": planning the shoot (day, from–to, who goes, notes) sets the step to *Scheduled* for
that day; "Shooting done" credits the time of the shoot window (work_sessions endReason "shoot") when no clock ran.
Shoot schedule (/shoots): every planned item shoot + standalone slots (several per day, each with brand, people, from–to,
notes). Marking a slot "Shot" with "Send for editing" creates a brand item starting at editing for the editor (or a task).
Every work card shows one "Next:" line (`NextStep` in handoff.tsx). Brand groups in My tasks fold (`fold.tsx`, per device).
Daily message: one line under the greeting in the top bar (never shows who wrote it), lines from Settings → Messages, one per
day in turn (`dailyMessage`, fun.ts). Big updates (fun.ts) show large on the Overview with reactions. Dark mode: `.dark` on
<html> from the cookie "theme" (theme-toggle.tsx); colours are tokens (bg-surface, bg-subtle, bg-hover, bg-sunken, text-ink…)
so pages flip by themselves — never use bg-white or a light hex for a surface. `StageView.time` = total + running.
My tasks hides work that's *Waiting approval* (it's with the reviewer) in "Sent, waiting approval" with the time it took.
The month follows the posting date: an item dated in another month lives in that month's plan (`followPostingMonthTx`,
on create and on date change; a one-time upgrade moved older items — marker `plans_follow_posting_date`).
Social: pasting a live link marks that platform Published; when every planned platform is published the item is
done automatically; un-publishing reopens Social. Every planned platform scheduled (or live) → the Social step reads
*Scheduled* (with the first date) from outside.
Posting today is highlighted everywhere (rows, item status, Overview "Posting today", My tasks "it's your turn").
"Hot": posting or current deadline within 48 hours (`isHot` in queries.ts) → highlighted and sorted first.
Reviewer of a version: the item's content creator, else the brand's default content creator (`reviewersFor`, `WorkItem.reviewerId`).

**Extra tasks** ("Give a task" + a brand → `createExtraTasks`, items.ts): the task becomes a real item in that brand's plan for
the month it was given, with `content_items.extra_requested_by_id` = the manager who gave it. It starts at the chosen step
(content / shooting / editing / design / social — earlier steps are skipped, e.g. editing → `[media, social]`), assigned to the
person with the deadline, and then works like any item (links, versions, approval, next steps, statistics). Brand pages, the
brands list, the Overview and the Dashboard count the plan WITHOUT extras and show extras on their own ("+N extra").
A task without a brand stays a simple to-do (tasks.ts, can repeat).

**Order in My tasks**: one group per brand — "My brands" first (brands where the person is a default person for any step,
`myBrandIds`), then the other brands, then one-off projects; inside a brand, by day (posting date, else the step's deadline)
with a small day heading. Manager to-dos: new first, then by deadline. Every card shows when it arrived (and from whom),
its status, its clock and its deadline, and has Send back.
Phones/tablets get a bottom tab bar (My tasks, Overview, Chat, Brands, More) in `shell.tsx`; toasts sit above it.
Every page remembers its scroll position (`scroll-memory.tsx`, sessionStorage, 3 h). Every date field is `DateInput`
(dd/mm/yyyy, the form still sends YYYY-MM-DD).
Look: every step has one soft colour everywhere (`STAGE_COLOR` in domain/workflow.ts → `StageChip`, the stepper, `FlowMini`,
the pipeline); every status has one (`PROGRESS_META` → `ProgressChip`); brands show their logo or a colour initial
(`BrandMark`); cards and rows
carry their brand's colour as a left stripe; `/` or Ctrl/⌘+K focuses search. `(app)/error.tsx` and `global-error.tsx`
show a calm "Try again" page instead of a blank error (Next 16 passes `retry`, not `reset`).
Delight: an action can return `{ message, celebrate: "small" | "big" }` from `run()`; `ActionForm` then calls `celebrate()`
(`components/celebrate.ts` + `.celebrate` CSS) — a short paper-confetti shower (≤40 strips and dots, transform/opacity only, removed after
2.7 s, never twice at once, skipped with prefers-reduced-motion). Used for: step finished/sent on, version approved,
task done, published (big when the item is finished), thanks sent, a brand month fully published (`MonthDone`, once per
person). Greetings show a sun / sunset / moon by Cairo time and a daily line (`lib/cheer.ts`). Buttons press
(`active:scale`), task cards rise in and lift on hover. Work cards have "Thanks" for whoever handed the work over
(`thankFor`, fun.ts: a private notification, once per item, person and day). My tasks shows "Your day" (`myDay`: finished
today, time on the clock, working-day streak; Friday doesn't break it). Avatars get a pink ring on the person's birthday.
**Look rules (the team asked for a human, not "AI", look):** no sparkle/star/wand/lightning icons, no emojis next to
names, in tiles, titles or toasts (reactions, chat and user-chosen space icons are fine), no glowing gradients. Chips are
outlined with a small coloured icon or status glyph (`StageChip`, `ProgressChip` in ui.tsx). Moods are drawn faces with a
word (stored values unchanged); Big update icons are short keys (`UPDATE_ICONS`, older emoji values still map).

**Dashboard month report** (`getDashboard` → `qualityFor`, stats.ts): planned / done / not done (plan only), extra
requested + done, changes requested (versions reviewed with "changes" that month), items that needed changes more than
once ("repeated"), approved first time (v1 approved ÷ approved), sent back (`stage_returned` in the activity log),
steps finished late. Per brand and per person too; all read-only from existing data.

## 7. Permissions (src/domain/permissions.ts) — always enforced on the server

`isManager(w) = w.isAdmin || w.isManager`. Every permission is a key in `PERMISSIONS` with a default rule (the table
below). Settings → Access turns any key on/off per person (`permission_overrides`, loaded into the session as
`perms`); `allowed(w, key)` = the override, else the default. Use `can.*` (it calls `allowed`) everywhere — never test
`isAdmin` for a feature. Making someone admin/manager or changing role labels needs "Manage access".

| Action | Who |
| --- | --- |
| Do a step (`doStage`) | the assignee, the step's team, admin; delivery: account/content/managers |
| Choose who does a step (`assign`) | managers (anyone can take unassigned work; when sending on / back anyone picks themselves or that team) |
| Set a deadline | managers — change/remove a set one: admin only |
| Approve versions (`review`) | managers + content team (each version is sent to the item's content creator; managers see all) |
| Add/edit/delete content (`editContent`) | managers + content |
| Posting date | managers + content + social |
| Shoot plan | managers + media + content |
| Publishing (platforms) | managers + social |
| Give tasks, Dashboard, Reports, Activity log, everyone's numbers, exports, mark extra / not extra | managers |
| Attach files & links | anyone on items; on a task: its person, who gave it, managers. Remove: who attached it or managers |
| Brands, people, platforms, backups, workspace customization, access, build workflows (Spaces) | admin |
| Create spaces | managers (+ anyone given it). Inside a space: its admins set it up, members work, viewers only see |
| Edit worked time | admin (+ Assem by default) |
| Daily message (`announce`), Big updates (`updates.post`) | admin by default (Settings → Access) |
| Export a brand's month plan (`exportPlan`) | content + managers |
| Comment, chat, send back | everyone |

Rules: every server function asserts its permission itself (never rely on hiding a button). Pages redirect when
not allowed (e.g. `/activity`, `/stats`). Add new permissions to `can` and use them in both the server function and the UI.

## 8. Things that happen automatically (don't make people do them)

Content with a link is delivered on creation (when "ready" is ticked); next step activates on completion; brand default person per
step is assigned; the only member of a team gets the work; whoever finishes an unassigned step gets the credit;
deadlines shift for upstream delays; *Changes requested* on send-back / changes; *Waiting approval* on version upload;
the clock starts/stops with the status; Social reads *Scheduled* when every app is scheduled; an item moves to the month of its posting date;
Published when all platforms are live; repeating tasks create the next one; slide numbers continue per month;
notifications for new work, approvals, changes, mentions, deadlines, finished; bell alerts for late / due / 48h.

## 9. Branding — how to rebrand (for NEXORA or another company)

Owners do it **without code** in Settings → Workspace (name, tagline, colours with presets, the logos, a watermark for
light mode and one for dark mode — `watermark`/`watermarkOpacity` and `watermarkDark`/`watermarkDarkOpacity`, images
`watermark` / `watermarkDark` — modules on/off, auto pause time). `src/config/brand.ts` holds the DEFAULTS used for anything not set.
For the defaults, edit **only** `src/config/brand.ts` (`BRAND.name`, `appName`, `tagline`, `adminContact`, `colors.primary`,
`colors.dark`, `logos.*`) and replace images in `public/brand/` + `src/app/icon.png` / `apple-icon.png`.
`brandCss()` turns the two colours into the whole palette. NEXORA identity: navy `#0B1639`, electric blue `#3B82F6`
— don't introduce other brand colours. Status colours (ok/warn/bad/back) live in `globals.css`. See WHITE-LABEL.md.
`getWorkspace()` (server/settings.ts) is what pages read; colours go through `brandCss()` (hex-validated).

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
- Inputs: links go through `normalizeUrl` (http/https only); photos/logos are image data URLs with type+size checks; SVG not allowed.
- Attached files: extension allow-list mapped to our own Content-Type (never the browser's), 25 MB, random file names,
  same-origin check on upload, served only to signed-in people with `nosniff` and a sandbox CSP (`/api/files` skips the
  proxy so big uploads aren't buffered twice — the routes check the session themselves).
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
  npm run db:migrate && SEED_TRACKER=0 SEED_FORCE_PASSWORD_CHANGE=0 npm run db:seed
  npm run build && SEED_TRACKER=0 SEED_FORCE_PASSWORD_CHANGE=0 npx next start -p 3001 &
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

**Import an Excel content tracker** (one tab per brand, same columns as the old tracker) →
`node scripts/tracker-to-seed.mjs "Content tracker.xlsx"` regenerates `src/server/seed-data/tracker.generated.ts`; the server
imports it once on start (`src/server/tracker-import.ts`): items go into each brand's month plan and are brought to their
real step through the normal workflow, as the right people, on the sheet's dates (shoot, versions, approvals, live links).
Existing items (same title + posting date) aren't duplicated. For a new import, change `MARKER` in tracker-import.ts.
`SEED_TRACKER=0` skips it (the e2e suite runs without it).

**Change people / defaults for a fresh install** → `src/server/seed.ts` (TEAM, MANAGERS, BRANDS). For EXISTING installs
add a one-time upgrade function guarded by an activity-log marker (see `kingFullAccess`) — never overwrite choices
people made in Settings.

**Change colours / logo / name** → §9.

**Spaces (workflow builder)** — add a template: `SPACE_TEMPLATES` in domain/spaces.ts (statuses by name, columns,
folders/lists, automations referring to statuses by name). Add an automation trigger/action: `TRIGGERS` / `ACTIONS`
(domain/spaces.ts) → `fire` / `runAction` (server/spaces.ts) → builder UI (`components/spaces/setup.tsx`) → test.
Add a column type: `FIELD_TYPES` (with its group) → `cleanValue` / `setFieldValue` (validation) or `withComputed` (worked
out) → `FieldValue` / `FieldEditor` / `FieldForm` (components/spaces/controls.tsx) → icon + settings in field-picker.tsx.
Add a doc / whiteboard / sheet template: `PAGE_TEMPLATES` (domain/page-templates.ts; `build()` returns fresh content that
passes `cleanContent`). Add a space template: `EXTRA_SPACE_TEMPLATES` (domain/space-templates-extra.ts) with a `category`.  **Timezone** → `TIMEZONE` in `src/lib/dates.ts`.

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
