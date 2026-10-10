import Link from "next/link";
import { LayoutGrid, MessageSquare, Paperclip, Timer } from "lucide-react";
import { SectionTitle } from "@/components/ui";
import { formatDuration } from "@/lib/dates";
import type { MySpaceTask } from "@/server/spaces";
import { DuePicker, PriorityPicker, StatusPicker } from "./controls";

/** My tasks: open Space tasks on me, grouped by space, with status / due / priority changeable in place. */
export function MySpaceTasks({ tasks }: { tasks: MySpaceTask[] }) {
  if (!tasks.length) return null;
  const spaces = [...new Map(tasks.map((t) => [t.space.id, t.space])).values()];
  return (
    <section id="spaces" className="scroll-mt-24">
      <SectionTitle right={<span className="text-[13px] text-muted">{tasks.length} open</span>}>
        <span className="inline-flex items-center gap-2">
          <LayoutGrid className="size-4 text-electric" /> From Spaces
        </span>
      </SectionTitle>
      <div className="space-y-4">
        {spaces.map((s) => (
          <div key={s.id} className="card overflow-hidden" style={{ borderLeft: `4px solid ${s.color}` }}>
            <Link href={`/spaces/${s.id}`} className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2 text-[13px] font-semibold text-ink-2 hover:text-electric">
              <span>{s.icon}</span> {s.name}
            </Link>
            <ul className="divide-y divide-line/70">
              {tasks
                .filter((t) => t.space.id === s.id)
                .map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                    <StatusPicker taskId={t.id} statuses={t.statuses.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind }))} current={t.statusId} size="sm" />
                    <Link href={`/spaces/${s.id}/t/${t.id}`} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:text-electric">
                      {t.title}
                      {t.list && <span className="ml-2 text-[12px] font-normal text-faint">{t.list.name}</span>}
                    </Link>
                    <span className="flex items-center gap-2 text-[11.5px] text-faint">
                      {t.subtasks.total > 0 && (
                        <span>
                          {t.subtasks.done}/{t.subtasks.total}
                        </span>
                      )}
                      {t.comments > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="size-3" /> {t.comments}
                        </span>
                      )}
                      {t.files > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Paperclip className="size-3" /> {t.files}
                        </span>
                      )}
                      {(t.time.ms > 0 || t.time.running) && (
                        <span className={t.time.running ? "inline-flex items-center gap-0.5 font-semibold text-electric" : "inline-flex items-center gap-0.5"}>
                          <Timer className="size-3" /> {formatDuration(t.time.ms)}
                        </span>
                      )}
                    </span>
                    <DuePicker taskId={t.id} value={t.dueDate} />
                    <PriorityPicker taskId={t.id} value={t.priority} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
