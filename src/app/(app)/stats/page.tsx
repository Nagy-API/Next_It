import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/domain/permissions";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { Delta, Legend, Meter, MonthColumns, STAGE_RAMP, StackedBar } from "@/components/charts";
import { Avatar, BrandDot, SectionTitle } from "@/components/ui";
import { TEAM_META } from "@/domain/workflow";
import { monthKey, monthLabel, parseMonthKey, shiftMonth, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { finishedPerMonth, getDashboard } from "@/server/stats";

export const metadata = { title: "Dashboard" };

const STAGE_LEGEND = [
  { label: "In content", color: STAGE_RAMP.content },
  { label: "In production", color: STAGE_RAMP.production },
  { label: "With Social", color: STAGE_RAMP.social },
  { label: "Published", color: STAGE_RAMP.published },
];

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const me = await requireUser();
  if (!can.seeDashboard(me)) redirect(`/team/${me.username}`);
  const sp = await searchParams;
  const today = todayISO();
  const cur = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const sel = parseMonthKey(typeof sp.m === "string" ? sp.m : null) ?? cur;
  const [d, trend] = await Promise.all([getDashboard(sel.year, sel.month), finishedPerMonth(sel.year, sel.month, 6)]);
  const prev = shiftMonth(sel.year, sel.month, -1);
  const next = shiftMonth(sel.year, sel.month, 1);
  const prevShort = monthLabel(prev.year, prev.month).split(" ")[0].slice(0, 3);
  const deptTotals = d.departments;
  const totalRow = {
    media: { tasks: d.rows.reduce((a, r) => a + r.media.tasks, 0), done: d.rows.reduce((a, r) => a + r.media.done, 0) },
    design: { tasks: d.rows.reduce((a, r) => a + r.design.tasks, 0), done: d.rows.reduce((a, r) => a + r.design.done, 0) },
    social: { tasks: d.rows.reduce((a, r) => a + r.socialDept.tasks, 0), done: d.rows.reduce((a, r) => a + r.socialDept.done, 0) },
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.01em]">Dashboard</h1>
          <p className="mt-1 text-[14px] text-muted">Every brand, every team, every person — counted automatically from the work itself.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/export/dashboard?m=${monthKey(sel.year, sel.month)}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-semibold text-ink shadow-card hover:border-[#1d6f42] hover:text-[#1d6f42]">
          <FileSpreadsheet className="size-4 text-[#1d6f42]" /> Export to Excel
        </a>
        <div className="flex items-center rounded-xl border border-line bg-white p-1 shadow-card">
          <Link href={`/stats?m=${monthKey(prev.year, prev.month)}`} className="cursor-pointer rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[150px] text-center font-display text-[16px] font-bold">{d.label}</span>
          <Link href={`/stats?m=${monthKey(next.year, next.month)}`} className="cursor-pointer rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" aria-label="Next month">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        </div>
      </header>

      {/* KPI row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Planned for ${d.label.split(" ")[0]}`} value={d.totals.total} foot={<Delta now={d.totals.total} before={d.totals.prevTotal} label={prevShort} />} />
        <Kpi label="Published" value={d.totals.published} foot={<Delta now={d.totals.published} before={d.totals.prevPublished} label={prevShort} />} />
        <Kpi label="Still in progress" value={d.totals.inProgress} foot={<span className="text-[12px] text-muted">{d.totals.total ? Math.round((d.totals.published / d.totals.total) * 100) : 0}% of the month published</span>} />
        <Kpi label="Late right now" value={d.totals.late} tone={d.totals.late ? "bad" : undefined} foot={<span className="text-[12px] text-muted">across every brand, today</span>} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Brands */}
        <section className="card min-w-0 p-5">
          <SectionTitle right={<Legend items={STAGE_LEGEND} />}>Brands in {d.label}</SectionTitle>
          <div className="divide-y divide-line">
            {d.rows.map((r) => (
              <Link key={r.brand.id} href={`/brands/${r.brand.slug}?m=${monthKey(sel.year, sel.month)}`} className="grid items-center gap-x-4 gap-y-1.5 py-3 hover:bg-[#fafbfe] md:grid-cols-[180px_minmax(0,1fr)_150px]">
                <span className="flex items-center gap-2 font-medium">
                  <BrandDot color={r.brand.color} /> {r.brand.name}
                </span>
                <StackedBar
                  total={r.total}
                  segments={[
                    { label: "Published", value: r.published, color: STAGE_RAMP.published },
                    { label: "With Social", value: r.social, color: STAGE_RAMP.social },
                    { label: "In production", value: r.production, color: STAGE_RAMP.production },
                    { label: "In content", value: r.content, color: STAGE_RAMP.content },
                  ]}
                />
                <span className="text-right text-[13px] tabular-nums text-ink-2">
                  {r.total ? (
                    <>
                      <b className="text-ink">{r.published}</b>/{r.total} published{r.late ? <span className="ml-1.5 font-semibold text-bad">· {r.late} late</span> : null}
                    </>
                  ) : (
                    <span className="text-faint">no plan</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Month over month */}
        <section className="card p-5">
          <SectionTitle>Published per month</SectionTitle>
          <MonthColumns points={trend} unit="published" />
          <p className="mt-2 text-[12.5px] text-muted">Items finished (published or delivered) in each month.</p>
        </section>
      </div>

      {/* Departments — like the old Excel dashboard, but automatic */}
      <section className="card overflow-x-auto p-5">
        <SectionTitle right={<span className="text-[12.5px] text-muted">done / tasks · success rate</span>}>Teams by brand</SectionTitle>
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Brand</th>
              <th className="py-2 pr-4">Media Production</th>
              <th className="py-2 pr-4">Graphic Design</th>
              <th className="py-2 pr-4">Social Media</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.rows.map((r) => (
              <tr key={r.brand.id}>
                <td className="py-2.5 pr-4 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <BrandDot color={r.brand.color} /> {r.brand.name}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <Meter done={r.media.done} total={r.media.tasks} />
                </td>
                <td className="py-2.5 pr-4">
                  <Meter done={r.design.done} total={r.design.tasks} />
                </td>
                <td className="py-2.5 pr-4">
                  <Meter done={r.socialDept.done} total={r.socialDept.tasks} />
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-3 pr-4">All brands</td>
              <td className="py-3 pr-4">
                <Meter done={totalRow.media.done} total={totalRow.media.tasks} />
              </td>
              <td className="py-3 pr-4">
                <Meter done={totalRow.design.done} total={totalRow.design.tasks} />
              </td>
              <td className="py-3 pr-4">
                <Meter done={totalRow.social.done} total={totalRow.social.tasks} />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {deptTotals.map((t) => (
            <div key={t.kind} className="rounded-xl bg-canvas px-4 py-3">
              <div className="text-[12px] font-medium text-muted">{t.label}</div>
              <div className="mt-1 font-display text-[24px] font-bold leading-none">
                {t.tasks ? Math.round((t.done / t.tasks) * 100) : 0}%
                <span className="ml-2 text-[13px] font-medium text-muted">
                  {t.done}/{t.tasks} done
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* People */}
      <section className="card overflow-x-auto p-5">
        <SectionTitle right={<span className="text-[12.5px] text-muted">Steps each person finished · lateness only counts when the work was with them</span>}>People</SectionTitle>
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Person</th>
              <th className="py-2 pr-4 text-right">Done in {d.label.split(" ")[0]}</th>
              <th className="py-2 pr-4 text-right">vs {d.prevLabel.split(" ")[0]}</th>
              <th className="py-2 pr-4 text-right">Late</th>
              <th className="py-2 pr-4 text-right">On time</th>
              <th className="py-2 pr-4 text-right">On them now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.people.map((p) => (
              <tr key={p.person.id} className="hover:bg-[#fafbfe]">
                <td className="py-2.5 pr-4">
                  <Link href={`/team/${p.person.username}`} className="inline-flex items-center gap-2 font-medium hover:text-electric">
                    <Avatar name={p.person.name} size={24} /> {p.person.name}
                    <span className="text-[12px] font-normal text-muted">{p.person.teams.map((t) => TEAM_META[t].label).join(", ")}</span>
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">{p.done}</td>
                <td className="py-2.5 pr-4 text-right">
                  <Delta now={p.done} before={p.donePrev} label={d.prevLabel.split(" ")[0].slice(0, 3)} />
                </td>
                <td className={clsx("py-2.5 pr-4 text-right tabular-nums", p.late ? "font-semibold text-bad" : "text-muted")}>{p.late}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{p.onTimeRate === null ? <span className="text-faint">no deadlines</span> : `${p.onTimeRate}%`}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {p.openNow}
                  {p.lateNow ? <span className="ml-1 font-semibold text-bad">({p.lateNow} late)</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, foot, tone }: { label: string; value: number; foot?: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={clsx("mt-1.5 font-display text-[34px] font-bold leading-none tracking-tight", tone === "bad" && "text-bad")}>{value}</div>
      {foot && <div className="mt-2">{foot}</div>}
    </div>
  );
}
