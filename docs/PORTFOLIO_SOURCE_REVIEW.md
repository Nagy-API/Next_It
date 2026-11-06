# NEXORA Ops — Source Audit & Future Portfolio Handoff

**Review date:** 2026-11-06  
**Pinned baseline:** `Nagy-API/Next_It` public main at `ef5756678c7c95b506972288d3e724f98576ef24`  
**Public domain:** https://ops.nexoraaagency.com/ (**owner-confirmed**; web fetch did not expose the authenticated UI)  
**Host:** Hostinger with `main` GitHub auto-deployment (**owner-confirmed**); host configuration was not accessed.  
**Scope:** Read-only source review plus source Markdown branch and private portfolio knowledge capture. No production login/test, app code edits, migrations, password handling, customer data, Meta calls, social publications, database restore or deployments.

## What this actually is

NEXORA Ops is an internal agency operations platform, built to replace an Excel content tracker, expanded into multi-brand campaign plans, team workflows, production scheduling, time accounting, comments/approvals, chat/notifications, exports, customizable Spaces, Docs/Sheets/Whiteboards and Meta-assisted social scheduling. **Not** the NEXORA Agency public website, **not** REDAHAB's lead CRM, **not** a consumer signup SaaS.

### Source-verified workflow inventory

1. **Monthly plans:** content items Reel / Static / Carousel / Story, assigned by brand/month, Canva links, deadlines, types, per-platform publish targets, extra work. `src/domain/workflow.ts`, `src/server/items.ts`, `src/app/(app)/brands/`.
2. **Content pipeline:** Content → optional Shooting → Media editing/Graphic Design → Social → Published (or Delivery for one-offs); choose legal skip/short routes. `src/domain/workflow.ts`, `src/server/workflow.ts`.
3. **Versions and review:** designer/editor sends version, content/manager reviews, asks for changes or approves; old work can be sent back, then the clock/state accurately reflects new rounds. `src/server/workflow.ts`, `src/components/handoff.tsx`, `src/components/send-back.tsx`.
4. **Deadlines/time:** per-stage deadlines and health, downstream shift on real delays, work sessions with authorized corrections, automatic pause near configured end of day. `src/domain/workflow.ts`, `src/server/time.ts`, `src/server/auto-pause.ts`.
5. **Task delegation/recurrence:** personal work; managers give tasks with repeating cadences, attachments, approvals and completion status, “Other” ad hoc work route. `src/server/tasks.ts`, `src/app/(app)/my-work/`, `src/app/(app)/add/`.
6. **Production shoot calendar:** brand and independent shooting slots with crew, date/time/location, rental/purchase readiness and editing handoff. `src/server/shoots.ts`, `src/app/(app)/shoots/`.
7. **Internal collaboration:** team chat, @mentions, online/typing/read state, comments/threads, notifications and private notebook. `src/server/chat.ts`, `src/server/notify.ts`, `src/components/notebook.tsx`.
8. **Operations reporting:** overview, personal/team stats, late/finished/month comparison, worked time, Excel export (brands/plans/dashboards/people/reports). `src/server/reports.ts`, `src/server/stats.ts`, `src/server/export.ts`.
9. **Spaces/workflow builder:** per-space privacy/membership, status/fields/folders/lists, custom task and formulas, subtasks/comments/automations, template gallery, scoped dashboards. `src/server/spaces.ts`, `src/domain/spaces.ts`, `src/domain/page-templates.ts`, `src/server/dashboards.ts`.
10. **Internal Docs/Sheets/Whiteboards:** structured in-app page editors and templates, including project/strategy frameworks; not Google Docs/Sheets or an external collaborative SaaS integration. `src/components/pages/`, `src/domain/pages.ts`.
11. **Social scheduling:** Meta App / Facebook Pages / linked Instagram professional accounts; media library, scheduled Post/Reel/Story, queued per-target publish, error notification, and retrieved provider metrics where supported. `src/server/social.ts`, `src/server/social-meta.ts`, `src/server/social-queue.ts`, `src/domain/social.ts`. **Live Meta connection not observed.**
12. **Workspace config:** configurable company look and feature module toggles, granular Settings → Access permission overrides, account/password management, optional white-label source reuse. `src/server/settings.ts`, `src/server/access.ts`, `src/config/brand.ts`.

## Architecture and persistence — do not assume MySQL

`src/db/index.ts` supports `DATABASE_URL=postgres://...` for **external PostgreSQL**, `DATABASE_URL=file:/path` for embedded PGlite, or no URL for built-in **PGlite** in `./local-data` (development) / `~/nexora-ops-data` (production). Drizzle SQL migrations are shipped as embedded source in `src/db/migrations.generated.ts`.

`src/instrumentation.ts` invokes `src/server/setup.ts` during Node startup; migrations, safe empty-data seeding, local PGlite backup, auto-pause and social queue init are implemented.

`src/db/local.ts` manages process lock + handoff under overlapping Hostinger deploy startups, backup every 10 minutes when data changes, retention of up to 30 archives and recovery from usable backup. These are **code-level mechanisms**, not proof of on-host successful failover, verified persistence or recovery outcomes.

