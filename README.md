# NEXORA Ops — Agency Workflow & Operations Platform

**Live application (owner-confirmed):** https://ops.nexoraaagency.com/  
**Actual source repository:** https://github.com/Nagy-API/Next_It (**PUBLIC**)  
**Hosting:** Hostinger Node/Next.js, GitHub-connected auto-deployment on `main` (**owner-confirmed**; live build configuration not independently inspected)  
**Software:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, PostgreSQL-compatible PGlite/Postgres, ExcelJS, Vitest and Playwright.  
**Source baseline for this review:** `ef5756678c7c95b506972288d3e724f98576ef24` (6 November 2026).

> **Deployment caution:** Merging a documentation-only change into the production-connected `main` branch may trigger a Hostinger rebuild. This docs review is maintained as a Draft PR until an explicit release decision. No production login, database connection, account/password reset, social publishing, upload, migration, backup restore or live user-data inspection was performed.
>
> **Security caution:** A prior README published a fixed seeded login credential, and the current application seed code contains a fixed fallback. **Never reuse or trust publicly documented bootstrap credentials.** Production operators should assess/reset any accounts that may still rely on them and follow [Security Issue #27](https://github.com/Nagy-API/Next_It/issues/27). This README intentionally contains **no usable passwords**. Removing a password from README does not remove it from Git history or source fallback code.

## 1. Product and business problem

**NEXORA Ops** is an internal collaboration, project, content production, scheduling and reporting platform for a creative/marketing agency. Its original purpose was to replace the company’s Excel content tracker with an auditable, team-aware, end-to-end content production workflow. The codebase has since evolved into a broader **workspace platform** with customized Spaces, Docs, Sheets, Whiteboards, Dashboards, social scheduling and automation.

It is separate from the public **NEXORA Agency Website** and from **REDAHAB**. It does not capture external retreat customer Leads; it coordinates NEXORA team work and brand deliverables.

An account is provided by an authorized workspace administrator; **there is no public self-sign-up**. Access depends on Admin/Manager/team roles **plus per-person permission overrides** in Settings → Access.

## 2. Content production workflows

Each brand has a monthly plan with multiple content items. `src/domain/workflow.ts` defines the current default route:

| Item | Standard production route | Completion |
| --- | --- | --- |
| Reel | Content → Shooting (when needed) → Video editing/Post-production → Social Media | **Published** once every planned platform is marked live |
| Static / Carousel | Content → Graphic Design → Social Media | Published across selected platforms |
| Story | Content → Social Media | Published across selected platforms |
| One-off client project | Content → optional shooting/editing/design → Delivery | **Delivered**, not published on a social calendar |
| Other (nonstandard task/deliverable) | Selected Content/Shooting/Media/Design steps → Approval | **Approved** as a document/brief/other deliverable |

**Transitions:** The content team can choose/skips supported stages. Stage completion transfers responsibility to the next team/member. Work can be returned with a note for another round. Video/design output supports `v1`/`v2` revisions and human approval or change requests. A scheduled content item is only `Published` after its targeted platform requirements are met.

**Time and deadlines:** Stage progress includes `Not started`, `Processing`, `Paused`, `Adjusting`, `Scheduled`, and `Waiting approval`. The application tracks work sessions and allows authorized corrections; `src/domain/workflow.ts` calculates health/late days, downstream due-date shifts when earlier stages finish late, and rules that avoid counting time blocked on an earlier stage as an individual delay. Workspace settings allow an automatic end-of-day pause of active clocks.

**Monthly content plans:** Brand pages show monthly items by posting date/type/stage, direct Canva links and Drive versions, assignments and status; list past/new months, record Social platform links and export filtered plans to Excel. `Add content → Paste a list` parses copied lines from an Excel tracker/Canva/messages into a preview; it is **not an official Canva API integration or automatic Canva import**.

## 3. Screens and major modules

| Area / route | Current source-backed capabilities |
| --- | --- |
| **My Work** `/my-work` | Personalized assigned stages/tasks, priorities, due today/week/month, tasks the user gave, review requests and completion history |
| **Overview** `/overview` | Manager-level organizational view of active work, progress, late items, teams and month comparisons |
| **Brands** `/brands`, `/brands/[slug]` | Brand-by-brand plans, monthly items, per-platform publication, default teammates per step, attachments and Excel export |
| **Add Content** `/add` | Create Reel/Static/Carousel/Story/Other, plan details, paste bulk list, choose stages and teams |
| **Items** `/items/[id]` | Stage status, assigned person, time sessions, versions/approval, Drive/Canva refs, notes/comments, attachments and activity |
| **Quick Update** `/quick` | Bulk/table-friendly status follow-ups and changes for available work |
| **One-off Projects** `/projects` | Clients, project owners, independent deliverables, editing/approval/delivery and soft-delete/restore |
| **Tasks** `/tasks`, `/work` | Assigned work and separately given tasks, recurring schedules and follow-ups |
| **Shoot Schedule** `/shoots` | Shoot calendar across brands/projects, times/locations/crew, equipment/rentals/purchases, readiness and handoff to editing |
| **Social Media Schedule** `/social` | Brand-scoped media library, posts/calendar, draft and timed publishing, per-channel statuses and post insights |
| **Team Chat** `/chat` | Internal messages, @mentions, files, read markers, typing/online indicators and notifications |
| **Team/People** `/team`, `/settings/people` | Member directory, people work statistics, team/manager settings and account administration |
| **Reports & Stats** `/reports`, `/stats` | Performance by person, team, brands, finished vs overdue work, worked time and Excel report downloads |
| **Activity** `/activity` | Append-only operational history, showing actions and ownership |
| **Spaces** `/spaces` | User-created public/private custom workspaces with custom statuses/columns/lists, subtasks, field formulas and automations |
| **Docs, Sheets, Whiteboards** `/spaces/[id]/p/[pageId]` | Editable in-workspace documents, grid-based spreadsheets and visual whiteboards; reusable template library |
| **Dashboards** `/dashboards` | User-defined data dashboards with task status/progress, overdue, assignees and time metrics scoped to visible Spaces |
| **My Account** `/settings/account` | Profile, avatar, password changes, and (when authorized) a local database backup download |
| **Settings** `/settings/*` | People, Brands, Platforms, Access, Workspace branding/modules, work/pause controls and social connection config |

Not every account sees all screens. Server access checks and `src/domain/permissions.ts` govern visibility and writes.

## 4. Permissions, managers and user accounts

The platform uses **Admin**, **Manager** and **Member/team** distinctions rather than REDAHAB’s Admin/Sales/Viewer model.

- **Admin** handles account management, access controls, high-privilege settings, backup exports and changing previously fixed deadlines. A manager flag or admin flag may coexist with team membership.
- **Manager** can assign work, create tasks, see organization dashboards/reports/activity, choose stage assignees and set initial deadlines where allowed; specific admin-only changes stay restricted.
- **Team members** work on content/shooting/editing/graphics/social or account management according to their team, ownership and permission overrides; finishing a stage and reviewing a version have distinct guards.
- **Settings → Access** permits an Admin-authorized manager to grant or deny each supported permission for a specific user or restore defaults. This means permission behavior should **not** be reduced to hard-coded role names.
- **Space roles** introduce separate `admin/member/viewer`-style access for each public/private Space. Private Space membership is respected by task/page/dashboard queries.
- People can change their own password; new or reset accounts are forced to change their starting password before normal use. Passwords are hashed with Argon2id. Sensitive session and permission changes are server checked.

Seed content includes example team/brand references and a 2026 monthly content plan for testing/onboarding; **do not publish actual staff usernames, passwords, client-only links, work records or other private operations data in a public portfolio case study**.

## 5. Custom Spaces, pages and workflow automation

`src/server/spaces.ts` implements a configurable workspace layer distinct from fixed monthly content workflows:

- Create a Space from a ready business template or blank; choose privacy/membership, statuses, columns, folders, lists and task roles.
- Create/customize tasks and subtasks, custom fields, status/priority/due dates, assignees, comments, files and time sessions; record important actions in activity history.
- Configure status-change and date-based automation rules to create subtasks, adjust priority/due dates or notify people (depends on template and permitted action). An auto-pause scheduler checks due automations periodically.
- Create editable **Docs** (structured rich-text pages), **Sheets** (table data with formulas) and **Whiteboards** (sticky notes, zones, edges/shapes), using an extensive library of project/strategy/HR and productivity templates.
- Build scoped dashboards for task counts, status, people, trend, due/overdue items and worked-time reporting with visibility restrictions.
- Workspace Settings can enable/disable modules without deleting their stored data and can change the organization name/colors/logos/appearance (with source defaults and white-label guidance).

These are implemented **in-app editing and template experiences**. Do not call them integrations with Notion, Google Docs, Excel Online, Figma or Canva.

## 6. Social Media scheduling and integrations

The newer source contains a **Meta Graph API integration layer**, beyond the original per-platform manual “published” tracker.

- Scope is **Facebook Pages** and **Instagram Professional** channels. The Social team connects the company's Meta app and chosen managed pages/accounts via Settings → Social Configuration. App secret and access tokens are encrypted on disk/in DB; never exposed as literal examples.
- Media library accepts original images/videos (chunked uploads, local private storage). A post may be a Post, Reel or Story with validated platform-specific media/caption restrictions.
- Social calendar/composer supports drafts, future schedules, one or more linked accounts, publish states and per-target errors. A server-side queue executes **every minute while the server is running**, with staged video processing and no blind retry of failures that might duplicate a post.
- Published-post insights are periodically retrieved (where the provider grants metrics), exposing reach/views/engagement and other available analytics.
- A configured public application base URL is necessary for Meta to download images/videos via signed/authorized media URLs.
- **Do not assume the real Meta app is connected, all permissions are approved, posts were successfully sent in production, or scheduled jobs run reliably on every host lifecycle**. This review inspected source only, not live tokens, Meta provider activity or queue logs.
- Manual content-workflow Social stage and the newer direct Meta publishing scheduler are separate features. The public portfolio should explain both without conflating their results.

## 7. Collaboration, notifications, reports and files

- Team chat, threaded item comments, @mentions, notifications for task assignment/handoffs, approvals, rework, nearing deadlines, completion, chat and social publishing errors.
- Personalized “My Work”, manager Overview, Stats/Reports, time accountability, Quick Update and activity ledger.
- Scheduled shoots and production requirements across active brand content and extra jobs.
- Uploaded attachments, Drive/Canva/manual web links; files served through access-checked API routes where supported.
- ExcelJS exports of monthly brand plans, dashboards, people/time activity and manager reports with team/task breakdowns. **No independent production report/accuracy audit was performed**.
- Private notebook, profile photos, light/dark appearance and configurable workspace branding.

## 8. Database and Hostinger deployment

**Do not assume MySQL because the site is hosted by Hostinger.** This code uses **Drizzle ORM with a PostgreSQL schema** and two connection modes via `src/db/index.ts`:

| Mode | Selection | Persistence |
| --- | --- | --- |
| Built-in **PGlite** (default when no `DATABASE_URL`) | Production defaults to `~/nexora-ops-data`; development to `./local-data` | Embedded PostgreSQL-compatible database in a filesystem folder |
| External **PostgreSQL** | `DATABASE_URL=postgres://…` or `postgresql://…` | Standard PostgreSQL server; includes Docker example |
| Explicit local folder | `DATABASE_URL=file:/absolute/path` | PGlite in designated folder |

Hostinger guide `docs/DEPLOY-HOSTINGER.md` describes **PGlite as the intended no-extra-DB production default**, in a folder outside the Git deployment tree. The actual live `DATABASE_URL` and whether it was overridden with external PostgreSQL were not available to the reviewer. The Hostinger link and auto-deployment were **confirmed by the owner**.

### Startup, migrations, retention and disaster recovery

- `src/instrumentation.ts` calls `prepareDatabase()` on Node server start; `src/server/setup.ts` applies embedded Drizzle migrations, seeds an empty DB, starts local backup management, auto-pause and social queue.
- `src/db/local.ts` attempts to enforce **one process owning a PGlite data directory** during Hostinger overlapping restarts through lock, heartbeat and handover. Do not run two independent processes on the same data folder.
- Local PGlite mode schedules backups about **every 10 minutes when data changed**, retains up to 30 archive files in a sibling backup directory, and attempts recovery from a usable backup if the DB folder cannot be opened. Admins may export a complete local backup for offline storage.
- **Backups, lock/handoff/recovery and Meta queue are source-implemented**, but durability, successful restore and uninterrupted scheduling have **not** been independently tested against the current live Hostinger runtime.
- External Postgres deployments need their **own** tested DB backup plan; PGlite local-backup behavior cannot be assumed for them.
- Hostinger is GitHub-connected. A merge to `main` may trigger a rebuild/restart even if only Markdown changes.

### Historic documentation drift

`docs/DEPLOY-HOSTINGER.md` was initially written **before** production deployment and refers to a historical repository name; the current repo is `Nagy-API/Next_It`. The guide's opening “nothing has been done” is historical, not current owner-reported status. [Docs Issue #28](https://github.com/Nagy-API/Next_It/issues/28) tracks this and [source review notes](docs/PORTFOLIO_SOURCE_REVIEW.md) preserve the distinction.

## 9. Security and privacy boundaries

Source controls include Argon2id password hashes, first-password replacement, login attempt lockouts, hashed random session tokens in HttpOnly cookies, server-side RBAC, configurable per-person permission overrides, origin-protected Server Actions, nonce-based CSP, clickjacking protections and append-only audit history. Local backups live outside the deployment tree by default.

**Important open item:** [Security Issue #27](https://github.com/Nagy-API/Next_It/issues/27) — hardcoded/public bootstrap credential fallback. The current historical git/source content is public; merely editing a Markdown file is not full remediation. Review live account readiness and rotate affected credentials under authorized company controls. **No credentials were used in this audit.**

Other cautions: Do not publish private attachments, raw activity data, staff phone numbers, campaign plans or unapproved company screenshots. Account, social-token and backup/restore actions are production operations requiring authorization. No independent penetration test, fresh `npm audit`, actual production password check or login audit was run here.

## 10. Local development and source checks

For a **safe isolated development instance**, use a separate PGlite data directory, a strong unique seed secret and throwaway/test accounts. The project includes both `npm run local` and `docker compose` entry points. Do **not** start the source against Hostinger's live database or bring live staff data into test runs.

```bash
npm ci
# Configure a NEW non-production database and a long UNIQUE SEED_DEFAULT_PASSWORD in a gitignored .env
npm run db:migrate
npm run db:seed
npm run dev

npm run lint
npm run typecheck
npm test
npm run test:e2e  # requires separately prepared disposable browser-test database
```

The source's original local/Compose demo login examples are intentionally **not reproduced** here. An operator should never use a public/shared credential to bootstrap a real team. Testing scripts, migrations, demo seeding, backup/restore and live social integration must remain isolated from production. Historical tests live under `tests/`; they were **not freshly run** in this review.

## 11. Code navigation

| Path | Responsibility |
| --- | --- |
| `src/domain/workflow.ts`, `src/server/workflow.ts` | Fixed content workflow, timing, late-state propagation and stage transactions |
| `src/domain/permissions.ts`, `src/server/access.ts` | Team/Admin/Manager RBAC and custom permissions |
| `src/app/(app)/brands/`, `src/server/items.ts` | Brand plans, item updates, approvals, attachment links |
| `src/app/(app)/my-work/`, `src/server/tasks.ts` | My Work and recurring/given tasks |
| `src/server/shoots.ts`, `src/app/(app)/shoots/` | Shoot schedule and equipment/crew |
| `src/server/social.ts`, `social-meta.ts`, `social-queue.ts` | Meta channel config, calendar/media/post queue and metrics |
| `src/server/spaces.ts`, `src/domain/spaces.ts` | Custom Spaces/list/task workflow system |
| `src/domain/pages.ts`, `src/domain/page-templates.ts`, `src/components/pages/` | Editable Docs, Sheets and Whiteboards with templates |
| `src/server/dashboards.ts`, `src/app/(app)/dashboards/` | Custom analytics dashboards |
| `src/server/chat.ts`, `src/server/notify.ts` | Chat/mentions and in-app notifications |
| `src/server/export.ts`, `src/app/api/export/` | Excel reports and downloads |
| `src/db/index.ts`, `src/db/local.ts`, `src/server/setup.ts` | PGlite/Postgres mode, locks, backups, migrations and startup |
| `src/server/sessions.ts`, `src/server/security.ts`, `src/proxy.ts` | Login, lockout, session/CSP protections |
| `src/server/settings.ts`, `src/config/brand.ts` | Workspace/white-label modules and branding |
| `tests/`, `docs/SECURITY.md`, `docs/DEPLOY-HOSTINGER.md` | Test/source supporting notes, old deployment guide |

## 12. Review provenance, outstanding work and portfolio handoff

- **OWNER-CONFIRMED:** public live domain and GitHub-connected Hostinger auto-deployment.
- **SOURCE-VERIFIED:** the modules, routes and code mechanisms above at pinned source revision.
- **NOT VERIFIED:** live accounts/password status, current production DB mode, current content/data count, Meta connection/publishing analytics, backup restoration, runtime performance, deployed permissions, E2E pass rate and company-cleared screenshots.
- **TEAM CREDIT:** project contributor count and individual assignment were **not specified for NEXORA Ops**; do not infer the two-person REDAHAB team applies here.
- **OPEN REVIEW:** [Security Issue #27](https://github.com/Nagy-API/Next_It/issues/27) and [Docs Issue #28](https://github.com/Nagy-API/Next_It/issues/28). Source deployment/main merge remains outside this documentation-only task.
- **PORTFOLIO:** Capture company-safe screenshots of the workflow/dashboard with synthetic work items, obtain publishing approval, and use the knowledge base's case study without inventing operational metrics.

For an evidence-aware handoff, see [docs/PORTFOLIO_SOURCE_REVIEW.md](docs/PORTFOLIO_SOURCE_REVIEW.md). Avoid treating this source review as a complete security or production audit.
