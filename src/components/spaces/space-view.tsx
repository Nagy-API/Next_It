"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Columns3,
  FolderClosed,
  FolderPlus,
  LayoutList,
  ListPlus,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Timer,
  UserRound,
  X,
} from "lucide-react";
import { createWorkTaskAction, moveWorkTaskAction, saveFolderAction, saveListAction, updateWorkTaskAction } from "@/app/space-actions";
import { ActionForm, Modal, Popover, Submit, useToast } from "@/components/client";
import { Avatar } from "@/components/avatar";
import { DateInput } from "@/components/date-input";
import { PRIORITIES, PRIORITY_LIST, isFinishedKind, type Priority } from "@/domain/spaces";
import { addDays, dayOfWeek, formatDuration, monthLabel, monthRange, todayISO } from "@/lib/dates";
import type { TaskView } from "@/server/spaces";
import { AssigneePicker, Chevron, DuePicker, FieldEditor, PriorityPicker, QuickAdd, StatusPicker, type SField, type SPerson, type SStatus } from "./controls";

export type SpaceViewProps = {
  space: { id: string; name: string; color: string; icon: string | null };
  access: { work: boolean; manage: boolean };
  statuses: SStatus[];
  folders: { id: string; name: string }[];
  lists: { id: string; name: string; folderId: string | null; color: string | null }[];
  fields: SField[];
  people: SPerson[];
  tasks: TaskView[];
  meId: string;
  view: "list" | "board" | "calendar";
  listId: string | null;
};

type GroupBy = "status" | "assignee" | "priority" | "due" | "list";
type Filters = { q: string; mine: boolean; person: string; priority: string; showDone: boolean; groupBy: GroupBy };
const DEFAULT_FILTERS: Filters = { q: "", mine: false, person: "", priority: "", showDone: false, groupBy: "status" };

