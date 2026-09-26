import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, CalendarDays, Check, CircleUserRound, CornerUpLeft, Hourglass, Sparkles } from "lucide-react";
import { STAGE_META } from "@/domain/workflow";
import type { StageKind } from "@/db/schema";
import { addDays, dayOfWeek, formatDay, formatRelative, monthLabel, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getOpenItems } from "@/server/cached";
import { getActivity, getBrandMonthSummaries, getHomeData, tasksFor, type WorkItem } from "@/server/queries";
import { ItemRow } from "@/components/item-row";
import { Avatar, BrandDot, Empty, ProgressBar, SectionTitle, TypeIcon } from "@/components/ui";

export const metadata = { title: "Overview" };

const PIPELINE: StageKind[] = ["content", "media", "design", "social", "delivery"];

export default async function HomePage() {
  const user = await requireUser();
  const today = todayISO();
  const [open, home, activity] = await Promise.all([getOpenItems(), getHomeData(today), getActivity({ limit: 8 })]);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // Before the 20th people mostly care about this month; after, next month's plan is being prepared.
  const nextM = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const [thisMonth, nextMonth] = await Promise.all([getBrandMonthSummaries(year, month, today), getBrandMonthSummaries(nextM.year, nextM.month, today)]);

  const late = open.filter((i) => i.attention === "overdue");
  const returned = open.filter((i) => i.attention === "returned");
  const atRisk = open.filter((i) => i.attention === "at_risk");
  const unassigned = open.filter((i) => i.current && !i.current.assignee && i.attention !== "overdue" && i.attention !== "at_risk" && i.attention !== "returned");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date())}</div>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-[-0.01em]">
            {greeting}, {user.name}
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {open.length} pieces moving through the studio
            {late.length > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-bad">{late.length} late</span>
              </>
            ) : (
              " · nothing late 🎉"
            )}
          </p>
        </div>
      </header>

      <MyTasksStrip open={open} user={user} />

      {/* ---------------- The cycle ---------------- */}
      <section>
        <SectionTitle right={<span className="text-[12px] text-muted">Click a stage to see its work</span>}>Where the work is right now</SectionTitle>
        <Pipeline open={open} publishedThisMonth={home.finishedThisMonth} />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- Needs attention ---------------- */}
        <section className="min-w-0">
          <SectionTitle right={<Link href="/work" className="text-[13px] font-medium text-electric hover:underline">All open work</Link>}>Needs attention</SectionTitle>
          {late.length + returned.length + atRisk.length + unassigned.length === 0 ? (
            <Empty icon={Sparkles} title="All clear">Nothing is late, sent back, or missing an owner.</Empty>
          ) : (
            <div className="space-y-5">
              <AttentionGroup icon={AlertTriangle} tone="bad" title="Late" hint="Past the deadline while it's with this person" items={late} href="/work?status=late" />
              <AttentionGroup icon={CornerUpLeft} tone="back" title="Sent back for changes" items={returned} href="/work?status=returned" />
              <AttentionGroup icon={Hourglass} tone="warn" title="Posting soon, not with Social yet" hint="Posting within 3 days" items={atRisk} href="/work?status=at_risk" />
              <AttentionGroup icon={CircleUserRound} tone="wait" title="Waiting for someone to pick it up" hint="Current stage has no owner" items={unassigned} href="/work?status=unassigned" />
            </div>
          )}
        </section>

        {/* ---------------- This week ---------------- */}
        <section className="min-w-0">
          <SectionTitle right={<span className="text-[12px] text-muted">{formatDay(home.week.start, { weekday: false })} – {formatDay(home.week.end, { weekday: false })}</span>}>Publishing this week</SectionTitle>
          <ThisWeek items={home.publishingWeek} start={home.week.start} today={today} />
        </section>
      </div>

      {/* ---------------- Brands ---------------- */}
      <section>
        <SectionTitle>Brands</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {home.activeBrands.map((b) => {
            const cur = thisMonth.get(b.id) ?? [];
            const nxt = nextMonth.get(b.id) ?? [];
            return <BrandCard key={b.id} brand={b} items={cur} next={nxt} label={monthLabel(year, month)} nextLabel={monthLabel(nextM.year, nextM.month)} />;
          })}
        </div>
      </section>

      {/* ---------------- Activity ---------------- */}
      <section>
        <SectionTitle right={<Link href="/activity" className="text-[13px] font-medium text-electric hover:underline">Full history</Link>}>Latest changes</SectionTitle>
        <div className="card divide-y divide-line">
          {activity.rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px]">
              <Avatar name={a.actorName ?? "System"} size={24} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="text-ink-2">{a.summary}</span>
                {a.itemId && a.itemTitle && (
                  <Link href={`/items/${a.itemId}`} className="ml-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-electric">
                    {a.brandColor && <BrandDot color={a.brandColor} />}
                    {a.itemTitle}
                  </Link>
                )}
              </div>
              <span className="shrink-0 text-[12px] text-faint">{formatRelative(a.at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
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
            <Link key={k} href={`/work?stage=${k}`} className="group relative flex flex-1 flex-col border-r border-line px-4 py-4 transition-colors hover:bg-[#f8faff]">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted group-hover:text-electric">{STAGE_META[k].label}</span>
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

function BrandCard({ brand, items, next, label, nextLabel }: { brand: { id: string; name: string; slug: string; color: string }; items: WorkItem[]; next: WorkItem[]; label: string; nextLabel: string }) {
  const lateN = [...items, ...next].filter((i) => i.attention === "overdue").length;
  return (
    <Link href={`/brands/${brand.slug}`} className="card group block p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <BrandDot color={brand.color} className="size-2.5" />
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

function MonthProgress({ label, items }: { label: string; items: WorkItem[] }) {
  const done = items.filter((i) => i.completedAt).length;
  const social = items.filter((i) => i.current?.kind === "social").length;
  const production = items.filter((i) => i.current && (i.current.kind === "media" || i.current.kind === "design")).length;
  const content = items.filter((i) => i.current?.kind === "content").length;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        {items.length ? (
          <span className="tabular-nums">
            <span className="font-semibold">{done}</span>
            <span className="text-muted">/{items.length} published</span>
          </span>
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

function MyTasksStrip({ open, user }: { open: WorkItem[]; user: { id: string; teams: string[] } }) {
  const all = tasksFor(open, user);
  const mine = all.filter((i) => i.current?.assignee?.id === user.id).length;
  const forTeam = all.length - mine;
  if (!mine && !forTeam) return null;
  return (
    <Link href="/my-work" className="flex flex-wrap items-center gap-4 rounded-2xl bg-navy-900 px-5 py-4 text-white shadow-pop transition-colors hover:bg-navy-850">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[28px] font-bold leading-none">{mine}</span>
        <span className="text-[14px] text-white/70">with you</span>
      </div>
      {forTeam > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[28px] font-bold leading-none text-electric-bright">{forTeam}</span>
          <span className="text-[14px] text-white/70">new for your team</span>
        </div>
      )}
      <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-electric px-4 py-2 text-[14px] font-semibold">
        Open my tasks <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
