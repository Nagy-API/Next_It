import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ChevronRight, CircleCheck, MessageSquare, Paperclip, Timer, Zap } from "lucide-react";
import { Attachments } from "@/components/attachments";
import { Avatar } from "@/components/avatar";
import { AssigneePicker, DuePicker, FieldContext, FieldEditor, PriorityPicker, QuickAdd, StatusPicker } from "@/components/spaces/controls";
import { ClockButton, CommentBox, DeleteComment, DeleteTask, DescriptionEdit, MarkStatus, MoveList, TitleEdit } from "@/components/spaces/task-parts";
import { can } from "@/domain/permissions";
import { isFinishedKind, type FieldConfig, type FieldOption, type FieldType } from "@/domain/spaces";
import { cairoDate, formatDateTime, formatDuration, formatRelative, formatTime } from "@/lib/dates";
import { attachmentsFor } from "@/server/attachments";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { UserError } from "@/server/errors";
import { getTaskPage } from "@/server/spaces";

export async function generateMetadata({ params }: PageProps<"/spaces/[id]/t/[taskId]">) {
  const me = await requireUser();
  const page = await getTaskPage(me, (await params).taskId).catch(() => null);
  return { title: page?.task?.title ?? "Task" };
}

export default async function TaskPage({ params }: PageProps<"/spaces/[id]/t/[taskId]">) {
  const me = await requireUser();
  const { taskId } = await params;
  const page = await getTaskPage(me, taskId).catch((e) => {
    if (e instanceof UserError) return null;
    throw e;
  });
  if (!page?.task) notFound();
  const { task, space, access } = page;
  const [allPeople, files] = await Promise.all([getActivePeople(), attachmentsFor({ workTaskIds: [task.id] })]);
  const people = allPeople.filter((p) => !space.isPrivate || page.members.some((m) => m.userId === p.id) || task.assigneeIds.includes(p.id)).map((p) => ({ id: p.id, name: p.name }));
  const status = page.statuses.find((s) => s.id === task.statusId);
  const done = !!status && isFinishedKind(status.kind);
  const work = access.work && !page.archived;
  const list = page.lists.find((l) => l.id === task.listId);
  const parent = task.parentId ? page.tasks.find((t) => t.id === task.parentId) : null;
  const statuses = page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }));
  const fields = page.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as FieldType, options: f.options as FieldOption[], config: f.config as FieldConfig | null }));
  const doneStatus = page.statuses.find((s) => s.kind === "done");
  const openStatus = page.statuses.find((s) => s.kind === "open");
  const myClock = page.sessions.find((s) => s.userId === me.id && !s.endedAt);
  const nowMs = new Date().getTime();
  const subDone = page.subtasks.filter((s) => page.statuses.find((x) => x.id === s.statusId && isFinishedKind(x.kind))).length;

  return (
    <div className="mx-auto max-w-[1180px]">
      <nav className="flex flex-wrap items-center gap-1 text-[13px] text-muted" aria-label="Where this task is">
        <Link href={`/spaces/${space.id}`} className="inline-flex items-center gap-1.5 hover:text-electric">
          <span>{space.icon}</span> {space.name}
        </Link>
        {list && (
          <>
            <ChevronRight className="size-3.5" />
            <Link href={`/spaces/${space.id}?list=${list.id}`} className="hover:text-electric">
              {list.name}
            </Link>
          </>
        )}
        {parent && (
          <>
            <ChevronRight className="size-3.5" />
            <Link href={`/spaces/${space.id}/t/${parent.id}`} className="max-w-[260px] truncate hover:text-electric">
              {parent.title}
            </Link>
          </>
        )}
      </nav>

      {page.archived && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bad-soft px-4 py-2.5 text-[13.5px] text-bad">
          This task was deleted. Its history is kept.
          {access.work && <DeleteTask taskId={task.id} archived />}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <TitleEdit taskId={task.id} title={task.title} done={done} disabled={!work} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {work && <ClockButton taskId={task.id} running={!!myClock} ms={task.time.ms} />}
          {work && doneStatus && !done && <MarkStatus taskId={task.id} statusId={doneStatus.id} label={`Mark ${doneStatus.name}`} primary />}
          {work && done && openStatus && <MarkStatus taskId={task.id} statusId={openStatus.id} label="Reopen" />}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Properties */}
          <section className="card divide-y divide-line">
            <Prop label="Status">
              <StatusPicker taskId={task.id} statuses={statuses} current={task.statusId} disabled={!work} />
            </Prop>
            <Prop label="People">
              <div className="flex items-center gap-2">
                <AssigneePicker taskId={task.id} people={people} value={task.assigneeIds} disabled={!work} meId={me.id} />
                <span className="truncate text-[13px] text-ink-2">{task.assigneeIds.map((id) => people.find((p) => p.id === id)?.name ?? allPeople.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || <span className="text-faint">Nobody yet</span>}</span>
              </div>
            </Prop>
            <Prop label="Due">
              <DuePicker taskId={task.id} value={task.dueDate} done={done} disabled={!work} />
            </Prop>
            <Prop label="Start">
              <DuePicker taskId={task.id} value={task.startDate} disabled={!work} name="startDate" label="Start date" />
            </Prop>
            <Prop label="Priority">
              <PriorityPicker taskId={task.id} value={task.priority} disabled={!work} showLabel />
            </Prop>
            {!task.parentId && page.lists.length > 1 && work && (
              <Prop label="List">
                <MoveList taskId={task.id} listId={task.listId} lists={page.lists.map((l) => ({ id: l.id, name: l.name }))} />
              </Prop>
            )}
            <FieldContext meId={me.id} tasks={page.tasks.map((t) => ({ id: t.id, title: t.title }))}>
              {fields.map((f) => (
                <Prop key={f.id} label={f.name}>
                  <FieldEditor taskId={task.id} field={f} value={task.values[f.id]} people={people} disabled={!work} />
                </Prop>
              ))}
            </FieldContext>
          </section>

          {/* Description */}
          <section className="card p-5">
            <h2 className="mb-2 font-display text-[15px] font-bold">Description</h2>
            <DescriptionEdit taskId={task.id} value={task.description} disabled={!work} />
          </section>

          {/* Subtasks */}
          {!task.parentId && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-3 px-5 pb-2 pt-4">
                <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
                  <CircleCheck className="size-4 text-ok" /> Subtasks
                </h2>
                {page.subtasks.length > 0 && (
                  <>
                    <div className="h-1.5 max-w-[200px] flex-1 overflow-hidden rounded-full bg-track">
                      <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${(subDone / page.subtasks.length) * 100}%` }} />
                    </div>
                    <span className="text-[12.5px] tabular-nums text-muted">
                      {subDone}/{page.subtasks.length}
                    </span>
                  </>
                )}
              </div>
              <ul className="divide-y divide-line/70">
                {page.subtasks.map((s) => {
                  const st = page.statuses.find((x) => x.id === s.statusId);
                  const sDone = !!st && isFinishedKind(st.kind);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-5 py-2">
                      <StatusPicker taskId={s.id} statuses={statuses} current={s.statusId} disabled={!work} size="sm" />
                      <Link href={`/spaces/${space.id}/t/${s.id}`} className={clsx("min-w-0 flex-1 truncate text-[14px] font-medium hover:text-electric", sDone && "text-muted line-through")}>
                        {s.title}
                      </Link>
                      <AssigneePicker taskId={s.id} people={people} value={s.assigneeIds} disabled={!work} meId={me.id} />
                      <DuePicker taskId={s.id} value={s.dueDate} done={sDone} disabled={!work} />
                    </li>
                  );
                })}
              </ul>
              {work && (
                <div className="border-t border-line/70">
                  <QuickAdd listId={task.listId} parentId={task.id} placeholder="Add a subtask… (paste a checklist to add many)" />
                </div>
              )}
            </section>
          )}

          {/* Files */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold">
              <Paperclip className="size-4 text-electric" /> Files & links
            </h2>
            <Attachments items={files.get(task.id) ?? []} workTaskId={task.id} meId={me.id} manager={can.manageWorkflow(me)} canAdd={work} />
          </section>
        </div>

        {/* Comments & history */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold">
              <MessageSquare className="size-4 text-electric" /> Comments & history
            </h2>
            {access.work && !page.archived && <CommentBox taskId={task.id} />}
            <ol className="mt-4 space-y-3">
              {[...page.comments].reverse().map((c) =>
                c.system ? (
                  <li key={c.id} className="flex gap-2 text-[12.5px] text-muted">
                    {c.body.startsWith("⚡") ? <Zap className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" />}
                    <span>
                      {c.body} <span className="whitespace-nowrap text-faint">· {formatRelative(c.createdAt)}</span>
                    </span>
                  </li>
                ) : (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.authorName} size={28} />
                    <div className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2">
                      <div className="flex items-center gap-2 text-[12.5px]">
                        <span className="font-semibold text-ink">{c.authorName}</span>
                        <span className="text-faint" title={formatDateTime(c.createdAt)}>
                          {formatRelative(c.createdAt)}
                        </span>
                        {(c.authorId === me.id || can.manageWorkflow(me)) && (
                          <span className="ml-auto">
                            <DeleteComment id={c.id} />
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-ink-2">{c.body}</p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>

          {page.sessions.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold">
                <Timer className="size-4 text-electric" /> Time · {formatDuration(task.time.ms)}
              </h2>
              <ul className="space-y-1 text-[12.5px] text-muted">
                {page.sessions.map((s) => (
                  <li key={s.id} className="tabular-nums">
                    <span className="font-medium text-ink-2">{s.name}</span> · {cairoDate(s.startedAt)} {formatTime(s.startedAt)} → {s.endedAt ? formatTime(s.endedAt) : "now"} · {formatDuration((s.endedAt?.getTime() ?? nowMs) - s.startedAt.getTime())}
                    {s.endReason === "auto_paused" && <span className="ml-1 rounded bg-canvas px-1 text-[11px]">paused automatically</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {access.work && !page.archived && (
            <div className="flex justify-end">
              <DeleteTask taskId={task.id} archived={false} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="truncate text-[13px] font-medium text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
