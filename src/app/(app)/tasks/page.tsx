import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { GiveTaskButton, TaskRow } from "@/components/tasks";
import { Avatar, Empty, PageHeader } from "@/components/ui";
import { isManager } from "@/domain/permissions";
import { addDays, formatDay, isValidISODate, todayISO, weekRange } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { getDayTasks } from "@/server/tasks";
import { attachmentsFor } from "@/server/attachments";

export const metadata = { title: "Day tasks" };

const DOW = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

/** To-dos that aren't for a brand, day by day, with their files. Brand work lives in the brand. */
export default async function DayTasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const day = typeof sp.d === "string" && isValidISODate(sp.d) ? sp.d : today;
  const manager = isManager(me);
  const who = manager && typeof sp.who === "string" ? sp.who : manager ? "" : me.id;
  const week = weekRange(day);
  const [list, people, brands] = await Promise.all([getDayTasks(week.start, week.end, who || null), getActivePeople(), getAllBrands()]);
  const files = await attachmentsFor({ taskIds: list.map((t) => t.id) });
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const onDay = list.filter((t) => t.day === day || (day === today && t.day < today && !t.doneAt));
  const byPerson = new Map<string, typeof onDay>();
  for (const t of onDay) byPerson.set(t.assigneeName, [...(byPerson.get(t.assigneeName) ?? []), t]);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(day !== today ? { d: day } : {}), ...(manager && who ? { who } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/tasks${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[920px]">
      <PageHeader
        title="Day tasks"
        subtitle="To-dos that aren't for a brand, day by day. Brand work lives in the brand."
        actions={manager ? <GiveTaskButton people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))} brands={brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))} variant="button" /> : null}
      />

      <div className="card mb-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <Link href={href({ d: addDays(week.start, -7) })} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <CalendarDays className="size-4 text-electric" /> {formatDay(week.start, { weekday: false })} to {formatDay(week.end, { weekday: false })}
            {day !== today && (
              <Link href={href({ d: "" })} className="rounded-full bg-electric-soft px-2 py-0.5 text-[12px] font-semibold text-electric">
                Today
              </Link>
            )}
          </div>
          <Link href={href({ d: addDays(week.start, 7) })} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Next week">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const n = list.filter((t) => t.day === d).length;
            const open = list.filter((t) => t.day === d && !t.doneAt).length;
            const on = d === day;
            return (
              <Link key={d} href={href({ d: d === today ? "" : d })} className={clsx("flex flex-col items-center gap-0.5 py-2.5 transition-colors", on ? "bg-navy-900 text-white" : "hover:bg-canvas")}>
                <span className={clsx("text-[11px] font-semibold uppercase tracking-wide", on ? "text-white/70" : d === today ? "text-electric" : "text-muted")}>{DOW[i]}</span>
                <span className="font-display text-[17px] font-bold leading-none">{Number(d.slice(8))}</span>
                <span className={clsx("mt-0.5 h-4 text-[11px] font-semibold", on ? "text-white/80" : open ? "text-electric" : "text-faint")}>{n ? (open ? `${open} open` : "✓") : ""}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {manager && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Link href={href({ who: "" })} className={clsx("shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium", !who ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink-2")}>
            Everyone
          </Link>
          {people.map((p) => (
            <Link key={p.id} href={href({ who: p.id })} className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium", who === p.id ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink-2")}>
              <Avatar name={p.name} size={20} badge={false} /> {p.name}
            </Link>
          ))}
        </div>
      )}

      {onDay.length === 0 ? (
        <Empty icon={ClipboardList} title={`Nothing for ${day === today ? "today" : formatDay(day)}`}>
          Tasks given without a brand show here on their day, with their files and links.
        </Empty>
      ) : (
        <div className="space-y-5">
          {[...byPerson.entries()].map(([name, ts]) => (
            <section key={name}>
              {(manager && !who) || byPerson.size > 1 ? (
                <h2 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold">
                  <Avatar name={name} size={24} /> {name}
                  <span className="text-[12.5px] font-normal text-muted">
                    {ts.filter((t) => t.doneAt).length}/{ts.length} done
                  </span>
                </h2>
              ) : null}
              <div className="card divide-y divide-line">
                {ts.map((t) => (
                  <TaskRow key={t.id} t={t} today={today} mode={t.assigneeId === me.id ? "mine" : "given"} canDelete={manager} files={files.get(t.id)} meId={me.id} manager={manager} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
