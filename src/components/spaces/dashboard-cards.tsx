import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, ListChecks, TrendingUp } from "lucide-react";
import { formatDay, formatDuration } from "@/lib/dates";
import type { DashboardData, WidgetKey } from "@/server/dashboards";
import { WIDGETS } from "@/server/dashboards";

/** The cards of a Spaces dashboard. Plain HTML/CSS bars: thin marks, values written out, hover for details. */
export function DashboardCards({ data, widgets }: { data: DashboardData; widgets: WidgetKey[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {widgets.map((w) => (
        <Card key={w} title={WIDGETS[w].label} wide={w === "summary" || w === "done_weeks"}>
          {w === "summary" && <Summary s={data.summary} />}
          {w === "status" && <Bars rows={data.byStatus.map((s) => ({ label: s.name, value: s.count, color: s.color }))} empty="No tasks yet" />}
          {w === "priority" && <Bars rows={data.byPriority.map((p) => ({ label: p.label, value: p.count, color: p.color }))} empty="Nothing open" note="Open tasks" />}
          {w === "people" && <People rows={data.byPerson} />}
          {w === "done_weeks" && <Weeks weeks={data.weeks} />}
          {w === "lists" && <Lists rows={data.perList} />}
          {w === "time" && <Bars rows={data.timeByPerson.map((p) => ({ label: p.name, value: p.ms, color: "#3b82f6", text: formatDuration(p.ms) }))} empty="No time tracked this month" />}
          {w === "overdue" && <TaskList rows={data.overdue} empty="Nothing overdue 🎉" tone="bad" />}
          {w === "due_soon" && <TaskList rows={data.dueSoon} empty="Nothing due in the next 7 days" tone="warn" />}
        </Card>
      ))}
    </div>
  );
}

function Card({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={clsx("card p-5", wide && "md:col-span-2")}>
      <h2 className="mb-3 font-display text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ s }: { s: DashboardData["summary"] }) {
  const tiles = [
    { label: "Open", value: s.open, icon: CircleDot, tone: "text-electric bg-electric-soft" },
    { label: "Done", value: s.done, icon: CheckCircle2, tone: "text-ok bg-ok-soft" },
    { label: "Overdue", value: s.overdue, icon: AlertTriangle, tone: s.overdue ? "text-bad bg-bad-soft" : "text-muted bg-canvas" },
    { label: "Done this week", value: s.doneThisWeek, icon: TrendingUp, tone: "text-[#6d28d9] bg-[#f1e8fd]" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line p-3">
            <span className={clsx("inline-grid size-7 place-items-center rounded-lg", t.tone)}>
              <t.icon className="size-4" />
            </span>
            <div className="mt-2 font-display text-[26px] font-bold tabular-nums leading-none">{t.value}</div>
            <div className="mt-1 text-[12.5px] text-muted">{t.label}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[12.5px]">
          <span className="text-muted">Complete</span>
          <span className="font-semibold tabular-nums">
            {s.pct}% <span className="font-normal text-muted">({s.done} of {s.total})</span>
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#e8ecf3]">
          <div className="h-full rounded-full bg-ok" style={{ width: `${s.pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Bars({ rows, empty, note }: { rows: { label: string; value: number; color: string; text?: string }[]; empty: string; note?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value)) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <div className="space-y-2">
      {note && <p className="text-[12px] text-muted">{note}</p>}
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-2" title={`${r.label}: ${r.text ?? r.value}`}>
          <span className="truncate text-[13px] text-ink-2">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#eef1f6]">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="text-right text-[12.5px] font-semibold tabular-nums">{r.text ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

function People({ rows }: { rows: DashboardData["byPerson"] }) {
  if (!rows.length) return <p className="text-[13px] text-muted">Nobody is assigned yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.open + r.done));
  return (
    <div className="space-y-2.5">
      <div className="flex gap-3 text-[11.5px] text-muted">
        <Key color="#10b981" label="Done" />
        <Key color="#3b82f6" label="Open" />
        <Key color="#e5484d" label="Overdue (part of open)" />
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[100px_minmax(0,1fr)_74px] items-center gap-2" title={`${r.name}: ${r.done} done, ${r.open} open, ${r.overdue} overdue`}>
          <span className="truncate text-[13px] text-ink-2">{r.name}</span>
          <span className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {r.done > 0 && <span className="h-full rounded-full bg-ok" style={{ width: `${(r.done / max) * 100}%` }} />}
            {r.open - r.overdue > 0 && <span className="h-full rounded-full bg-electric" style={{ width: `${((r.open - r.overdue) / max) * 100}%` }} />}
            {r.overdue > 0 && <span className="h-full rounded-full bg-bad" style={{ width: `${(r.overdue / max) * 100}%` }} />}
          </span>
          <span className="text-right text-[12px] tabular-nums text-muted">
            <b className="text-ink">{r.done}</b> / {r.open + r.done}
          </span>
        </div>
      ))}
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Weeks({ weeks }: { weeks: DashboardData["weeks"] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <div className="flex h-[150px] items-end gap-2">
      {weeks.map((w, i) => (
        <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${formatDay(w.start)}: ${w.count} done`}>
          <span className="text-[11.5px] font-semibold tabular-nums text-ink-2">{w.count || ""}</span>
          <span className={clsx("w-full max-w-[44px] rounded-t-[4px]", i === weeks.length - 1 ? "bg-electric" : "bg-[#9cc2fb]")} style={{ height: `${Math.max(2, (w.count / max) * 110)}px` }} />
          <span className="text-[10.5px] tabular-nums text-faint">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

function Lists({ rows }: { rows: DashboardData["perList"] }) {
  if (!rows.length) return <p className="text-[13px] text-muted">No lists.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((l) => {
        const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
        return (
          <li key={l.id}>
            <Link href={`/spaces/${l.spaceId}?list=${l.id}`} className="group block">
              <div className="mb-1 flex justify-between gap-2 text-[13px]">
                <span className="truncate font-medium group-hover:text-electric">
                  <ListChecks className="mr-1 inline size-3.5 text-faint" />
                  {l.name} <span className="text-faint">· {l.space}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {l.done}/{l.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#eef1f6]">
                <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TaskList({ rows, empty, tone }: { rows: DashboardData["overdue"]; empty: string; tone: "bad" | "warn" }) {
  if (!rows.length) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/spaces/${t.spaceId}/t/${t.id}`} className="flex items-center gap-2 py-2 hover:text-electric">
            <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{t.title}</span>
            <span className="hidden truncate text-[12px] text-muted sm:inline">{t.people.join(", ")}</span>
            <span className={clsx("inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold", tone === "bad" ? "text-bad" : "text-warn")}>
              <CalendarClock className="size-3.5" /> {formatDay(t.dueDate)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
