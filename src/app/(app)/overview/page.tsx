import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, CalendarDays, Check, CircleUserRound, ClipboardCheck, CornerUpLeft, Flame, Hourglass, Sparkles } from "lucide-react";
import { can, isManager } from "@/domain/permissions";
import { getWorkspace } from "@/server/settings";
import { currentAnnouncement } from "@/server/announcements";
import { PostButton } from "@/components/announcement";
import { getTasksFor } from "@/server/tasks";
import { HotBadge } from "@/components/handoff";
import { STAGE_COLOR, STAGE_META } from "@/domain/workflow";
import type { StageKind } from "@/db/schema";
import { addDays, dayOfWeek, formatDay, formatRelative, monthLabel, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getAllBrands, getOpenItems } from "@/server/cached";
import { getBrandMonthSummaries, getHomeData, reviewsFor, tasksFor, type WorkItem } from "@/server/queries";
import { activeNotes } from "@/server/notes";
import { NotesBar } from "@/components/notes-bar";
import { ItemRow } from "@/components/item-row";
import { teamEmoji } from "@/lib/cheer";
import { Avatar, BrandDot, BrandMark, Empty, ProgressBar, ProgressChip, SectionTitle, StageChip, TimeSpent, TypeIcon } from "@/components/ui";

export const metadata = { title: "Overview" };

const PIPELINE: StageKind[] = ["content", "shooting", "media", "design", "social", "delivery"];

