import Link from "next/link";
import clsx from "clsx";
import { ClipboardList, Hourglass, LayoutList } from "lucide-react";
import { TaskRow } from "@/components/tasks";
import { ItemRow } from "@/components/item-row";
import { Empty, SectionTitle } from "@/components/ui";
import type { AttachmentView } from "@/server/attachments";
import type { WorkItem } from "@/server/queries";
import type { TaskView } from "@/server/tasks";

/**
 * "Tasks I gave": every to-do and every piece of brand work this person gave, where it is now, who has it, and the
 * ones waiting for their approval. Managers can switch to everyone's (with who gave each one).
 */
export function GivenTab({
  tasks,
  items,
  everyone,
  manager,
  today,
  meId,
  files,
  giveButton,
}: {
  tasks: TaskView[];
  items: WorkItem[];
  everyone: boolean;
  manager: boolean;
  today: string;
  meId: string;
  files: Record<string, AttachmentView[]>;
  giveButton: React.ReactNode;
}) {
  const waiting = tasks.filter((t) => !t.doneAt && t.submittedAt);
  const open = tasks.filter((t) => !t.doneAt && !t.submittedAt);
  const done = tasks.filter((t) => t.doneAt);
  const byDay = (a: WorkItem, b: WorkItem) => (a.current?.deadline ?? a.postingDate ?? "9").localeCompare(b.current?.deadline ?? b.postingDate ?? "9");
  const row = (t: TaskView) => <TaskRow key={t.id} t={t} today={today} mode="given" canDelete files={files[t.id]} meId={meId} manager={manager} showGiver={everyone} />;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {manager && (
          <div className="inline-flex rounded-xl border border-line bg-surface p-0.5" role="tablist" aria-label="Whose">
            <Link href="/my-work?tab=given" role="tab" aria-selected={!everyone} className={seg(!everyone)}>
              Given by me
            </Link>
            <Link href="/my-work?tab=given&who=all" role="tab" aria-selected={everyone} className={seg(everyone)}>
              Everyone&rsquo;s
            </Link>
          </div>
        )}
        <span className="text-[13px] text-muted">{everyone ? "Every task given in the team, and who gave it." : "What you gave, where it is now, and who has it."}</span>
        <span className="ml-auto">{giveButton}</span>
      </div>

      {waiting.length > 0 && (
        <section id="approve" className="scroll-mt-24">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Hourglass className="size-4 text-[#0f766e]" /> Finished, waiting for approval
              <span className="rounded-full bg-[#e3f5f3] px-2 py-0.5 text-[12px] text-[#0f766e]">{waiting.length}</span>
            </span>
          </SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">{waiting.map(row)}</div>
        </section>
      )}

      {(tasks.length > 0 || items.length > 0) && (
        <>
          <section>
            <SectionTitle right={<span className="text-[13px] text-muted">{open.length} open</span>}>
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="size-4 text-electric" /> To-dos
              </span>
            </SectionTitle>
            {open.length + done.length ? (
              <div className="card divide-y divide-line overflow-hidden">
                {open.map(row)}
                {done.map(row)}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No to-dos {everyone ? "given" : "from you"} right now.</p>
            )}
          </section>

          <section>
            <SectionTitle right={<span className="text-[13px] text-muted">{items.length} in progress</span>}>
              <span className="inline-flex items-center gap-2">
                <LayoutList className="size-4 text-electric" /> Brand work (extra)
              </span>
            </SectionTitle>
            {items.length ? (
              <div className="card divide-y divide-line overflow-hidden">
                {[...items].sort(byDay).map((i) => (
                  <ItemRow key={i.id} item={i} compact />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">Tasks given with a brand show here with the step they&rsquo;re at and who has them.</p>
            )}
          </section>
        </>
      )}

      {!tasks.length && !items.length && (
        <Empty icon={ClipboardList} title={everyone ? "No tasks given yet" : "You haven't given any tasks yet"}>
          Use Give a task. Everything you give shows here with who has it and where it is.
        </Empty>
      )}
    </div>
  );
}

function seg(on: boolean) {
  return clsx("rounded-[9px] px-3 py-1.5 text-[13px] font-medium", on ? "bg-strong text-white" : "text-muted hover:text-ink");
}