export function SpaceView(p: SpaceViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [adding, setAdding] = useState(false);
  const key = `space-filters:${p.space.id}`;
  // Each person's filters are remembered on their device, per space.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(saved) });
    } catch {}
  }, [key]);
  const setF = (patch: Partial<Filters>) =>
    setFilters((f) => {
      const next = { ...f, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  const go = (patch: { view?: string; list?: string | null }) => {
    const sp = new URLSearchParams();
    const view = patch.view ?? p.view;
    const list = patch.list === undefined ? p.listId : patch.list;
    if (view !== "list") sp.set("view", view);
    if (list) sp.set("list", list);
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const finished = useMemo(() => new Set(p.statuses.filter((s) => isFinishedKind(s.kind)).map((s) => s.id)), [p.statuses]);
  const top = p.tasks.filter((t) => !t.parentId && (!p.listId || t.listId === p.listId));
  const visible = top.filter((t) => {
    if (!filters.showDone && finished.has(t.statusId) && p.view !== "board") return false;
    if (filters.mine && !t.assigneeIds.includes(p.meId)) return false;
    if (filters.person && !t.assigneeIds.includes(filters.person)) return false;
    if (filters.priority && (t.priority ?? "none") !== filters.priority) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const sub = p.tasks.filter((s) => s.parentId === t.id).some((s) => s.title.toLowerCase().includes(q));
      if (!t.title.toLowerCase().includes(q) && !sub) return false;
    }
    return true;
  });
  const doneCount = top.filter((t) => finished.has(t.statusId)).length;
  const currentList = p.lists.find((l) => l.id === p.listId) ?? null;
  const defaultList = currentList?.id ?? p.lists[0]?.id;

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <ListTree {...p} counts={(id) => top.filter((t) => (id ? t.listId === id : true) && !finished.has(t.statusId)).length} onPick={(id) => go({ list: id })} />

      <section className="min-w-0 space-y-3">
        {/* View switch + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-white p-0.5" role="tablist" aria-label="View">
            {(
              [
                ["list", LayoutList, "List"],
                ["board", Columns3, "Board"],
                ["calendar", CalendarDays, "Calendar"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={p.view === v}
                onClick={() => go({ view: v })}
                className={clsx("inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors", p.view === v ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[160px] flex-1 sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input value={filters.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search tasks…" aria-label="Search tasks" className="field field-sm h-9 w-full pl-8" />
          </div>
          <button
            type="button"
            onClick={() => setF({ mine: !filters.mine })}
            aria-pressed={filters.mine}
            className={clsx("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors", filters.mine ? "border-electric bg-electric-soft text-electric" : "border-line bg-white text-ink-2 hover:border-line-strong")}
          >
            <UserRound className="size-4" /> Me
          </button>
          <select value={filters.person} onChange={(e) => setF({ person: e.target.value })} aria-label="Assignee" className="field field-sm h-9 w-auto">
            <option value="">Anyone</option>
            {p.people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select value={filters.priority} onChange={(e) => setF({ priority: e.target.value })} aria-label="Priority" className="field field-sm h-9 w-auto">
            <option value="">Any priority</option>
            {PRIORITY_LIST.map((x) => (
              <option key={x} value={x}>
                {PRIORITIES[x].label}
              </option>
            ))}
            <option value="none">No priority</option>
          </select>
          {p.view === "list" && (
            <select value={filters.groupBy} onChange={(e) => setF({ groupBy: e.target.value as GroupBy })} aria-label="Group by" className="field field-sm h-9 w-auto">
              <option value="status">Group: status</option>
              <option value="assignee">Group: person</option>
              <option value="priority">Group: priority</option>
              <option value="due">Group: due date</option>
              <option value="list">Group: list</option>
            </select>
          )}
          {p.view !== "board" && (
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={filters.showDone} onChange={(e) => setF({ showDone: e.target.checked })} className="size-4 accent-[var(--color-electric)]" /> Show done ({doneCount})
            </label>
          )}
          {(filters.q || filters.mine || filters.person || filters.priority) && (
            <button type="button" onClick={() => setF({ q: "", mine: false, person: "", priority: "" })} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink">
              <X className="size-3.5" /> Clear
            </button>
          )}
          {p.access.work && defaultList && (
            <button type="button" onClick={() => setAdding(true)} className="ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-electric px-3.5 text-[14px] font-medium text-white shadow-sm transition-transform hover:bg-[#2f74e6] active:scale-[0.97]">
              <Plus className="size-4" strokeWidth={2.5} /> New task
            </button>
          )}
        </div>

        {!top.length ? (
          <FirstSteps {...p} listId={defaultList ?? ""} />
        ) : p.view === "board" ? (
          <Board {...p} tasks={visible} all={p.tasks} defaultList={defaultList ?? ""} showClosed={filters.showDone} />
        ) : p.view === "calendar" ? (
          <Calendar {...p} tasks={visible} />
        ) : (
          <ListView {...p} tasks={visible} all={p.tasks} groupBy={filters.groupBy} defaultList={defaultList ?? ""} finished={finished} />
        )}
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title="New task" width={520}>
        <NewTaskForm {...p} listId={defaultList ?? ""} onDone={() => setAdding(false)} />
      </Modal>
    </div>
  );
}

/* ------------------------------ Lists tree ------------------------------ */

function ListTree(p: SpaceViewProps & { counts: (id: string | null) => number; onPick: (id: string | null) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const loose = p.lists.filter((l) => !l.folderId);
  const item = (id: string | null, name: string, color?: string | null, indent = false) => (
    <button
      key={id ?? "all"}
      type="button"
      onClick={() => p.onPick(id)}
      className={clsx(
        "flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors lg:w-full",
        indent && "lg:pl-7",
        p.listId === id ? "bg-electric-soft font-semibold text-electric" : "text-ink-2 hover:bg-white",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color ?? (id ? "#cbd5e1" : p.space.color) }} />
      <span className="flex-1 truncate">{name}</span>
      <span className="text-[11.5px] tabular-nums text-faint">{p.counts(id) || ""}</span>
    </button>
  );
  return (
    <aside className="min-w-0">
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] lg:block lg:space-y-0.5 lg:overflow-visible">
        {item(null, "All tasks")}
        {p.folders.map((f) => {
          const open = !closed.has(f.id);
          return (
            <div key={f.id} className="contents lg:block">
              <button
                type="button"
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(f.id)) n.delete(f.id);
                    else n.add(f.id);
                    return n;
                  })
                }
                className="hidden w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-ink lg:flex"
              >
                <Chevron open={open} />
                <FolderClosed className="size-3.5" />
                <span className="truncate">{f.name}</span>
              </button>
              {p.lists.filter((l) => l.folderId === f.id).map((l) => <div key={l.id} className={clsx("shrink-0", !open && "lg:hidden")}>{item(l.id, l.name, l.color, true)}</div>)}
            </div>
          );
        })}
        {loose.map((l) => item(l.id, l.name, l.color))}
      </div>
      {p.access.manage && (
        <div className="mt-2 hidden gap-1 lg:flex">
          <Popover label="New list" width={260} triggerClassName="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-electric hover:bg-white" trigger={<><ListPlus className="size-3.5" /> List</>}>
            {(close) => (
              <ActionForm action={saveListAction} onSuccess={close} className="space-y-2 p-3">
                <input type="hidden" name="spaceId" value={p.space.id} />
                <label className="label">New list</label>
                <input name="name" required placeholder="e.g. October, Clients, Sprint 3" className="field w-full" autoFocus />
                {p.folders.length > 0 && (
                  <select name="folderId" className="field w-full" aria-label="Folder">
                    <option value="">No folder</option>
                    {p.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        In {f.name}
                      </option>
                    ))}
                  </select>
                )}
                <Submit size="sm" className="w-full">
                  Add list
                </Submit>
              </ActionForm>
            )}
          </Popover>
          <Popover label="New folder" width={240} triggerClassName="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-electric hover:bg-white" trigger={<><FolderPlus className="size-3.5" /> Folder</>}>
            {(close) => (
              <ActionForm action={saveFolderAction} onSuccess={close} className="space-y-2 p-3">
                <input type="hidden" name="spaceId" value={p.space.id} />
                <label className="label">New folder</label>
                <input name="name" required placeholder="e.g. Campaigns 2026" className="field w-full" autoFocus />
                <Submit size="sm" className="w-full">
                  Add folder
                </Submit>
              </ActionForm>
            )}
          </Popover>
        </div>
      )}
    </aside>
  );
}

