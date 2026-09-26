import Link from "next/link";
import clsx from "clsx";
import { STAGE_META } from "@/domain/workflow";
import { addDays, dayOfWeek, monthRange, todayISO } from "@/lib/dates";
import type { WorkItem } from "@/server/queries";
import { TypeIcon } from "./ui";

const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function tone(i: WorkItem) {
  if (i.cancelledAt) return "border-l-line-strong bg-[#f3f5f9] text-muted line-through";
  if (i.completedAt) return "border-l-ok bg-ok-soft/70";
  if (i.attention === "overdue") return "border-l-bad bg-bad-soft/70";
  if (i.attention === "returned") return "border-l-back bg-back-soft/70";
  if (i.current?.kind === "social") return "border-l-electric bg-electric-soft";
  return "border-l-[#9fb4d8] bg-white";
}

/** Saturday-first month grid. Each item sits on its posting date; click opens the item. */
export function MonthCalendar({ year, month, items }: { year: number; month: number; items: WorkItem[] }) {
  const { start, end } = monthRange(year, month);
  const lead = (dayOfWeek(start) + 1) % 7;
  const gridStart = addDays(start, -lead);
  const totalDays = Math.ceil((lead + Number(end.slice(8))) / 7) * 7;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  const today = todayISO();
  const undated = items.filter((i) => !i.postingDate);

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-[#fafbfd]">
          {WEEKDAYS.map((d) => (
            <div key={d} className={clsx("px-2 py-2 text-center text-[11.5px] font-semibold uppercase tracking-wide", d === "Fri" ? "text-faint" : "text-muted")}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, idx) => {
            const inMonth = d >= start && d <= end;
            const list = items.filter((i) => i.postingDate === d);
            return (
              <div key={d} className={clsx("min-h-[118px] border-line p-1.5", idx % 7 !== 6 && "border-r", idx < totalDays - 7 && "border-b", !inMonth && "bg-[#fafbfd]")}>
                <div className="mb-1 flex justify-end px-1">
                  <span
                    className={clsx(
                      "flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      d === today ? "bg-electric text-white" : inMonth ? "text-ink-2" : "text-faint",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
                <div className="space-y-1">
                  {list.map((i) => (
                    <Link
                      key={i.id}
                      href={`/items/${i.id}`}
                      title={`${i.title} — ${i.completedAt ? "Published" : i.current ? `${STAGE_META[i.current.kind].label} · ${i.current.assignee?.name ?? "Unassigned"}` : ""}`}
                      className={clsx("block rounded-md border border-l-[3px] border-line px-1.5 py-1 text-[12px] leading-tight transition-shadow hover:shadow-card", tone(i))}
                    >
                      <span className="flex items-center gap-1">
                        <TypeIcon type={i.type} className="size-3" />
                        <span className="truncate font-medium">{i.title}</span>
                      </span>
                      {!i.completedAt && !i.cancelledAt && i.current && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          {STAGE_META[i.current.kind].short} · {i.current.assignee?.name ?? "no owner"}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted">
        <Legend cls="border-l-[#9fb4d8] bg-white" label="In progress" />
        <Legend cls="border-l-electric bg-electric-soft" label="With Social" />
        <Legend cls="border-l-ok bg-ok-soft" label="Published" />
        <Legend cls="border-l-bad bg-bad-soft" label="Late" />
        <Legend cls="border-l-back bg-back-soft" label="Sent back" />
      </div>
      {undated.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-[13px] font-semibold">No posting date yet</div>
          <div className="flex flex-wrap gap-2">
            {undated.map((i) => (
              <Link key={i.id} href={`/items/${i.id}`} className={clsx("rounded-md border border-l-[3px] border-line px-2 py-1 text-[12.5px]", tone(i))}>
                {i.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-3 w-4 rounded-sm border border-l-[3px] border-line", cls)} />
      {label}
    </span>
  );
}
