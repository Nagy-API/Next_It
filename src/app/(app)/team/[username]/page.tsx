import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isManager } from "@/domain/permissions";
import { eq } from "drizzle-orm";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ItemList } from "@/components/item-row";
import { RangePicker } from "@/components/range-picker";
import { Avatar, Badge, BrandDot, SectionTitle, Stat, TypeIcon } from "@/components/ui";
import { STAGE_META, TEAM_META } from "@/domain/workflow";
import { formatDateTime, formatDay, todayISO } from "@/lib/dates";
import { Delta, MonthColumns } from "@/components/charts";
import { personPerMonth } from "@/server/stats";
import { resolveRange } from "@/lib/ranges";
import { requireUser } from "@/server/auth";
import { getInsights, getPersonCompletions, getPersonWork } from "@/server/queries";

export default async function PersonPage({ params, searchParams }: PageProps<"/team/[username]">) {
  const me = await requireUser();
  const { username } = await params;
  // Everyone can see their own numbers; only managers see other people's.
  if (!isManager(me) && username !== me.username) redirect(`/team/${me.username}`);
  const [person] = await db.select().from(users).where(eq(users.username, username));
  if (!person) notFound();
  const range = resolveRange(await searchParams);
  const today = todayISO();
  const [insights, completions, work, months] = await Promise.all([
    getInsights(range.from, range.to),
    getPersonCompletions(person.id, range.from, range.to),
    getPersonWork(person.id),
    personPerMonth(person.id, Number(today.slice(0, 4)), Number(today.slice(5, 7)), 6),
  ]);
  const r = insights.find((x) => x.person.id === person.id)!;
  return (
    <div className="space-y-7">
      <div>
        <Link href="/team" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
          <ArrowLeft className="size-4" /> Team
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Avatar name={person.name} size={52} />
          <div>
            <h1 className="font-display text-[26px] font-bold">{person.name}</h1>
            <div className="text-[13px] text-muted">
              {person.title}
              {person.teams.length > 0 && ` · ${person.teams.map((t) => TEAM_META[t].label).join(", ")}`}
              {!person.isActive && " · Inactive"}
            </div>
          </div>
          <a
            href={`/api/export/person/${person.username}`}
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Stages completed" value={r.completed} hint={`${formatDay(range.from, { weekday: false })} – ${formatDay(range.to, { weekday: false })}`} />
        <Stat label="On time" value={r.onTime} tone={r.onTime ? "ok" : undefined} hint={`${r.noDeadline} had no deadline`} />
        <Stat label="Missed deadlines" value={r.late} tone={r.late ? "bad" : undefined} hint={r.excused ? `+${r.excused} excused (not counted)` : "Exceptions never count"} />
        <Stat label="With them now" value={r.openNow} hint={r.overdueNow ? `${r.overdueNow} late now` : "None late"} tone={r.overdueNow ? "bad" : undefined} />
        <Stat label="Waiting to reach them" value={r.waitingNow} hint="Not their delay" />
      </div>

      <section>
        <SectionTitle>With {person.name} now</SectionTitle>
        <ItemList items={work.now} showContext empty={<p className="text-[13px] text-muted">Nothing right now.</p>} />
      </section>

      <section>
        <SectionTitle right={<span className="text-[13px] text-muted">{completions.length}</span>}>Completed in this period</SectionTitle>
        {completions.length ? (
          <div className="card divide-y divide-line">
            {completions.map((c) => (
              <Link key={c.id} href={`/items/${c.itemId}`} className="grid items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-[#f8faff] md:grid-cols-[minmax(0,1fr)_180px_170px_150px]">
                <span className="flex min-w-0 items-center gap-2">
                  <TypeIcon type={c.type} />
                  <span className="truncate font-medium">{c.title}</span>
                </span>
                <span className="flex items-center gap-1.5 truncate text-muted">
                  {c.brandColor && <BrandDot color={c.brandColor} />}
                  {c.brandName ?? c.clientName} · {STAGE_META[c.kind].short}
                </span>
                <span className="text-[12.5px] text-muted">{formatDateTime(c.completedAt)}</span>
                <span className="flex justify-end">
                  {c.round > 1 ? (
                    <Badge tone="back">Revision</Badge>
                  ) : !c.deadline ? (
                    <Badge tone="neutral">No deadline</Badge>
                  ) : c.lateDays > 0 ? (
                    <Badge tone={c.excused ? "neutral" : "bad"}>{c.excused ? `${c.lateDays}d late · exception` : `${c.lateDays}d late`}</Badge>
                  ) : (
                    <Badge tone="ok">On time</Badge>
                  )}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No completed stages in this period.</p>
        )}
      </section>
    </div>
  );
}