/* --------------------------------- List --------------------------------- */

function groupsFor(p: SpaceViewProps, tasks: TaskView[], groupBy: GroupBy) {
  const today = todayISO();
  if (groupBy === "assignee")
    return [
      ...p.people.map((x) => ({ key: x.id, label: x.name, color: "#94a3b8", tasks: tasks.filter((t) => t.assigneeIds.includes(x.id)), statusId: undefined as string | undefined, assignee: x.id })),
      { key: "none", label: "Nobody yet", color: "#cbd5e1", tasks: tasks.filter((t) => !t.assigneeIds.length), statusId: undefined, assignee: undefined },
    ].filter((g) => g.tasks.length);
  if (groupBy === "priority")
    return [...PRIORITY_LIST, null].map((x) => ({ key: x ?? "none", label: x ? PRIORITIES[x].label : "No priority", color: x ? PRIORITIES[x].color : "#cbd5e1", tasks: tasks.filter((t) => t.priority === x), statusId: undefined, assignee: undefined })).filter((g) => g.tasks.length);
  if (groupBy === "list")
    return p.lists.map((l) => ({ key: l.id, label: l.name, color: l.color ?? "#94a3b8", tasks: tasks.filter((t) => t.listId === l.id), statusId: undefined, assignee: undefined })).filter((g) => g.tasks.length);
  if (groupBy === "due") {
    const buckets: [string, string, (d: string | null) => boolean][] = [
      ["Overdue", "#e5484d", (d) => !!d && d < today],
      ["Today", "#f59e0b", (d) => d === today],
      ["This week", "#3b82f6", (d) => !!d && d > today && d <= addDays(today, 7)],
      ["Later", "#8b5cf6", (d) => !!d && d > addDays(today, 7)],
      ["No due date", "#cbd5e1", (d) => !d],
    ];
    return buckets.map(([label, color, f]) => ({ key: label, label, color, tasks: tasks.filter((t) => f(t.dueDate)), statusId: undefined, assignee: undefined })).filter((g) => g.tasks.length);
  }
  return p.statuses.map((s) => ({ key: s.id, label: s.name, color: s.color, tasks: tasks.filter((t) => t.statusId === s.id), statusId: s.id as string | undefined, assignee: undefined as string | undefined })).filter((g) => g.tasks.length || !isFinishedKind(p.statuses.find((x) => x.id === g.key)?.kind ?? ""));
}

