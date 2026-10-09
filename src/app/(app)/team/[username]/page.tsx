import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isManager } from "@/domain/permissions";
import { eq } from "drizzle-orm";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { RangePicker } from "@/components/range-picker";
import { PersonReportBody, PersonReportHead } from "@/components/report-parts";
import { Avatar, ManagerChip, Stat } from "@/components/ui";
import { TEAM_META } from "@/domain/workflow";
import { formatDay, todayISO } from "@/lib/dates";
import { Delta, MonthColumns } from "@/components/charts";
import { personPerMonth } from "@/server/stats";
import { resolveRange } from "@/lib/ranges";
import { requireUser } from "@/server/auth";
import { getInsights } from "@/server/queries";
import { peopleReport } from "@/server/reports";
import { getOpenItems } from "@/server/cached";

export default async function PersonPage({ params, searchParams }: PageProps<"/team/[username]">) {
  const me = await requireUser();
  const { username } = await params;
  // Everyone can see their own numbers; only managers see other people's.
  if (!isManager(me) && username !== me.username) redirect(`/team/${me.username}`);
  const [person] = await db.select().from(users).where(eq(users.username, username));
  if (!person) notFound();
  const range = resolveRange({ range: "today", ...(await searchParams) });
  const single = range.from === range.to;
  const today = todayISO();
  const [insights, months, open] = await Promise.all([
    getInsights(range.from, range.to),
    personPerMonth(person.id, Number(today.slice(0, 4)), Number(today.slice(5, 7)), 6),
    getOpenItems(),
  ]);
  const [rep] = await peopleReport(range.from, range.to, { userIds: [person.id], open });
  const r = insights.find((x) => x.person.id === person.id)!;
  const label = single ? (range.from === today ? "today" : formatDay(range.from)) : `${formatDay(range.from, { weekday: false })} to ${formatDay(range.to, { weekday: false })}`;
  return (
    <div className="space-y-7">
      <div>
        <Link href="/team" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
          <ArrowLeft className="size-4" /> Team
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Avatar name={person.name} size={52} />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-display text-[26px] font-bold">
              {person.name} {(person.isManager || person.isAdmin || person.roleLabel) && <ManagerChip role={person.roleLabel} className="font-sans" />}
            </h1>
            <div className="text-[13px] text-muted">
              {person.title}
              {person.teams.length > 0 && ` · ${person.teams.map((t) => TEAM_META[t].label).join(", ")}`}
              {!person.isActive && " · Inactive"}
            </div>
          </div>
          <a
            href={`/api/export/person/${person.username}?from=${range.from}&to=${range.to}`}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-semibold text-ink shadow-card hover:border-[#1d6f42] hover:text-[#1d6f42]"
          >
            <FileSpreadsheet className="size-4 text-[#1d6f42]" /> Export to Excel
          </a>
        </div>
      </div>
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[15px] font-bold">Month by month</h2>
          <span className="text-[13px]">
            <b>{months.at(-1)!.value}</b> this month · <Delta now={months.at(-1)!.value} before={months.at(-2)!.value} label={months.at(-2)!.label} />
          </span>
        </div>
        <MonthColumns points={months} unit="steps done" />
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {months.map((m) => (
            <span key={m.label} className="rounded-md bg-canvas px-2 py-1 text-ink-2">
              {m.label}: <b>{m.value}</b> done{m.late ? <span className="text-bad"> · {m.late} late</span> : null}
            </span>
          ))}
        </div>
      </section>
      <RangePicker current={range.key} from={range.from} to={range.to} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Steps finished" value={r.completed} hint={label} />
        <Stat label="On time" value={r.onTime} tone={r.onTime ? "ok" : undefined} hint={`${r.noDeadline} had no deadline`} />
        <Stat label="Missed deadlines" value={r.late} tone={r.late ? "bad" : undefined} hint={r.excused ? `+${r.excused} excused (not counted)` : "Exceptions never count"} />
        <Stat label="Extra finished" value={rep?.extrasDone ?? 0} hint="On top of the month's plan" />
        <Stat label="With them now" value={r.openNow} hint={r.overdueNow ? `${r.overdueNow} late now` : "None late"} tone={r.overdueNow ? "bad" : undefined} />
      </div>

      {rep && (
        <section className="card overflow-hidden">
          <div className="border-b border-line bg-[#fafbfe] px-5 py-3.5">
            <PersonReportHead r={rep} single={single} />
          </div>
          <div className="p-5">
            <PersonReportBody r={rep} single={single} />
          </div>
        </section>
      )}
    </div>
  );
}
