import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { CalendarClock, CheckCircle2, FileSpreadsheet, History, Send, Users, Tags } from "lucide-react";
import { RangePicker } from "@/components/range-picker";
import { PersonReportBody, PersonReportHead } from "@/components/report-parts";
import { BrandMark, Empty, PageHeader, ProgressChip, StageChip, TypeIcon } from "@/components/ui";
import { DueByPicker } from "./due-by";
import { can } from "@/domain/permissions";
import { STAGE_META } from "@/domain/workflow";
import { addDays, formatDay, formatRelative, isValidISODate, todayISO } from "@/lib/dates";
import { resolveRange } from "@/lib/ranges";
import { requireUser } from "@/server/auth";
import { getOpenItems } from "@/server/cached";
import { brandsReport, peopleReport } from "@/server/reports";

export const metadata = { title: "Reports" };

/** People: what each person did, finished and still has. Brands: what happened, finished, open, and what's due. */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireUser();
  if (!can.seeDashboard(me)) redirect(`/team/${me.username}`);
  const sp = await searchParams;
  const view = sp.view === "brands" ? "brands" : "people";
  const range = resolveRange({ range: "today", ...sp });
  const single = range.from === range.to;
  const today = todayISO();
  const dueBy = typeof sp.due === "string" && isValidISODate(sp.due) ? sp.due : addDays(today, 3);
  const open = await getOpenItems();
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")), ...patch })) if (v) p.set(k, String(v));
    return `/reports?${p}`;
  };
  const label = single ? (range.from === today ? "Today" : formatDay(range.from)) : `${formatDay(range.from, { weekday: false })} to ${formatDay(range.to, { weekday: false })}`;
  const exportHref = `/api/export/report?view=${view}&from=${range.from}&to=${range.to}&due=${dueBy}`;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Reports"
        subtitle={`${label} · ${view === "people" ? "what each person worked on, finished and still has" : "what happened in each brand, and what's due"}`}
        actions={
          <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[14px] font-semibold text-ink shadow-card hover:border-[#1d6f42] hover:text-[#1d6f42]">
            <FileSpreadsheet className="size-4 text-[#1d6f42]" /> Excel
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line bg-white p-1 shadow-card" role="tablist">
          {(
            [
              ["people", "People", Users],
              ["brands", "Brands", Tags],
            ] as const
          ).map(([k, l, Icon]) => (
            <Link key={k} href={qs({ view: k })} role="tab" aria-selected={view === k} className={clsx("inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[14px] font-semibold", view === k ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
              <Icon className="size-4" /> {l}
            </Link>
          ))}
        </div>
        <RangePicker current={range.key} from={range.from} to={range.to} keep={{ view }} />
      </div>

      {view === "people" ? <People from={range.from} to={range.to} single={single} open={open} /> : <Brands from={range.from} to={range.to} dueBy={dueBy} today={today} open={open} qsDue={(d) => qs({ due: d })} />}
    </div>
  );
}

async function People({ from, to, single, open }: { from: string; to: string; single: boolean; open: Awaited<ReturnType<typeof getOpenItems>> }) {
  const rows = (await peopleReport(from, to, { open })).sort(
    (a, b) => b.finished.length + b.tasksDone.length - (a.finished.length + a.tasksDone.length) || b.workedMs - a.workedMs || a.person.name.localeCompare(b.person.name),
  );
  // People with nothing in this period are listed in one line, not as empty cards.
  const active = rows.filter((r) => r.finished.length + r.tasksDone.length + r.sessions.length + r.open.length > 0);
  const idle = rows.filter((r) => !active.includes(r));
  const totals = rows.reduce((t, r) => ({ finished: t.finished + r.finished.length + r.tasksDone.length, worked: t.worked + r.workedMs, open: t.open + r.open.length }), { finished: 0, worked: 0, open: 0 });
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        <b className="text-ink">{totals.finished}</b> finished · <b className="text-ink">{rows.filter((r) => r.sessions.length).length}</b> people worked · <b className="text-ink">{totals.open}</b> still open. Tap a person for the details.
      </p>
      {active.map((r) => (
        <details key={r.person.id} className="card group overflow-hidden" open={active.length === 1}>
          <summary className="cursor-pointer list-none px-4 py-3 hover:bg-[#fafbfe]">
            <PersonReportHead r={r} single={single} />
          </summary>
          <div className="border-t border-line bg-[#fbfcfe] px-4 py-4">
            <PersonReportBody r={r} single={single} />
            <div className="mt-4 text-right">
              <Link href={`/team/${r.person.username}`} className="text-[13px] font-medium text-electric hover:underline">
                {r.person.name}&rsquo;s page →
              </Link>
            </div>
          </div>
        </details>
      ))}
      {idle.length > 0 && <p className="px-1 text-[12.5px] text-muted">Nothing tracked for {idle.map((r) => r.person.name).join(", ")}.</p>}
    </div>
  );
}

async function Brands({ from, to, dueBy, today, open, qsDue }: { from: string; to: string; dueBy: string; today: string; open: Awaited<ReturnType<typeof getOpenItems>>; qsDue: (d: string) => string }) {
  const rows = await brandsReport(from, to, dueBy, { open });
  return (
    <div className="space-y-4">
      <DueByPicker value={dueBy} today={today} hrefFor={[addDays(today, 1), addDays(today, 3), addDays(today, 7)].map((d) => ({ d, href: qsDue(d) }))} />
      {rows.length === 0 && <Empty title="No active brands" />}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {rows.map((b) => (
          <section key={b.brand.id} className="card overflow-hidden" style={{ boxShadow: `inset 0 3px 0 ${b.brand.color}` }}>
            <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
              <BrandMark name={b.brand.name} color={b.brand.color} logoUrl={b.brand.logoUrl} size={30} />
              <Link href={`/brands/${b.brand.slug}`} className="font-display text-[16px] font-bold hover:text-electric">
                {b.brand.name}
              </Link>
            </div>
            <div className="grid grid-cols-4 border-y border-line text-center">
              <Mini label="Happened" value={b.happenedCount} icon={History} />
              <Mini label="Steps done" value={b.finishedSteps.length} icon={CheckCircle2} tone="ok" />
              <Mini label="Published" value={b.published.length} icon={Send} tone="ok" />
              <Mini label="Open" value={b.notFinished.length} icon={CalendarClock} />
            </div>
            <div className="space-y-4 px-4 py-3.5">
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#c2410c]">Due by {formatDay(dueBy)} ({b.dueSoon.length})</h4>
                {b.dueSoon.length === 0 ? (
                  <p className="text-[12.5px] text-faint">Nothing due.</p>
                ) : (
                  <ul className="space-y-1">
                    {b.dueSoon.slice(0, 8).map((i) => (
                      <li key={i.id}>
                        <Link href={`/items/${i.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-canvas">
                          <TypeIcon type={i.type} className="size-3.5" />
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          {i.current && <StageChip kind={i.current.kind} short className="!px-1.5 !py-0 !text-[10.5px]" />}
                          {i.current && <ProgressChip progress={i.current.progress} scheduledFor={i.current.scheduledFor} hideNotStarted className="!px-1.5 !py-0 !text-[10.5px]" />}
                          <span className={clsx("shrink-0 text-[12px] tabular-nums", (i.postingDate ?? i.current?.deadline ?? "9") < today ? "font-semibold text-bad" : "text-muted")}>{formatDay(i.postingDate ?? i.current?.deadline, { weekday: false })}</span>
                        </Link>
                      </li>
                    ))}
                    {b.dueSoon.length > 8 && <li className="pl-1.5 text-[12px] text-muted">+{b.dueSoon.length - 8} more</li>}
                  </ul>
                )}
              </div>
              {b.finishedSteps.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ok">Finished</h4>
                  <ul className="space-y-1">
                    {b.finishedSteps.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <Link href={`/items/${s.itemId}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-canvas">
                          <CheckCircle2 className="size-3.5 shrink-0 text-ok" />
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          <span className="shrink-0 text-[12px] text-muted">
                            {STAGE_META[s.kind].short} · {s.by ?? "—"} · {formatRelative(s.at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {b.finishedSteps.length > 6 && <li className="pl-1.5 text-[12px] text-muted">+{b.finishedSteps.length - 6} more</li>}
                  </ul>
                </div>
              )}
              {b.happened.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">What happened ({b.happenedCount})</summary>
                  <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
                    {b.happened.map((a) => (
                      <li key={a.id} className="flex gap-2">
                        <span className="shrink-0 tabular-nums text-faint">{formatRelative(a.at)}</span>
                        <span className="min-w-0">{a.summary}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {from === to && from === today && b.notFinished.length > 0 && (
                <p className="text-[12px] text-muted">
                  {b.notFinished.length} not finished: {(["content", "shooting", "media", "design", "social", "delivery"] as const)
                    .map((k) => [k, b.notFinished.filter((i) => i.current?.kind === k).length] as const)
                    .filter(([, n]) => n)
                    .map(([k, n]) => `${n} in ${STAGE_META[k].short}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof History; tone?: "ok" }) {
  return (
    <div className="border-r border-line px-2 py-2.5 last:border-r-0">
      <div className={clsx("font-display text-[20px] font-bold leading-none", tone === "ok" && value > 0 && "text-ok", !value && "text-faint")}>{value}</div>
      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
        <Icon className="hidden size-3 sm:block" /> {label}
      </div>
    </div>
  );
}