Owner reports the website is on Hostinger and linked for GitHub deployment, but the live value of `DATABASE_URL` and Node process topology have not been accessed. The source Hostinger doc describes PGlite as intended default. **Avoid saying production is MySQL** or asserting that it definitely uses PGlite without environment evidence.

## Roles and authorization

The server has `isAdmin`, `isManager`, team array and granular per-user `permissionOverrides`, with additional per-Space private membership/access. `src/domain/permissions.ts` centralizes defaults; per-user overrides mean a static Admin/Manager/Member table is an approximation, not the full authorization policy.

Managers can normally assign tasks, access dashboards/reports, set initial deadlines, and review; admins have sensitive account/access/backup controls and can change fixed deadlines. Team-specific Content, Media, Design, Social and Account rights are enforced in server functions.

Login uses Argon2id password hashing, temporary first-login password replacement, lockouts, random session tokens stored only hashed, signed cookie restrictions, revalidation, and server access checks. `drizzle/0001_activity_log_immutable.sql` installs an append-only activity audit trigger.

## Critical security finding — publicly documented fixed seed password

**[Issue #27](https://github.com/Nagy-API/Next_It/issues/27).**

The owner's update on **6 November 2026** confirms that existing team account passwords have been changed from their initial values. This was not independently verified by reviewing account records. The fixed bootstrap fallback remains in source for new environments, so [Issue #27](https://github.com/Nagy-API/Next_It/issues/27) stays open. No live login attempt or password inspection took place.

**Response:** Owner reports that all existing team passwords have already been changed. A separate reviewed code PR is still needed to prevent future real installations from using a fixed fallback bootstrap credential. Removing password text from README does not modify source or Git history.

**Documentation change:** The new README contains no usable login password and describes only safe setup. No seed code or staff accounts were modified.

## Historical documentation drift

**[Issue #28](https://github.com/Nagy-API/Next_It/issues/28).**

- Old README's clone example and `docs/DEPLOY-HOSTINGER.md` reference a historical `Nexora_System` repo, while reviewed actual repository is **`Nagy-API/Next_It`**.
- Hostinger guide opened with “nothing has been done yet”. Owner now confirms the subdomain is published and GitHub-linked; retain as pre-deployment historical guide, not live status proof.
- Old README mainly described the fixed content tracker and earlier task workflow; more recent code adds robust Spaces/page editors/permissions and social scheduler.
- `docs/SECURITY.md` says `npm audit clean` historically; audit not freshly run during this review, so not an up-to-date dependency security assurance.
- No automatic external Canva import should be claimed; `Add content → Paste a list` parses copied text only.
- Social Graph API support is implemented, but live Meta token authorization, job schedule and successful account posting **not independently verified**.
- `README.md` redrafted as current canonical technical and business overview. Historical Hostinger documentation has a banner to avoid accidental reruns.

## Additional disclosure/reliability boundaries

- **Public repo:** source code, development notes, staff role names and example brand plans are accessible. Treat personally identifying or contractual business data conservatively. No production records or real secrets were accessed.
- **Production service:** no independent website rendering/authentication, traffic, uptime, live DB persistence, permission testing, backup restore, social post or Excel export runtime verification was performed.
- **Social queue:** background queue ticks while a suitable long-running Node server is alive. The source is not evidence that it survived every Hostinger restart or completed real Meta jobs.
- **Single-process PGlite:** code attempts locking but shared folder availability and Node lifecycle matter; do not advertise HA / multi-node capacity or SLA.
- **Test code:** Vitest and Playwright suites exist; they were not run during this review. Do not report an invented pass count.
- **Authorship:** Owner confirms **two developers** built NEXORA Ops. Individual module ownership and contribution percentages remain unassigned.
- **Portfolio rights:** confirm company permission for screenshots/brands and sanitize any genuine internal employee tasks, names, private attachments, client documents, tokens, credentials, business performance figures.

## Source issue/deployment policy

- [Issue #27](https://github.com/Nagy-API/Next_It/issues/27): bootstrap-credential exposure/fallback. Priority **security**.
- [Issue #28](https://github.com/Nagy-API/Next_It/issues/28): repo name, deployment status and historical README drift.
- This PR changes **README.md**, `docs/PORTFOLIO_SOURCE_REVIEW.md` and a historical-doc context banner only; it does not change runtime code, auth, session, DB, Meta services, data or deployment.
- **Keep source PR Draft and unmerged:** owner confirms pushes/merges into source main can auto-deploy on Hostinger. A docs-only rebuild can restart the PGlite data process; release decision must be explicit.

## Portfolio-ready positioning

**What to emphasize:** operational workflow engine with cross-team handoffs, per-step time/deadlines, revision approvals, configurable admin permissions, custom workflow builder/Docs/Sheets/Whiteboards and Meta publishing source integration; real-world software engineering of persistent sessions, Drizzle SQL models, queues, notifications, backups and Excel exports.

**Do not claim:** live Meta publication/metrics, audited security, external Canva connection, cloud-native distributed DB, guaranteed uptime, specific performance uplifts, revenue or solo authorship. The two-developer team is owner-confirmed.

**Next:** Preserve source case-study records in the private `Nagy-API/ai-portfolio-workspace`, collect approved synthetic screenshots later, and coordinate security Issue #27 with an authorized operator before any public technical endorsement.
