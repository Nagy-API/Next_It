import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Clock, ListTodo, PlayCircle, Sparkles } from "lucide-react";
import { cairoDate, formatDay, formatDuration, formatTime } from "@/lib/dates";
import type { PersonReport } from "@/server/reports";
import { Avatar, Badge, BrandDot, ExtraBadge, ProgressChip, StageChip, TimeSpent, TypeIcon } from "./ui";

/** "10:05 → 18:40" for one day, or the day-by-day lines for longer ranges. */
export function WorkedHours({ r, single }: { r: PersonReport; single: boolean }) {
  if (!r.days.length) return <span className="text-[12.5px] text-faint">No tracked time</span>;
  if (single) {
    const d = r.days[0];
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-ink-2">
        <Clock className="size-3.5 text-faint" /> {d.from ? formatTime(d.from) : "—"} → {d.to ? formatTime(d.to) : "—"}
      </span>
    );
  }
  return <span className="text-[12.5px] text-muted">{r.days.length} working days</span>;
}

/** One person's report: finished (with the time it took), worked on, still open, tasks done; day by day for longer ranges. */
export function PersonReportBody({ r, single }: { r: PersonReport; single: boolean }) {
  return (
    <div className="space-y-5">
      {!single && r.days.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Day by day</h4>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-subtle text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">From → to</th>
                  <th className="px-3 py-2">Worked</th>
                  <th className="px-3 py-2">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {r.days.map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-1.5 font-medium">{formatDay(d.day)}</td>
                    <td className="px-3 py-1.5">
                      {d.from ? formatTime(d.from) : "—"} → {d.to ? formatTime(d.to) : "—"}
                    </td>
                    <td className="px-3 py-1.5">{d.workedMs ? formatDuration(d.workedMs) : "—"}</td>
                    <td className="px-3 py-1.5">{d.finished || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          <CheckCircle2 className="size-3.5 text-ok" /> Finished ({r.finished.length + r.tasksDone.length})
        </h4>
        {r.finished.length + r.tasksDone.length === 0 ? (
          <p className="text-[13px] text-faint">Nothing finished in this period.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {r.finished.map((f) => (
              <li key={f.id}>
                <Link href={`/items/${f.itemId}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[13px] hover:bg-hover">
                  <TypeIcon type={f.type} />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                  {f.extra && <ExtraBadge />}
                  <span className="flex items-center gap-1 text-[12px] text-muted">
                    {f.brand && <BrandDot color={f.brand.color} />}
                    {f.brand?.name ?? f.client}
                  </span>
                  <StageChip kind={f.kind} short className="!px-1.5 !py-0 !text-[11px]" />
                  {f.workedMs > 0 && <TimeSpent ms={f.workedMs} prefix="took " className="!text-[12px]" />}
                  <span className="text-[12px] tabular-nums text-muted">
                    {f.startedAt ? `${formatTime(f.startedAt)}${cairoDate(f.startedAt) !== cairoDate(f.completedAt) ? ` ${formatDay(cairoDate(f.startedAt), { weekday: false })}` : ""} → ` : ""}
                    {formatTime(f.completedAt)} {single ? "" : formatDay(cairoDate(f.completedAt), { weekday: false })}
                  </span>
                  {f.round > 1 ? <Badge tone="back">Revision</Badge> : f.lateDays > 0 ? <Badge tone="bad">{f.lateDays}d late</Badge> : f.deadline ? <Badge tone="ok">On time</Badge> : null}
                </Link>
              </li>
            ))}
            {r.tasksDone.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[13px]">
                <ListTodo className="size-4 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <span className="text-[12px] text-muted">task from {t.createdByName}</span>
                <span className="text-[12px] tabular-nums text-muted">
                  {formatTime(t.doneAt)} {single ? "" : formatDay(cairoDate(t.doneAt), { weekday: false })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.sessions.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
            <PlayCircle className="size-3.5 text-electric" /> Worked on ({formatDuration(r.workedMs)})
          </h4>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {r.sessions.map((w) => (
              <li key={w.id}>
                <Link href={`/items/${w.itemId}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[13px] hover:bg-hover">
                  <TypeIcon type={w.type} />
                  <span className="min-w-0 flex-1 truncate">{w.title}</span>
                  <span className="flex items-center gap-1 text-[12px] text-muted">
                    {w.brand && <BrandDot color={w.brand.color} />}
                    {w.brand?.name ?? w.client}
                  </span>
                  {w.kind && <StageChip kind={w.kind} short className="!px-1.5 !py-0 !text-[11px]" />}
                  <span className={clsx("rounded-full px-1.5 text-[11px] font-semibold", w.status === "adjusting" ? "bg-[#fef3e2] text-[#b45309]" : "bg-[#e8f0fe] text-[#1d5fd1]")}>{w.status === "adjusting" ? "Adjusting" : "In progress"}</span>
                  <span className="text-[12px] tabular-nums text-muted">
                    {single ? "" : `${formatDay(cairoDate(w.startedAt), { weekday: false })} `}
                    {formatTime(w.startedAt)} → {w.endedAt ? formatTime(w.endedAt) : "now"} · {formatDuration(w.ms)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          <Sparkles className="size-3.5 text-[#c2410c]" /> Not finished yet ({r.open.length})
        </h4>
        {r.open.length === 0 ? (
          <p className="text-[13px] text-faint">Nothing open on them.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {r.open.map((i) => (
              <li key={i.id}>
                <Link href={`/items/${i.id}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[13px] hover:bg-hover">
                  <TypeIcon type={i.type} />
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  {i.extra && <ExtraBadge />}
                  <span className="flex items-center gap-1 text-[12px] text-muted">
                    {i.brand && <BrandDot color={i.brand.color} />}
                    {i.brand?.name ?? i.project?.clientName}
                  </span>
                  {i.current && <StageChip kind={i.current.kind} short className="!px-1.5 !py-0 !text-[11px]" />}
                  {i.current && <ProgressChip progress={i.current.progress} scheduledFor={i.current.scheduledFor} running={i.current.time.running} className="!px-1.5 !py-0 !text-[11px]" />}
                  {i.current && i.current.time.ms > 0 && <TimeSpent ms={i.current.time.ms} running={i.current.time.running} className="!text-[12px]" />}
                  {i.current?.activatedAt && <span className="text-[12px] text-muted">arrived {formatDay(cairoDate(i.current.activatedAt), { weekday: false })} {formatTime(i.current.activatedAt)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The row on top of each person's report. */
export function PersonReportHead({ r, single }: { r: PersonReport; single: boolean }) {
  const inProgress = r.open.filter((i) => i.current?.time.running).length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="flex min-w-[170px] items-center gap-2.5">
        <Avatar name={r.person.name} size={34} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{r.person.name}</span>
          <span className="block truncate text-[12px] text-muted">{r.person.title}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="rounded-full bg-ok-soft px-2 py-0.5 font-semibold text-ok">{r.finished.length + r.tasksDone.length} finished</span>
        {r.extrasDone > 0 && <span className="rounded-full bg-[#fff1dc] px-2 py-0.5 font-semibold text-[#b45309]">{r.extrasDone} extra</span>}
        <span className="rounded-full bg-[#e8f0fe] px-2 py-0.5 font-semibold text-[#1d5fd1]">{r.workedMs ? formatDuration(r.workedMs) : "0 min"} worked</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold text-ink-2">{r.open.length} open</span>
        {inProgress > 0 && <span className="rounded-full bg-electric px-2 py-0.5 font-semibold text-white">working now</span>}
      </span>
      <span className="ml-auto">
        <WorkedHours r={r} single={single} />
      </span>
    </div>
  );
}

