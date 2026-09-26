import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Archive, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Settings2 } from "lucide-react";
import { BulkList } from "@/components/bulk-list";
import { MonthCalendar } from "@/components/month-calendar";
import { Badge, BrandDot, ButtonLink, Empty, Person, ProgressBar, Stat } from "@/components/ui";
import { TYPE_META } from "@/domain/workflow";
import type { ContentType } from "@/db/schema";
import { monthKey, monthLabel, monthName, parseMonthKey, shiftMonth, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getBrandBySlug, getBrandMonths, getPlan, getWorkItems } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">) {
  const b = await getBrandBySlug((await params).slug);
  return { title: b?.name ?? "Brand" };
}

export default async function BrandPage({ params, searchParams }: PageProps<"/brands/[slug]">) {
  await requireUser();
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const months = await getBrandMonths(brand.id);
  const today = todayISO();
  const cur = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };

  // Default month: this month if it has a plan, else the next upcoming plan, else the latest plan, else this month.
  let sel = parseMonthKey(typeof sp.m === "string" ? sp.m : null);
  if (!sel) {
    const key = (y: number, m: number) => y * 12 + m;
    const now = key(cur.year, cur.month);
    const has = (y: number, m: number) => months.some((p) => p.year === y && p.month === m && p.total > 0);
    const upcoming = [...months].filter((p) => key(p.year, p.month) > now && p.total > 0).sort((a, b) => key(a.year, a.month) - key(b.year, b.month))[0];
    sel = has(cur.year, cur.month) ? cur : upcoming ? { year: upcoming.year, month: upcoming.month } : months[0] ? { year: months[0].year, month: months[0].month } : cur;
  }
  const view = sp.view === "calendar" ? "calendar" : "list";
  const showCancelled = sp.cancelled === "1";
  const plan = await getPlan(brand.id, sel.year, sel.month);
  const [items, people] = await Promise.all([
    plan ? getWorkItems({ planIds: [plan.id], includeDone: true, includeCancelled: showCancelled }) : Promise.resolve([]),
    getActivePeople(),
  ]);
  const live = items.filter((i) => !i.cancelledAt);
  const prev = shiftMonth(sel.year, sel.month, -1);
  const next = shiftMonth(sel.year, sel.month, 1);
  const base = `/brands/${brand.slug}`;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("m", o.m ?? monthKey(sel.year, sel.month));
    if ((o.view ?? view) === "calendar") p.set("view", "calendar");
    if (o.cancelled ?? (showCancelled ? "1" : undefined)) p.set("cancelled", "1");
    return `${base}?${p}`;
  };
  const done = live.filter((i) => i.completedAt).length;
  const social = live.filter((i) => i.current?.kind === "social").length;
  const production = live.filter((i) => i.current && ["media", "design"].includes(i.current.kind)).length;
  const content = live.filter((i) => i.current?.kind === "content").length;
  const late = live.filter((i) => i.attention === "overdue").length;
  const blocked = live.filter((i) => i.stages.some((s) => s.health === "blocked")).length;
  const typeCounts = (Object.keys(TYPE_META) as ContentType[]).map((t) => [t, live.filter((i) => i.type === t).length] as const).filter(([, n]) => n > 0);
  const years = [...new Set(months.map((m) => m.year))];
  const addHref = `/add?brand=${brand.slug}&m=${monthKey(sel.year, sel.month)}`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/brands" className="text-[13px] text-muted hover:text-electric">
            Brands
          </Link>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-[28px] font-bold tracking-[-0.01em]">
            <BrandDot color={brand.color} className="size-3.5" />
            {brand.name}
            {!brand.isActive && (
              <Badge tone="neutral" icon={Archive}>
                Archived
              </Badge>
            )}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
            Content by default: <Person name={brand.creatorName} size={20} />
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/settings/brands#${brand.slug}`} variant="ghost" size="md">
            <Settings2 className="size-4" /> Brand settings
          </ButtonLink>
          {brand.isActive && (
            <ButtonLink href={addHref} variant="primary">
              <Plus className="size-4" strokeWidth={2.5} /> Add content
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Month navigation: Brand → Year → Month */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-line bg-white p-1 shadow-card">
          <Link href={q({ m: monthKey(prev.year, prev.month) })} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[150px] text-center font-display text-[16px] font-bold">{monthLabel(sel.year, sel.month)}</span>
          <Link href={q({ m: monthKey(next.year, next.month) })} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Next month">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1 shadow-card">
          <Link href={q({ view: "list" })} className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", view === "list" ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
            <List className="size-4" /> List
          </Link>
          <Link href={q({ view: "calendar" })} className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", view === "calendar" ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
            <CalendarDays className="size-4" /> Calendar
          </Link>
        </div>
        {months.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="text-muted">History:</span>
            {years.map((y) => (
              <span key={y} className="flex items-center gap-1">
                <span className="font-semibold text-ink-2">{y}</span>
                {months
                  .filter((m) => m.year === y)
                  .sort((a, b) => a.month - b.month)
                  .map((m) => (
                    <Link
                      key={m.id}
                      href={q({ m: monthKey(m.year, m.month) })}
                      title={`${m.total} items · ${m.done} finished`}
                      className={clsx(
                        "rounded-md px-1.5 py-0.5",
                        m.year === sel.year && m.month === sel.month ? "bg-electric text-white" : "text-electric hover:bg-electric-soft",
                      )}
                    >
                      {monthName(m.month, true)}
                    </Link>
                  ))}
              </span>
            ))}
          </div>
        )}
      </div>

      {live.length === 0 ? (
        <div className="mt-6">
          <Empty icon={CalendarDays} title={`No content planned for ${monthLabel(sel.year, sel.month)}`} action={brand.isActive ? <ButtonLink href={addHref} variant="primary"><Plus className="size-4" /> Add the {monthName(sel.month)} plan</ButtonLink> : undefined}>
            {brand.isActive ? "Paste the month's list from Canva or add items one by one — it takes a minute." : "This brand is archived. Its past months are still here."}
          </Empty>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="card px-4 py-3.5 lg:col-span-2">
              <div className="flex items-baseline justify-between">
                <div className="text-[12px] font-medium text-muted">Progress</div>
                <div className="text-[12px] text-muted">{typeCounts.map(([t, n]) => `${n} ${n === 1 ? TYPE_META[t].label : TYPE_META[t].plural}`).join(" · ")}</div>
              </div>
              <div className="mt-1 font-display text-[28px] font-bold leading-none">
                {done}
                <span className="text-[16px] font-semibold text-muted">/{live.length} published</span>
              </div>
              <ProgressBar
                className="mt-3 h-2"
                segments={[
                  { value: done, color: "var(--color-ok)", label: "Published" },
                  { value: social, color: "var(--color-electric)", label: "With Social" },
                  { value: production, color: "#a9c4f5", label: "In production" },
                  { value: content, color: "#c3cde0", label: "In content" },
                ]}
              />
            </div>
            <Stat label="In production" value={production + content} hint={`${content} in content · ${production} media/design`} />
            <Stat label="With Social" value={social} tone={social ? "blue" : undefined} hint="Ready to schedule/publish" />
            <Stat label="Late" value={late} tone={late ? "bad" : undefined} hint={blocked ? `${blocked} waiting on a previous stage` : "Nothing blocked"} />
          </div>

          <div className="mt-6">
            {view === "calendar" ? <MonthCalendar year={sel.year} month={sel.month} items={items} /> : <BulkList items={items} people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))} />}
          </div>
          <div className="mt-3 text-right">
            <Link href={q({ cancelled: showCancelled ? "" : "1" })} className="text-[12.5px] text-muted hover:text-electric">
              {showCancelled ? "Hide cancelled items" : "Show cancelled items"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