export default async function HomePage() {
  const user = await requireUser();
  const today = todayISO();
  const manager = isManager(user);
  const [open, home, myTasks, notes, brands, ws, motd] = await Promise.all([getOpenItems(), getHomeData(today), getTasksFor(user.id, today), activeNotes(), getAllBrands(), getWorkspace(), currentAnnouncement()]);
  const logoOf = new Map(brands.map((b) => [b.id, b.logoUrl]));
  const mine = tasksFor(open, user).filter((i) => !(i.current?.progress === "waiting_approval" && i.current.assignee?.id === user.id));
  const moveNow = mine.filter((i) => i.hot || i.current?.health === "overdue").sort((a, b) => (a.postingDate ?? a.current?.deadline ?? "9").localeCompare(b.postingDate ?? b.current?.deadline ?? "9"));
  const tasksSoon = myTasks.filter((t) => !t.doneAt && t.dueDate && t.dueDate <= addDays(today, 2));
  // Versions waiting for MY approval (the content creator of the item) — they hold the next team up.
  const toApprove = reviewsFor(open, user).filter((i) => !moveNow.includes(i));
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextM = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const [thisMonth, nextMonth] = await Promise.all([getBrandMonthSummaries(year, month, today), getBrandMonthSummaries(nextM.year, nextM.month, today)]);

  const late = open.filter((i) => i.attention === "overdue");
  const returned = open.filter((i) => i.attention === "returned");
  const atRisk = open.filter((i) => i.attention === "at_risk");
  const postingPassed = atRisk.filter((i) => i.postingDate && i.postingDate < today).length;
  const unassigned = open.filter((i) => i.current && !i.current.assignee && i.attention !== "overdue" && i.attention !== "at_risk" && i.attention !== "returned");
  const weekPlanned = home.publishingWeek.length;
  const weekLive = home.publishingWeek.filter((i) => i.completedAt).length;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const now = new Date().getTime();

  return (
    <div className="space-y-8">
      {ws.modules.notes && <NotesBar notes={notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), expiresAt: n.expiresAt.toISOString() }))} meId={user.id} meName={user.name} now={now} />}

      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] text-muted">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" }).format(new Date())}</div>
            <h1 className="mt-0.5 font-display text-[26px] font-bold tracking-[-0.01em] sm:text-[28px]">
              {greeting}, {user.name} <span className="inline-block origin-bottom-right animate-wave">{teamEmoji(user.teams)}</span>
            </h1>
          </div>
          {!motd && can.announce(user) && <PostButton />}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile href="/my-work" label="On you now" value={mine.length + myTasks.filter((t) => !t.doneAt).length} hint={moveNow.length ? `${moveNow.length} must move in 48h` : "Nothing urgent"} tone={moveNow.length ? "warn" : undefined} />
          <Tile href="/work?status=late" label="Late across the agency" value={late.length + postingPassed} hint={late.length + postingPassed ? `${late.length} past deadline · ${postingPassed} past posting date` : "Nothing late 🎉"} tone={late.length + postingPassed ? "bad" : "ok"} />
          <Tile label="Posting this week" value={weekPlanned} hint={`${weekLive} live so far`} />
          <Tile label="Finished this month" value={home.finishedThisMonth} hint="Published or delivered" tone="ok" />
        </div>
      </header>

      {/* ---------------- Personal: what must move in the next 48 hours ---------------- */}
      {moveNow.length + tasksSoon.length + toApprove.length > 0 && (
        <section>
          <SectionTitle right={<Link href="/my-work" className="text-[13px] font-medium text-electric hover:underline">All my tasks</Link>}>
            <span className="inline-flex items-center gap-2">
              <Flame className="size-4 text-[#ff8a1f]" /> Move now · the next 48 hours
            </span>
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {moveNow.map((i) => (
              <Link key={i.id} href={`/items/${i.id}`} className="card group flex flex-col gap-2 p-4 transition-shadow hover:shadow-pop" style={i.brand ? { boxShadow: `inset 3px 0 0 ${i.brand.color}` } : undefined}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <HotBadge item={i} today={today} />
                  <StageChip kind={i.current!.kind} short />
                  <ProgressChip progress={i.current!.progress} scheduledFor={i.current!.scheduledFor} running={i.current!.time.running} hideNotStarted />
                </div>
                <div className="flex items-center gap-1.5 font-semibold group-hover:text-electric">
                  <TypeIcon type={i.type} /> <span className="truncate">{i.title}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  {i.brand && <BrandDot color={i.brand.color} />} {i.brand?.name ?? i.project?.clientName}
                  {i.current?.deadline && <span>· step due {formatDay(i.current.deadline)}</span>}
                </div>
              </Link>
            ))}
            {toApprove.slice(0, 6).map((i) => {
              const v = i.versions.filter((x) => x.kind === i.current!.kind).at(-1);
              return (
                <Link key={i.id} href={`/items/${i.id}`} className="card group flex flex-col gap-2 p-4 transition-shadow hover:shadow-pop" style={{ boxShadow: "inset 3px 0 0 var(--color-ok)" }}>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-bold text-ok">
                    <Check className="size-3.5" strokeWidth={3} /> Approve v{v?.number}
                    {v && v.altUrls.length > 0 ? ` · ${v.altUrls.length + 1} options` : ""} · {STAGE_META[i.current!.kind].short}
                  </span>
                  <div className="flex items-center gap-1.5 font-semibold group-hover:text-electric">
                    <TypeIcon type={i.type} /> <span className="truncate">{i.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    {i.brand && <BrandDot color={i.brand.color} />} {i.brand?.name ?? i.project?.clientName}
                    {v && <span>· sent {formatRelative(v.submittedAt)} by {v.submittedBy?.name ?? "the team"}</span>}
                  </div>
                </Link>
              );
            })}
            {toApprove.length > 6 && (
              <Link href="/my-work" className="card flex items-center justify-center p-4 text-[13.5px] font-semibold text-electric hover:shadow-pop">
                {toApprove.length - 6} more waiting for your approval →
              </Link>
            )}
            {tasksSoon.map((t) => (
              <Link key={t.id} href="/my-work#tasks" className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-pop" style={{ boxShadow: "inset 3px 0 0 #ff8a1f" }}>
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#fff1e3] px-2 py-0.5 text-[11.5px] font-bold text-[#c2410c]">
                  <ClipboardCheck className="size-3.5" /> Task · {t.dueDate! < today ? "late" : t.dueDate === today ? "today" : formatDay(t.dueDate)}
                </span>
                <div className="font-semibold">{t.title}</div>
                <div className="text-[12.5px] text-muted">from {t.createdByName}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Who's on what right now ---------------- */}
      <TeamNow open={open} />

      {/* ---------------- The cycle ---------------- */}
      <section>
        <SectionTitle right={<span className="text-[12px] text-muted">Tap a step to see its work</span>}>Where the work is</SectionTitle>
        <Pipeline open={open} publishedThisMonth={home.finishedThisMonth} />
      </section>

      <div className={clsx("grid grid-cols-1 gap-8", manager && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        {/* ---------------- Needs attention (managers) ---------------- */}
        {manager && (
          <section className="min-w-0">
            <SectionTitle right={<Link href="/work" className="text-[13px] font-medium text-electric hover:underline">All open work</Link>}>Needs attention</SectionTitle>
            {late.length + returned.length + atRisk.length + unassigned.length === 0 ? (
              <Empty icon={Sparkles} title="All clear">Nothing is late, sent back, or missing an owner.</Empty>
            ) : (
              <div className="space-y-5">
                <AttentionGroup icon={AlertTriangle} tone="bad" title="Late" hint="Past the deadline while it's with this person" items={late} href="/work?status=late" />
                <AttentionGroup icon={Hourglass} tone="warn" title="Posting soon or passed, not with Social yet" hint="Posting within 3 days, or the date already passed" items={atRisk} href="/work?status=at_risk" />
                <AttentionGroup icon={CornerUpLeft} tone="back" title="Sent back for changes" items={returned} href="/work?status=returned" />
                <AttentionGroup icon={CircleUserRound} tone="wait" title="Waiting for someone to pick it up" hint="Current step has no owner" items={unassigned} href="/work?status=unassigned" />
              </div>
            )}
          </section>
        )}

        {/* ---------------- This week ---------------- */}
        <section className="min-w-0">
          <SectionTitle right={<span className="text-[12px] text-muted">{formatDay(home.week.start, { weekday: false })} to {formatDay(home.week.end, { weekday: false })}</span>}>Publishing this week</SectionTitle>
          <ThisWeek items={home.publishingWeek} start={home.week.start} today={today} />
        </section>
      </div>

      {/* ---------------- Brands ---------------- */}
      <section>
        <SectionTitle right={<Link href="/brands" className="text-[13px] font-medium text-electric hover:underline">All brands</Link>}>Brands</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {home.activeBrands.map((b) => {
            const cur = thisMonth.get(b.id) ?? [];
            const nxt = nextMonth.get(b.id) ?? [];
            return <BrandCard key={b.id} brand={{ ...b, logoUrl: logoOf.get(b.id) ?? null }} items={cur} next={nxt} label={monthLabel(year, month)} nextLabel={monthLabel(nextM.year, nextM.month)} />;
          })}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, hint, tone, href }: { label: string; value: number; hint?: string; tone?: "bad" | "warn" | "ok"; href?: string }) {
  const body = (
    <>
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={clsx("mt-1.5 font-display text-[30px] font-bold leading-none tracking-tight", tone === "bad" && value > 0 && "text-bad", tone === "warn" && "text-[#c2410c]", tone === "ok" && "text-ok")}>{value}</div>
      {hint && <div className="mt-1.5 truncate text-[12px] text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block px-4 py-3.5 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-pop">
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3.5">{body}</div>
  );
}

/** Everyone who has work right now: what they're on, its status, and the clock. Readable at a glance. */
function TeamNow({ open }: { open: WorkItem[] }) {
  const byPerson = new Map<string, { id: string; name: string; items: WorkItem[] }>();
  for (const i of open) {
    const c = i.current;
    if (!c?.assignee) continue;
    const p = byPerson.get(c.assignee.id) ?? { id: c.assignee.id, name: c.assignee.name, items: [] };
    p.items.push(i);
    byPerson.set(c.assignee.id, p);
  }
  const rank = (i: WorkItem) => (i.current!.time.running ? 0 : i.current!.progress === "changes_requested" ? 1 : i.current!.progress === "scheduled" ? 2 : i.current!.progress === "waiting_approval" ? 4 : 3);
  const people = [...byPerson.values()]
    .map((p) => ({ ...p, items: p.items.sort((a, b) => rank(a) - rank(b) || (a.postingDate ?? "9").localeCompare(b.postingDate ?? "9")) }))
    .sort((a, b) => Number(b.items.some((i) => i.current!.time.running)) - Number(a.items.some((i) => i.current!.time.running)) || a.name.localeCompare(b.name));
  if (!people.length) return null;
  return (
    <section>
      <SectionTitle right={<Link href="/reports" className="text-[13px] font-medium text-electric hover:underline">Today&rsquo;s report</Link>}>
        <span className="inline-flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-50" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
          </span>
          Team right now
        </span>
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => {
          const counts = new Map<string, number>();
          for (const i of p.items) counts.set(i.current!.progress, (counts.get(i.current!.progress) ?? 0) + 1);
          return (
            <div key={p.id} className="card p-3.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={p.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-[12px] text-muted">{p.items.length} on them</div>
                </div>
                {p.items.some((i) => i.current!.time.running) && <span className="rounded-full bg-electric-soft px-2 py-0.5 text-[11px] font-semibold text-electric">Working</span>}
              </div>
              <ul className="mt-3 space-y-1.5">
                {p.items.slice(0, 3).map((i) => (
                  <li key={i.id}>
                    <Link href={`/items/${i.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-canvas">
                      {i.brand ? <BrandDot color={i.brand.color} /> : <span className="size-2" />}
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      {i.current!.progress === "not_started" ? <StageChip kind={i.current!.kind} short className="!px-1.5 !py-0 !text-[10.5px]" /> : <ProgressChip progress={i.current!.progress} scheduledFor={i.current!.scheduledFor} running={i.current!.time.running} className="!px-1.5 !py-0 !text-[10.5px]" />}
                      {i.current!.time.running && <TimeSpent ms={i.current!.time.ms} className="!text-[11px]" />}
                    </Link>
                  </li>
                ))}
              </ul>
              {p.items.length > 3 && <div className="mt-1 pl-1.5 text-[12px] text-muted">+{p.items.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Pipeline({ open, publishedThisMonth }: { open: WorkItem[]; publishedThisMonth: number }) {
  const kinds = PIPELINE.filter((k) => k !== "delivery" || open.some((i) => i.current?.kind === "delivery"));
  return (
    <div className="card overflow-x-auto">
      <div className="flex min-w-[760px] items-stretch">
        {kinds.map((k, idx) => {
          const items = open.filter((i) => i.current?.kind === k);
          const lateN = items.filter((i) => i.attention === "overdue").length;
          const people = new Map<string, { name: string | null; n: number }>();
          for (const i of items) {
            const key = i.current!.assignee?.id ?? "none";
            const p = people.get(key) ?? { name: i.current!.assignee?.name ?? null, n: 0 };
            p.n++;
            people.set(key, p);
          }
          const sorted = [...people.values()].sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.n - a.n);
          return (
            <Link key={k} href={`/work?stage=${k}`} className="group relative flex flex-1 flex-col border-r border-line px-4 py-4 transition-colors hover:bg-[#f8faff]" style={{ boxShadow: `inset 0 3px 0 ${STAGE_COLOR[k].fg}` }}>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: STAGE_COLOR[k].fg }}>{STAGE_META[k].label}</span>
                {idx < kinds.length && <ArrowRight className="ml-auto size-3.5 text-faint" />}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={clsx("font-display text-[30px] font-bold leading-none", items.length === 0 && "text-faint")}>{items.length}</span>
                {lateN > 0 && <span className="text-[12px] font-semibold text-bad">{lateN} late</span>}
              </div>
              <div className="mt-3 space-y-1.5">
                {sorted.slice(0, 4).map((p) => (
                  <div key={p.name ?? "none"} className="flex items-center gap-2 text-[13px]">
                    <Avatar name={p.name} size={20} />
                    <span className={clsx("flex-1 truncate", !p.name && "text-muted")}>{p.name ?? "No owner yet"}</span>
                    <span className="tabular-nums text-muted">{p.n}</span>
                  </div>
                ))}
                {sorted.length > 4 && <div className="text-[12px] text-muted">+{sorted.length - 4} more</div>}
                {items.length === 0 && <div className="text-[12px] text-faint">Nothing here</div>}
              </div>
            </Link>
          );
        })}
        <div className="flex flex-1 flex-col bg-ok-soft/40 px-4 py-4">
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ok">Finished this month</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-display text-[30px] font-bold leading-none text-ok">{publishedThisMonth}</span>
            <Check className="size-5 text-ok" strokeWidth={3} />
          </div>
          <div className="mt-3 text-[12px] text-muted">Published or delivered since the 1st</div>
        </div>
      </div>
    </div>
  );
}

function AttentionGroup({ icon: Icon, tone, title, hint, items, href }: { icon: typeof AlertTriangle; tone: "bad" | "back" | "warn" | "wait"; title: string; hint?: string; items: WorkItem[]; href: string }) {
  if (!items.length) return null;
  const color = { bad: "text-bad", back: "text-back", warn: "text-warn", wait: "text-wait" }[tone];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[13px]">
        <Icon className={clsx("size-4", color)} strokeWidth={2.2} />
        <span className="font-semibold">{title}</span>
        <span className={clsx("rounded-full px-1.5 text-[12px] font-semibold", color, "bg-white ring-1 ring-line")}>{items.length}</span>
        {hint && <span className="hidden text-muted sm:inline">· {hint}</span>}
        {items.length > 5 && (
          <Link href={href} className="ml-auto text-[12.5px] font-medium text-electric hover:underline">
            See all {items.length}
          </Link>
        )}
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {items.slice(0, 5).map((i) => (
          <ItemRow key={i.id} item={i} compact />
        ))}
      </div>
    </div>
  );
}

function ThisWeek({ items, start, today }: { items: WorkItem[]; start: string; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  if (!items.length)
    return (
      <Empty icon={CalendarDays} title="Nothing scheduled this week">
        Posting dates from the monthly plans show up here.
      </Empty>
    );
  return (
    <div className="card divide-y divide-line">
      {days.map((d) => {
        const list = items.filter((i) => i.postingDate === d);
        const isToday = d === today;
        return (
          <div key={d} className={clsx("flex gap-3 px-4 py-2.5", isToday && "bg-electric-soft/50")}>
            <div className="w-10 shrink-0 pt-0.5 text-center leading-tight">
              <div className={clsx("text-[11px] font-semibold uppercase", isToday ? "text-electric" : "text-muted")}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek(d)]}</div>
              <div className={clsx("font-display text-[16px] font-bold", isToday && "text-electric", !list.length && "text-faint")}>{Number(d.slice(8))}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1 py-0.5">
              {list.length === 0 && <div className="pt-1.5 text-[12.5px] text-faint">—</div>}
              {list.map((i) => {
                const ready = i.completedAt ? "done" : i.current?.kind === "social" ? "ready" : "not-ready";
                return (
                  <Link key={i.id} href={`/items/${i.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-canvas">
                    {i.brand && <BrandDot color={i.brand.color} />}
                    <TypeIcon type={i.type} className="size-3.5" />
                    <span className="flex-1 truncate">{i.title}</span>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-1.5 text-[11px] font-semibold",
                        ready === "done" && "bg-ok-soft text-ok",
                        ready === "ready" && "bg-electric-soft text-electric",
                        ready === "not-ready" && "bg-warn-soft text-warn",
                      )}
                    >
                      {ready === "done" ? "Live" : ready === "ready" ? "With Social" : i.current ? STAGE_META[i.current.kind].short : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BrandCard({ brand, items, next, label, nextLabel }: { brand: { id: string; name: string; slug: string; color: string; logoUrl: string | null }; items: WorkItem[]; next: WorkItem[]; label: string; nextLabel: string }) {
  const lateN = [...items, ...next].filter((i) => i.attention === "overdue").length;
  return (
    <Link href={`/brands/${brand.slug}`} className="card group block p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <BrandMark name={brand.name} color={brand.color} logoUrl={brand.logoUrl} size={26} />
        <span className="font-display text-[15px] font-bold group-hover:text-electric">{brand.name}</span>
        {lateN > 0 && <span className="ml-auto rounded-full bg-bad-soft px-2 text-[12px] font-semibold text-bad">{lateN} late</span>}
      </div>
      {items.length + next.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-faint">Nothing planned for {label.split(" ")[0]} or {nextLabel.split(" ")[0]} yet</p>
      ) : (
        <div className="mt-3 space-y-3">
          <MonthProgress label={label} items={items} />
          <MonthProgress label={nextLabel} items={next} />
        </div>
      )}
    </Link>
  );
}

function MonthProgress({ label, items: all }: { label: string; items: WorkItem[] }) {
  // The plan's progress; extra tasks given on top are counted on their own.
  const items = all.filter((i) => !i.extra);
  const extras = all.filter((i) => i.extra);
  const done = items.filter((i) => i.completedAt).length;
  const social = items.filter((i) => i.current?.kind === "social").length;
  const production = items.filter((i) => i.current && (i.current.kind === "shooting" || i.current.kind === "media" || i.current.kind === "design")).length;
  const content = items.filter((i) => i.current?.kind === "content").length;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        {items.length ? (
          <span className="tabular-nums">
            <span className="font-semibold">{done}</span>
            <span className="text-muted">/{items.length} published</span>
            {extras.length > 0 && <span className="ml-1.5 font-semibold text-[#b45309]">+{extras.length} extra</span>}
          </span>
        ) : extras.length ? (
          <span className="font-semibold text-[#b45309]">{extras.length} extra</span>
        ) : (
          <span className="text-faint">No plan yet</span>
        )}
      </div>
      {items.length > 0 && (
        <>
          <ProgressBar
            className="mt-1.5"
            segments={[
              { value: done, color: "var(--color-ok)", label: "Published" },
              { value: social, color: "var(--color-electric)", label: "With Social" },
              { value: production, color: "#a9c4f5", label: "In production" },
              { value: content, color: "#c3cde0", label: "In content" },
            ]}
          />
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
            {content > 0 && <span>{content} in content</span>}
            {production > 0 && <span>{production} in production</span>}
            {social > 0 && <span>{social} with Social</span>}
          </div>
        </>
      )}
    </div>
  );
}