function ListView(p: SpaceViewProps & { all: TaskView[]; groupBy: GroupBy; defaultList: string; finished: Set<string> }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = groupsFor(p, p.tasks, p.groupBy);
  const cols = `minmax(260px,1fr) 96px 92px 78px${p.fields.map(() => " 150px").join("")} 70px`;
  const minW = 260 + 96 + 92 + 78 + p.fields.length * 150 + 70 + 40;
  if (!p.tasks.length) return <div className="card px-5 py-10 text-center text-[14px] text-muted">Nothing matches these filters.</div>;
  return (
    <div className="card overflow-x-auto">
      <div style={{ minWidth: minW }}>
        <div className="sticky top-0 grid items-center gap-2 border-b border-line bg-[#fafbfd] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint" style={{ gridTemplateColumns: cols }}>
          <span>Task</span>
          <span>People</span>
          <span>Due</span>
          <span>Priority</span>
          {p.fields.map((f) => (
            <span key={f.id} className="truncate">
              {f.name}
            </span>
          ))}
          <span>Time</span>
        </div>
        {groups.map((g) => {
          const isClosed = closed.has(g.key);
          return (
            <div key={g.key} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(g.key)) n.delete(g.key);
                    else n.add(g.key);
                    return n;
                  })
                }
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-[#fafbfd]"
              >
                <Chevron open={!isClosed} />
                <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-white" style={{ background: g.color }}>
                  {g.label}
                </span>
                <span className="text-[12.5px] tabular-nums text-muted">{g.tasks.length}</span>
              </button>
              {!isClosed && (
                <>
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      {...p}
                      t={t}
                      cols={cols}
                      subtasks={p.all.filter((s) => s.parentId === t.id)}
                      expanded={open.has(t.id)}
                      toggle={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(t.id)) n.delete(t.id);
                          else n.add(t.id);
                          return n;
                        })
                      }
                    />
                  ))}
                  {p.access.work && <QuickAdd listId={p.listId ?? p.defaultList} statusId={g.statusId} assigneeId={g.assignee} placeholder={`Add a task${p.groupBy === "status" ? ` in ${g.label}` : ""}… (paste a list to add many)`} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow(p: SpaceViewProps & { t: TaskView; cols: string; subtasks: TaskView[]; expanded: boolean; toggle: () => void; finished: Set<string>; sub?: boolean }) {
  const { t } = p;
  const done = p.finished.has(t.statusId);
  return (
    <>
      <div className={clsx("group grid items-center gap-2 border-t border-line/70 px-3 py-1.5 text-[14px] transition-colors hover:bg-[#f8faff]", p.sub && "bg-[#fcfdff]")} style={{ gridTemplateColumns: p.cols }}>
        <div className={clsx("flex min-w-0 items-center gap-2", p.sub && "pl-7")}>
          {p.subtasks.length > 0 ? (
            <button type="button" onClick={p.toggle} className="cursor-pointer rounded p-0.5 hover:bg-canvas" aria-label={p.expanded ? "Hide subtasks" : "Show subtasks"} aria-expanded={p.expanded}>
              <Chevron open={p.expanded} />
            </button>
          ) : (
            <span className="w-5" />
          )}
          <QuickDone task={t} statuses={p.statuses} disabled={!p.access.work} />
          <StatusPicker taskId={t.id} statuses={p.statuses} current={t.statusId} disabled={!p.access.work} size="sm" />
          <Link href={`/spaces/${t.spaceId}/t/${t.id}`} className={clsx("min-w-0 truncate font-medium hover:text-electric", done ? "text-muted line-through" : "text-ink")}>
            {t.title}
          </Link>
          <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-faint">
            {t.subtasks.total > 0 && (
              <span className={clsx("inline-flex items-center gap-0.5 rounded px-1 font-semibold", t.subtasks.done === t.subtasks.total ? "bg-ok-soft text-ok" : "bg-canvas text-ink-2")}>
                <CircleCheck className="size-3" /> {t.subtasks.done}/{t.subtasks.total}
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
          </span>
        </div>
        <AssigneePicker taskId={t.id} people={p.people} value={t.assigneeIds} disabled={!p.access.work} meId={p.meId} />
        <DuePicker taskId={t.id} value={t.dueDate} done={done} disabled={!p.access.work} />
        <PriorityPicker taskId={t.id} value={t.priority} disabled={!p.access.work} />
        {p.fields.map((f) => (
          <div key={f.id} className="min-w-0">
            <FieldEditor taskId={t.id} field={f} value={t.values[f.id]} people={p.people} disabled={!p.access.work} />
          </div>
        ))}
        <span className={clsx("inline-flex items-center gap-1 text-[12px] tabular-nums", t.time.running ? "font-semibold text-electric" : "text-muted")}>
          {t.time.ms > 0 || t.time.running ? (
            <>
              <Timer className={clsx("size-3.5", t.time.running && "animate-pulse")} /> {formatDuration(t.time.ms)}
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      {p.expanded && (
        <>
          {p.subtasks.map((s) => (
            <TaskRow key={s.id} {...p} t={s} subtasks={[]} expanded={false} toggle={() => {}} sub />
          ))}
          {p.access.work && (
            <div className="pl-12">
              <QuickAdd listId={t.listId} parentId={t.id} placeholder="Add a subtask…" compact />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** One click: mark done (first "done" status), or reopen. */
function QuickDone({ task, statuses, disabled }: { task: TaskView; statuses: SStatus[]; disabled?: boolean }) {
  const done = statuses.find((s) => s.id === task.statusId);
  const isDone = !!done && isFinishedKind(done.kind);
  const target = isDone ? statuses.find((s) => s.kind === "open") : statuses.find((s) => s.kind === "done");
  if (disabled || !target) return null;
  return (
    <ActionForm action={updateWorkTaskAction} inlineError={false}>
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="statusId" value={target.id} />
      <button
        type="submit"
        title={isDone ? "Reopen" : `Mark ${target.name}`}
        aria-label={isDone ? `Reopen ${task.title}` : `Mark ${task.title} ${target.name}`}
        className={clsx("grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors", isDone ? "border-ok bg-ok text-white" : "border-line-strong text-transparent hover:border-ok hover:text-ok")}
      >
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </ActionForm>
  );
}

/* --------------------------------- Board --------------------------------- */

function Board(p: SpaceViewProps & { all: TaskView[]; defaultList: string; showClosed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [moved, setMoved] = useState<Record<string, { statusId: string; before: string | null }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Fresh data from the server replaces the local moves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMoved({}), [p.tasks]);
  const columns = p.statuses.filter((s) => s.kind !== "closed" || p.showClosed);
  const statusOf = (t: TaskView) => moved[t.id]?.statusId ?? t.statusId;
  const drop = (statusId: string, before: string | null) => {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id || id === before) return;
    setMoved((m) => ({ ...m, [id]: { statusId, before } }));
    start(async () => {
      const r = await moveWorkTaskAction(id, statusId, before);
      if (r && !r.ok) {
        toast({ kind: "error", text: r.error });
        setMoved((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
      } else {
        const st = p.statuses.find((s) => s.id === statusId);
        if (st?.kind === "done") import("@/components/celebrate").then((c) => c.celebrate("small"));
      }
      router.refresh();
    });
  };
  const finishedIds = new Set(p.statuses.filter((s) => isFinishedKind(s.kind)).map((s) => s.id));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-3" style={{ minWidth: columns.length * 284 }}>
        {columns.map((s) => {
          const items = p.tasks.filter((t) => statusOf(t) === s.id);
          return (
            <div
              key={s.id}
              onDragOver={(e) => {
                if (!p.access.work) return;
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(s.id, null);
              }}
              className={clsx("flex w-[272px] shrink-0 flex-col rounded-2xl p-2 transition-colors", over === s.id ? "bg-electric-soft ring-2 ring-electric/30" : "bg-[#eef1f6]")}
            >
              <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-ink-2">{s.name}</span>
                <span className="text-[12px] tabular-nums text-muted">{items.length}</span>
              </div>
              <div className="flex min-h-[60px] flex-1 flex-col gap-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable={p.access.work}
                    onDragStart={(e) => {
                      setDragging(t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => {
                      if (!p.access.work) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setOver(s.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      drop(s.id, t.id);
                    }}
                    className={clsx("rounded-xl border border-line bg-white p-3 shadow-[0_1px_2px_rgb(11_22_57/0.06)] transition-[transform,box-shadow,opacity] hover:-translate-y-0.5 hover:shadow-md", p.access.work && "cursor-grab active:cursor-grabbing", dragging === t.id && "opacity-40")}
                  >
                    <BoardCard {...p} t={t} done={finishedIds.has(statusOf(t))} />
                  </div>
                ))}
              </div>
              {p.access.work && s.kind !== "closed" && <QuickAdd listId={p.listId ?? p.defaultList} statusId={s.id} placeholder="Add a task…" compact />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard(p: SpaceViewProps & { t: TaskView; done: boolean }) {
  const { t } = p;
  const list = p.lists.find((l) => l.id === t.listId);
  return (
    <div className="space-y-2">
      {!p.listId && list && <div className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-faint">{list.name}</div>}
      <Link href={`/spaces/${t.spaceId}/t/${t.id}`} draggable={false} className={clsx("line-clamp-3 block text-[14px] font-semibold leading-snug hover:text-electric", p.done ? "text-muted line-through" : "text-ink")}>
        {t.title}
      </Link>
      {t.subtasks.total > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8ecf3]">
            <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${(t.subtasks.done / t.subtasks.total) * 100}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted">
            {t.subtasks.done}/{t.subtasks.total}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <AssigneePicker taskId={t.id} people={p.people} value={t.assigneeIds} disabled={!p.access.work} meId={p.meId} />
        <DuePicker taskId={t.id} value={t.dueDate} done={p.done} disabled={!p.access.work} />
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-faint">
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
          {t.time.running && <Timer className="size-3.5 animate-pulse text-electric" />}
          <PriorityPicker taskId={t.id} value={t.priority} disabled={!p.access.work} />
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- Calendar ------------------------------- */

const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function Calendar(p: SpaceViewProps) {
  const today = todayISO();
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const { start, end } = monthRange(ym.y, ym.m);
  const lead = (dayOfWeek(start) + 1) % 7;
  const gridStart = addDays(start, -lead);
  const total = Math.ceil((lead + Number(end.slice(8))) / 7) * 7;
  const days = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  const color = (t: TaskView) => p.statuses.find((s) => s.id === t.statusId)?.color ?? "#94a3b8";
  const undated = p.tasks.filter((t) => !t.dueDate);
  const shift = (d: number) => setYm(({ y, m }) => (m + d > 12 ? { y: y + 1, m: 1 } : m + d < 1 ? { y: y - 1, m: 12 } : { y, m: m + d }));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-1)} className="cursor-pointer rounded-lg border border-line bg-white p-1.5 hover:border-line-strong" aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-[150px] text-center font-display text-[16px] font-bold">{monthLabel(ym.y, ym.m)}</span>
        <button type="button" onClick={() => shift(1)} className="cursor-pointer rounded-lg border border-line bg-white p-1.5 hover:border-line-strong" aria-label="Next month">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="card overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-b border-line bg-[#fafbfd] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = d >= start && d <= end;
            const items = p.tasks.filter((t) => t.dueDate === d);
            return (
              <div key={d} className={clsx("min-h-[96px] border-b border-r border-line p-1.5", !inMonth && "bg-[#fafbfd]")}>
                <div className={clsx("mb-1 text-[12px] font-semibold tabular-nums", d === today ? "inline-grid size-6 place-items-center rounded-full bg-electric text-white" : inMonth ? "text-ink-2" : "text-faint")}>{Number(d.slice(8))}</div>
                <div className="space-y-1">
                  {items.slice(0, 4).map((t) => (
                    <Link key={t.id} href={`/spaces/${t.spaceId}/t/${t.id}`} className="block truncate rounded-md border-l-[3px] bg-white px-1.5 py-0.5 text-[12px] font-medium shadow-[0_1px_1px_rgb(11_22_57/0.06)] hover:text-electric" style={{ borderLeftColor: color(t) }}>
                      {t.title}
                    </Link>
                  ))}
                  {items.length > 4 && <div className="px-1 text-[11px] text-muted">+{items.length - 4} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {undated.length > 0 && (
        <p className="text-[12.5px] text-muted">
          {undated.length} task{undated.length === 1 ? "" : "s"} without a due date (see them in List).
        </p>
      )}
    </div>
  );
}

/* ------------------------------ New task form ---------------------------- */

function NewTaskForm(p: SpaceViewProps & { listId: string; onDone: () => void }) {
  const [due, setDue] = useState("");
  return (
    <ActionForm action={createWorkTaskAction} onSuccess={p.onDone} className="space-y-3">
      <div>
        <label className="label" htmlFor="nt-title">
          Task <span className="font-normal text-muted">(one per line to add several)</span>
        </label>
        <textarea id="nt-title" name="title" required rows={3} autoFocus placeholder="What needs doing?" className="field w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nt-list">
            List
          </label>
          <select id="nt-list" name="listId" defaultValue={p.listId} className="field w-full">
            {p.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {p.folders.find((f) => f.id === l.folderId)?.name ? `${p.folders.find((f) => f.id === l.folderId)!.name} / ` : ""}
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nt-status">
            Status
          </label>
          <select id="nt-status" name="statusId" className="field w-full">
            {p.statuses
              .filter((s) => !isFinishedKind(s.kind))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nt-prio">
            Priority
          </label>
          <select id="nt-prio" name="priority" className="field w-full">
            <option value="">None</option>
            {PRIORITY_LIST.map((x) => (
              <option key={x} value={x}>
                {PRIORITIES[x as Priority].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Due</label>
          <DateInput name="dueDate" value={due} onChange={setDue} aria-label="Due date" className="w-full" />
        </div>
      </div>
      <div>
        <div className="label">Who</div>
        <div className="flex flex-wrap gap-1.5">
          {p.people.map((x) => (
            <label key={x.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-[13px] has-[:checked]:border-electric has-[:checked]:bg-electric-soft">
              <input type="checkbox" name="assigneeIds" value={x.id} className="sr-only" />
              <Avatar name={x.name} size={22} badge={false} /> {x.id === p.meId ? "Me" : x.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={p.onDone} className="cursor-pointer rounded-lg px-3 py-2 text-[14px] text-muted hover:text-ink">
          Cancel
        </button>
        <Submit>Add task</Submit>
      </div>
    </ActionForm>
  );
}

/* ------------------------------- First steps ----------------------------- */

function FirstSteps(p: SpaceViewProps & { listId: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <div className="font-display text-[18px] font-bold">
          {p.space.icon} {p.space.name} is ready
        </div>
        <p className="mt-1 text-[13.5px] text-muted">Add the first tasks below. Paste a list from Excel or WhatsApp to add many at once.</p>
      </div>
      {p.access.work && p.listId && (
        <div className="mx-3 mb-3 rounded-xl border border-dashed border-electric/40 bg-electric-soft/30">
          <QuickAdd listId={p.listId} placeholder="e.g. Book the studio for Thursday" />
        </div>
      )}
      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
        {[
          ["1", "Statuses", "Your own steps, like Brief → Production → Review → Done."],
          ["2", "Columns", "Budget, phone, links, ratings… whatever this team tracks."],
          ["3", "Automations", "When a task moves, assign, notify or add a checklist by itself."],
        ].map(([n, t, d]) => (
          <div key={n} className="bg-white p-4">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold">
              <span className="grid size-5 place-items-center rounded-full bg-navy-900 text-[11px] text-white">{n}</span> {t}
            </div>
            <p className="mt-1 text-[12.5px] text-muted">{d}</p>
          </div>
        ))}
      </div>
      {p.access.manage && (
        <div className="border-t border-line px-5 py-3">
          <Link href={`/spaces/${p.space.id}/settings`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-electric">
            <Settings2 className="size-4" /> Set up statuses, columns and automations
          </Link>
        </div>
      )}
    </div>
  );
}
