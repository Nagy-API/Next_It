import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Archive, CalendarDays, Camera, ChevronLeft, ChevronRight, Download, List, Plus, Settings2 } from "lucide-react";
import { InlineTitle } from "@/components/inline-edit";
import { updateBrandAction } from "@/app/actions";
import { BulkList } from "@/components/bulk-list";
import { MonthCalendar } from "@/components/month-calendar";
import { Badge, BrandMark, ButtonLink, Empty, Person, ProgressBar, Stat, btn } from "@/components/ui";
import { TYPE_META } from "@/domain/workflow";
import type { ContentType } from "@/db/schema";
import { monthKey, monthLabel, monthName, parseMonthKey, shiftMonth, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { can, isManager } from "@/domain/permissions";
import { attachmentsFor } from "@/server/attachments";
import { MonthLinks } from "./month-links";
import { MonthDone } from "./month-done";
import { getBrandBySlug, getBrandMonths, getPlan, getWorkItems } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">) {
  const b = await getBrandBySlug((await params).slug);
  return { title: b?.name ?? "Brand" };
}

export default async function BrandPage({ params, searchParams }: PageProps<"/brands/[slug]">) {
  const me = await requireUser();
  const canAdd = can.editContent(me);
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
  const planFiles = await attachmentsFor({ planIds: plan ? [plan.id] : [] });
  // Team filter: Media Production = Reels, Graphic Design = Posts & Carousels.
  const TEAM_TYPES: Record<string, ContentType[]> = { media: ["reel"], design: ["static", "carousel"], story: ["story"] };
  const team = typeof sp.team === "string" && (TEAM_TYPES[sp.team] || sp.team === "extra") ? sp.team : "";
  const stateF = sp.state === "open" || sp.state === "done" ? sp.state : "";
  const allLive = items.filter((i) => !i.cancelledAt);
  const shown = items.filter(
    (i) =>
      (!team || (team === "extra" ? !!i.extra : TEAM_TYPES[team].includes(i.type))) && (!stateF || (stateF === "done" ? !!i.completedAt : !i.completedAt)),
  );
  const live = shown.filter((i) => !i.cancelledAt);
  const prev = shiftMonth(sel.year, sel.month, -1);
  const next = shiftMonth(sel.year, sel.month, 1);
  const base = `/brands/${brand.slug}`;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("m", o.m ?? monthKey(sel.year, sel.month));
    if ((o.view ?? view) === "calendar") p.set("view", "calendar");
    if (o.cancelled ?? (showCancelled ? "1" : undefined)) p.set("cancelled", "1");
    const t = o.team ?? team;
    if (t) p.set("team", t);
    const st = o.state ?? stateF;
    if (st) p.set("state", st);
    return `${base}?${p}`;
  };
  // The plan's progress counts only planned items; extra tasks given on top are counted on their own.
  const planned = live.filter((i) => !i.extra);
  const extras = live.filter((i) => i.extra);
  const done = planned.filter((i) => i.completedAt).length;
  const social = live.filter((i) => i.current?.kind === "social").length;
  const production = live.filter((i) => i.current && ["shooting", "media", "design"].includes(i.current.kind)).length;
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
          <span aria-hidden className="mb-2 block h-1 w-12 rounded-full" style={{ background: brand.color }} />
          <Link href="/brands" className="text-[13px] text-muted hover:text-electric">
            Brands
          </Link>
          <h1 className="mt-1 flex items-center gap-3 font-display text-[26px] font-bold tracking-[-0.01em] sm:text-[28px]">
            <BrandMark name={brand.name} color={brand.color} logoUrl={brand.logoUrl} size={38} className="!rounded-xl" />
            {can.manageBrands(me) ? (
              <InlineTitle value={brand.name} fields={{ brandId: brand.id }} name="name" action={updateBrandAction} label="Rename the brand" inputClassName="!h-10 !text-[20px] font-bold">
                <span>{brand.name}</span>
              </InlineTitle>
            ) : (
              brand.name
            )}
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
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/shoots?brand=${brand.slug}`} variant="secondary" size="md">
            <Camera className="size-4" /> Shoots
          </ButtonLink>
          {can.exportPlan(me) && (
            <a href={`/api/export/plan?brand=${brand.slug}&m=${monthKey(sel.year, sel.month)}`} className={btn("secondary", "md")} title="Title, posting date, Canva slide link and more">
              <Download className="size-4" /> Excel
            </a>
          )}
          {can.manageBrands(me) && (
            <ButtonLink href={`/settings/brands#${brand.slug}`} variant="ghost" size="md">
              <Settings2 className="size-4" /> Brand settings
            </ButtonLink>
          )}
          {brand.isActive && canAdd && (
            <ButtonLink href={addHref} variant="primary">
              <Plus className="size-4" strokeWidth={2.5} /> Add content
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Month navigation: Brand → Year → Month */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-card">
          <Link href={q({ m: monthKey(prev.year, prev.month) })} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[150px] text-center font-display text-[16px] font-bold">{monthLabel(sel.year, sel.month)}</span>
          <Link href={q({ m: monthKey(next.year, next.month) })} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Next month">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-1 shadow-card">
          <Link href={q({ view: "list" })} className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", view === "list" ? "bg-strong text-white" : "text-muted hover:text-ink")}>
            <List className="size-4" /> List
          </Link>
          <Link href={q({ view: "calendar" })} className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", view === "calendar" ? "bg-strong text-white" : "text-muted hover:text-ink")}>
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

      <div className="mt-4">
        <MonthLinks
          brandId={brand.id}
          year={sel.year}
          month={sel.month}
          canvaUrl={plan?.canvaUrl ?? null}
          driveFolderUrl={plan?.driveFolderUrl ?? null}
          canEdit={canAdd && brand.isActive}
          monthLabel={monthName(sel.month)}
          planId={plan?.id ?? null}
          files={plan ? (planFiles.get(plan.id) ?? []) : []}
          meId={me.id}
          manager={isManager(me)}
        />
      </div>

      {planned.length > 0 && done === planned.length && <MonthDone brand={brand.name} color={brand.color} month={monthLabel(sel.year, sel.month)} total={planned.length} keyId={`${brand.id}:${monthKey(sel.year, sel.month)}`} />}

      {allLive.length === 0 ? (
        <div className="mt-6">
          <Empty icon={CalendarDays} title={`No content planned for ${monthLabel(sel.year, sel.month)}`} action={brand.isActive && canAdd ? <ButtonLink href={addHref} variant="primary"><Plus className="size-4" /> Add the {monthName(sel.month)} plan</ButtonLink> : undefined}>
            {brand.isActive ? "Paste the month's list from Canva or add items one by one — it takes a minute." : "This brand is archived. Its past months are still here."}
          </Empty>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card col-span-2 px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[12px] font-medium text-muted">Progress</div>
                <div className="text-[12px] text-muted">{typeCounts.map(([t, n]) => `${n} ${n === 1 ? TYPE_META[t].label : TYPE_META[t].plural}`).join(" · ")}</div>
              </div>
              <div className="mt-1 font-display text-[28px] font-bold leading-none">
                {done}
                <span className="text-[16px] font-semibold text-muted">/{planned.length} published</span>
                {extras.length > 0 && (
                  <span className="ml-2 align-middle text-[13px] font-semibold text-[#b45309]">
                    + {extras.length} extra · {extras.filter((i) => i.completedAt).length} done
                  </span>
                )}
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {[
                { key: "", label: "Everything", n: allLive.length },
                { key: "media", label: "Media Production · Reels", n: allLive.filter((i) => i.type === "reel").length },
                { key: "design", label: "Graphic Design · Posts & Carousels", n: allLive.filter((i) => i.type === "static" || i.type === "carousel").length },
                { key: "story", label: "Stories", n: allLive.filter((i) => i.type === "story").length },
                { key: "extra", label: "Extra tasks", n: allLive.filter((i) => i.extra).length },
              ]
                .filter((c) => c.key === "" || c.n > 0)
                .map((c) => (
                  <Link
                    key={c.key || "all"}
                    href={q({ team: c.key })}
                    className={clsx(
                      "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      team === c.key ? "border-strong bg-strong text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {c.label} <span className={team === c.key ? "text-white/60" : "text-faint"}>{c.n}</span>
                  </Link>
                ))}
              <span className="mx-1 h-5 w-px bg-line-strong" />
              {[
                { key: "", label: "All" },
                { key: "open", label: "Not finished" },
                { key: "done", label: "Published" },
              ].map((c) => (
                <Link
                  key={c.key || "any"}
                  href={q({ state: c.key })}
                  className={clsx("rounded-full px-3 py-1.5 text-[13px] font-medium", stateF === c.key ? "bg-electric-soft text-[#1d5fd1]" : "text-muted hover:text-ink")}
                >
                  {c.label}
                </Link>
              ))}
            </div>
            {shown.length === 0 ? (
              <Empty title="Nothing here with these filters" />
            ) : view === "calendar" ? (
              <MonthCalendar year={sel.year} month={sel.month} items={shown} editable={canAdd && brand.isActive} />
            ) : (
              <BulkList items={shown} people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))} selectable={canAdd} canDeadline={can.setDeadline(me)} />
            )}
          </div>
          <div className="mt-3 text-right">
            <Link href={q({ cancelled: showCancelled ? "" : "1" })} className="text-[12.5px] text-muted hover:text-electric">
              {showCancelled ? "Hide deleted items" : "Show deleted items"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
