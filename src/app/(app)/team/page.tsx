import Link from "next/link";
import clsx from "clsx";
import { Avatar, PageHeader } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { TEAM_META } from "@/domain/workflow";
import { formatDay } from "@/lib/dates";
import { resolveRange } from "@/lib/ranges";
import { requireUser } from "@/server/auth";
import { getInsights, type PersonInsight } from "@/server/queries";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  await requireUser();
  const range = resolveRange(await searchParams);
  const rows = (await getInsights(range.from, range.to)).filter((r) => r.person.isActive || r.completed > 0);
  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={`What each person handled from ${formatDay(range.from, { weekday: false })} to ${formatDay(range.to, { weekday: false })}. Lateness only counts when the work was actually with them — never when they were waiting on a previous stage, and never when marked as an exception.`}
      />
      <div className="mb-5">
        <RangePicker current={range.key} from={range.from} to={range.to} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <PersonCard key={r.person.id} r={r} q={`?range=${range.key}${range.key === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`} />
        ))}
      </div>
    </div>
  );
}

function PersonCard({ r, q }: { r: PersonInsight; q: string }) {
  const withDeadline = r.onTime + r.late + r.excused;
  return (
    <Link href={`/team/${r.person.username}${q}`} className={clsx("card group block p-5 transition-colors hover:border-line-strong", !r.person.isActive && "opacity-70")}>
      <div className="flex items-center gap-3">
        <Avatar name={r.person.name} size={40} />
        <div className="min-w-0">
          <div className="font-display text-[16px] font-bold group-hover:text-electric">{r.person.name}</div>
          <div className="truncate text-[12.5px] text-muted">{r.person.isActive ? r.person.teams.map((t) => TEAM_META[t].label).join(" · ") || r.person.title : "Inactive"}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Num label="Completed" value={r.completed} />
        <Num label="With them now" value={r.openNow} />
        <Num label="Late now" value={r.overdueNow} tone={r.overdueNow ? "bad" : undefined} />
      </div>
      <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12.5px]">
        <Line label="Deadlines met" value={withDeadline ? `${r.onTime} of ${withDeadline}` : "—"} />
        <Line label="Missed deadlines" value={r.late} tone={r.late ? "bad" : undefined} />
        {r.excused > 0 && <Line label="Missed with exception (not counted)" value={r.excused} />}
        {r.rework > 0 && <Line label="Revisions after send-back" value={r.rework} />}
        {r.waitingNow > 0 && <Line label="Waiting to reach them (not late)" value={r.waitingNow} />}
      </div>
    </Link>
  );
}

function Num({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg bg-canvas px-2 py-2.5">
      <div className={clsx("font-display text-[22px] font-bold leading-none", tone === "bad" && "text-bad", value === 0 && "text-faint")}>{value}</div>
      <div className="mt-1 text-[11.5px] text-muted">{label}</div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={clsx("font-semibold tabular-nums", tone === "bad" && "text-bad")}>{value}</span>
    </div>
  );
}
