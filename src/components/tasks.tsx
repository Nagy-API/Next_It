"use client";

import { TASK_PRIORITIES } from "@/domain/priority";
import { useState } from "react";
import clsx from "clsx";
import { BadgeCheck, CalendarCheck, CalendarClock, Check, CircleDashed, ClipboardPlus, CornerUpLeft, Hourglass, Loader, Repeat, Trash2, type LucideIcon } from "lucide-react";
import { createTaskAction, deleteTaskAction, sendBackTaskAction, taskDoneAction, taskStatusAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "./client";
import { Avatar } from "./avatar";
import { BrandDot, PriorityChip, btn } from "./ui";
import { TEAM_META, isNewTask } from "@/domain/workflow";
import type { Team } from "@/db/schema";
import { formatDay, formatRelative } from "@/lib/dates";
import { DateInput } from "@/components/date-input";
import { Attachments, PendingAttachments, type AttachmentItem } from "./attachments";

type P = { id: string; name: string; teams: string[]; manager?: boolean };
type B = { id: string; name: string };

const REPEAT = [
  { v: "none", label: "Once" },
  { v: "daily", label: "Every day" },
  { v: "weekly", label: "Every week" },
  { v: "monthly", label: "Every month" },
] as const;

/** Managers: give a task to one or more people, with a deadline and an optional repeat. */
export function GiveTaskButton({ people, brands, meId, variant = "sidebar" }: { people: P[]; brands: B[]; meId?: string; variant?: "sidebar" | "button" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "sidebar"
            ? "mb-2 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-white/25 px-3 py-2 text-[14px] font-semibold text-white transition-colors hover:border-electric-bright hover:bg-white/5"
            : btn("secondary")
        }
      >
        <ClipboardPlus className="size-[18px]" strokeWidth={1.9} /> Give a task
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Give a task" width={560}>
        <TaskForm people={people} brands={brands} meId={meId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** What a brand task is, and where it can start. "Other" (a brief, a document…) picks its own steps, then an approval. */
const TYPES = [
  { v: "reel", label: "Reel", steps: ["content", "shooting", "media", "social"] },
  { v: "static", label: "Static post", steps: ["content", "design", "social"] },
  { v: "carousel", label: "Carousel", steps: ["content", "design", "social"] },
  { v: "story", label: "Story", steps: ["content", "social"] },
  { v: "other", label: "Other", steps: ["content", "shooting", "media", "design"] },
] as const;
const STEP_LABEL: Record<string, string> = { content: "Content", shooting: "Shooting", media: "Editing", design: "Design", social: "Social" };
const STEP_FOR_TEAM: Record<string, string> = { content: "content", media: "media", design: "design", social: "social" };

function Chips({ value, options, onChange, label, multi }: { value: string[]; options: { v: string; label: string }[]; onChange: (v: string) => void; label: string; multi?: boolean }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-xl border border-line bg-surface p-0.5" role={multi ? "group" : "radiogroup"} aria-label={label}>
      {options.map((x) => {
        const on = value.includes(x.v);
        return (
          <button
            key={x.v}
            type="button"
            role={multi ? undefined : "radio"}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            onClick={() => onChange(x.v)}
            className={clsx("inline-flex cursor-pointer items-center gap-1 rounded-[9px] px-3 py-1.5 text-[13px] font-medium", on ? "bg-strong text-white" : "text-muted hover:bg-canvas hover:text-ink")}
          >
            {multi && on && <Check className="size-3.5" strokeWidth={3} />}
            {x.label}
          </button>
        );
      })}
    </div>
  );
}

function TaskForm({ people, brands, meId, onDone }: { people: P[]; brands: B[]; meId?: string; onDone: () => void }) {
  const [who, setWho] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<string>("none");
  const [brandId, setBrandId] = useState("");
  const [step, setStep] = useState<string>("");
  const [type, setType] = useState<string>("reel");
  const [otherSteps, setOtherSteps] = useState<string[] | null>(null);
  const [priority, setPriority] = useState<string>("");
  // Who can approve: managers and Account Management (and me).
  const approvers = people.filter((p) => p.manager || p.teams.includes("account") || p.id === meId);
  const accountPerson = people.find((p) => p.teams.includes("account"))?.id;
  const [approver, setApprover] = useState<string | null>(null);
  const toggle = (id: string) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  // The step follows the first person's team until the manager picks one.
  const firstTeam = people.find((p) => p.id === who[0])?.teams.find((t) => STEP_FOR_TEAM[t]);
  const typeMeta = TYPES.find((t) => t.v === type)!;
  const teamStep = firstTeam ? STEP_FOR_TEAM[firstTeam] : "content";
  const stepNow = (typeMeta.steps as readonly string[]).includes(step) ? step : (typeMeta.steps as readonly string[]).includes(teamStep) ? teamStep : "content";
  const other = type === "other";
  const otherNow = otherSteps ?? [(typeMeta.steps as readonly string[]).includes(teamStep) ? teamStep : "content"];
  // Default approver: Account Management for "Other" brand work, else whoever gives the task.
  const approverNow = approver ?? (brandId && other ? (accountPerson ?? meId ?? "") : (meId ?? ""));
  const brandName = brands.find((b) => b.id === brandId)?.name;
  const groups = new Map<string, P[]>();
  for (const p of people) {
    const t = (p.teams.find((x) => x !== "leadership") ?? p.teams[0] ?? "other") as Team | "other";
    const label = t === "other" ? "Other" : TEAM_META[t].label;
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  const approverSelect = (label: string, allowNone: boolean) => (
    <div>
      <label className="label" htmlFor="task-approver">
        {label}
      </label>
      <select id="task-approver" className="field" value={approverNow} onChange={(e) => setApprover(e.target.value)}>
        {allowNone && <option value="">No approval needed (ticking it done is enough)</option>}
        {approvers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === meId ? `Me (${p.name})` : p.name}
            {p.teams.includes("account") ? " · Account Management" : ""}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <ActionForm action={createTaskAction} onSuccess={onDone} className="space-y-4">
      {who.map((id) => (
        <input key={id} type="hidden" name="assigneeId" value={id} />
      ))}
      <input type="hidden" name="recurrence" value={brandId ? "none" : repeat} />
      <input type="hidden" name="priority" value={priority} />
      {brandId && <input type="hidden" name="step" value={other ? otherNow[0] : stepNow} />}
      {brandId && <input type="hidden" name="type" value={type} />}
      {brandId && other && otherNow.map((k) => <input key={k} type="hidden" name="otherStep" value={k} />)}
      {(!brandId || other) && approverNow && <input type="hidden" name="approverId" value={approverNow} />}
      <div>
        <label className="label" htmlFor="task-title">
          What needs to be done?
        </label>
        <input id="task-title" name="title" required autoFocus placeholder="e.g. Send the weekly report to the client" className="field" />
      </div>
      <div>
        <div className="label">For who? {who.length > 0 && <span className="font-normal text-muted">· {who.length} selected</span>}</div>
        <div className="max-h-[210px] space-y-2 overflow-y-auto rounded-xl border border-line p-2.5">
          {[...groups.entries()].map(([label, ps]) => (
            <div key={label}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
              <div className="flex flex-wrap gap-1.5">
                {ps.map((p) => {
                  const on = who.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p.id)}
                      className={clsx(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium transition-colors",
                        on ? "border-electric bg-electric-soft text-[#1d5fd1]" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                      )}
                    >
                      <Avatar name={p.name} size={22} badge={false} /> {p.name}
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="task-brand">
          Brand <span className="font-normal text-muted">(optional — the task goes into the brand as Extra work)</span>
        </label>
        <select id="task-brand" name="brandId" className="field" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">— Not for a brand (a simple to-do)</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {brandId && (
        <div className="space-y-3 rounded-xl border border-[#f6d9ad] bg-[#fffaf2] p-3">
          <div>
            <div className="label">What is it?</div>
            <Chips label="What is it?" value={[type]} options={TYPES.map((t) => ({ v: t.v, label: t.label }))} onChange={setType} />
            {other && <p className="mt-1 text-[12px] text-muted">A brief, a document, a script, research… anything that isn&rsquo;t a post.</p>}
          </div>
          {other ? (
            <>
              <div>
                <div className="label">Steps it goes through</div>
                <Chips
                  label="Steps"
                  multi
                  value={otherNow}
                  options={typeMeta.steps.map((k) => ({ v: k, label: STEP_LABEL[k] }))}
                  onChange={(k) => {
                    const next = otherNow.includes(k) ? otherNow.filter((x) => x !== k) : [...otherNow, k];
                    setOtherSteps(next.length ? typeMeta.steps.filter((x) => next.includes(x)) : otherNow);
                  }}
                />
              </div>
              {approverSelect("Then approved by", false)}
              <p className="text-[12.5px] text-ink-2">
                It goes into <b>{brandName}</b> as <b className="text-[#b45309]">Extra</b> work:{" "}
                <b>{[...otherNow.map((k) => STEP_LABEL[k]), "Approval"].join(" → ")}</b>. The first step is for the person you picked; when the approver approves it, it&rsquo;s done.
              </p>
            </>
          ) : (
            <>
              <div>
                <div className="label">Starts at</div>
                <Chips label="Starts at" value={[stepNow]} options={typeMeta.steps.map((k) => ({ v: k, label: STEP_LABEL[k] }))} onChange={setStep} />
              </div>
              <p className="text-[12.5px] text-ink-2">
                It goes into <b>{brandName}</b>&rsquo;s plan for this month as <b className="text-[#b45309]">Extra</b> work, starting at <b>{STEP_LABEL[stepNow]}</b>
                {stepNow !== "content" && " (the steps before it are skipped)"}. They upload the link there and it goes for approval like any item.
              </p>
            </>
          )}
        </div>
      )}
      {!brandId && approverSelect("Approval when it's done", true)}
      <div className={clsx("grid gap-3", !brandId && "sm:grid-cols-[1fr_120px]")}>
        <div>
          <label className="label" htmlFor="task-due">
            Deadline
          </label>
          <DateInput id="task-due" name="dueDate" className="w-full" />
        </div>
        {!brandId && (
          <div>
            <label className="label" htmlFor="task-time">
              Time
            </label>
            <input id="task-time" type="time" name="dueTime" className="field" />
          </div>
        )}
      </div>
      {!brandId && (
      <div>
        <div className="label">Repeat</div>
        <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-0.5" role="radiogroup" aria-label="Repeat">
          {REPEAT.map((r) => (
            <button
              key={r.v}
              type="button"
              role="radio"
              aria-checked={repeat === r.v}
              onClick={() => setRepeat(r.v)}
              className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium", repeat === r.v ? "bg-strong text-white" : "text-muted hover:bg-canvas hover:text-ink")}
            >
              {r.label}
            </button>
          ))}
        </div>
        {repeat !== "none" && <p className="mt-1.5 text-[12.5px] text-muted">When it&rsquo;s done, the next one is created by itself.</p>}
      </div>
      )}
      <div>
        <div className="label">
          Priority <span className="font-normal text-muted">(optional)</span>
        </div>
        <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-0.5" role="radiogroup" aria-label="Priority">
          {[
            { v: "", label: "Normal", dot: "var(--color-faint)" },
            { v: "important", label: "Important", dot: TASK_PRIORITIES.important.color },
            { v: "urgent", label: "Urgent", dot: TASK_PRIORITIES.urgent.color },
          ].map((x) => (
            <button
              key={x.v || "normal"}
              type="button"
              role="radio"
              aria-checked={priority === x.v}
              onClick={() => setPriority(x.v)}
              className={clsx("inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-medium", priority === x.v ? "bg-strong text-white" : "text-muted hover:bg-canvas hover:text-ink")}
            >
              <span className="size-2 rounded-full" style={{ background: x.dot }} />
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="task-notes">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="task-notes" name="notes" placeholder="Details…" className="field" />
      </div>
      <div>
        <div className="label">
          Files & links <span className="font-normal text-muted">(optional · PDF, Word, images, or a document link)</span>
        </div>
        <PendingAttachments />
        {!brandId && <p className="mt-1.5 text-[12px] text-muted">Tasks without a brand show in the person&rsquo;s My tasks, with their files.</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <button type="button" onClick={onDone} className={btn("ghost")}>
          Cancel
        </button>
        <Submit disabled={!who.length}>
          <ClipboardPlus className="size-4" /> Send task
        </Submit>
      </div>
    </ActionForm>
  );
}

export type TaskRowData = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  recurrence: string;
  doneAt: Date | null;
  assigneeName: string;
  createdByName: string;
  brandName: string | null;
  brandColor: string | null;
  createdAt: Date;
  status: string;
  scheduledDate: string | null;
  priority?: string | null;
  assigneeId?: string;
  createdById?: string;
  approverId?: string | null;
  approverName?: string | null;
  submittedAt?: Date | null;
  returnNote?: string | null;
  returnedById?: string | null;
  returnedAt?: Date | null;
};

/** What the person is doing with a task. Done is the round check button. */
const TASK_STATUS: { v: string; label: string; icon: LucideIcon; on: string }[] = [
  { v: "todo", label: "Not started", icon: CircleDashed, on: "bg-sunken text-ink-2 ring-line-strong" },
  { v: "in_progress", label: "In progress", icon: Loader, on: "bg-electric-soft text-[#1d5fd1] ring-electric/40" },
  { v: "scheduled", label: "Scheduled", icon: CalendarCheck, on: "bg-[#f1e8fd] text-[#6d28d9] ring-[#6d28d9]/30" },
  { v: "waiting", label: "Waiting", icon: Hourglass, on: "bg-warn-soft text-warn ring-warn/30" },
];

function StatusPill({ t }: { t: Pick<TaskRowData, "status" | "scheduledDate"> }) {
  const st = TASK_STATUS.find((x) => x.v === t.status) ?? TASK_STATUS[0];
  const Icon = st.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1", st.on)}>
      <Icon className="size-3" strokeWidth={2.4} /> {st.label}
      {t.status === "scheduled" && t.scheduledDate && <> · {formatDay(t.scheduledDate)}</>}
    </span>
  );
}

/** The person picks what's happening: not started, in progress, scheduled for a day, or waiting on someone. */
function StatusPicker({ t, today }: { t: TaskRowData; today: string }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {TASK_STATUS.map((x) => {
        const on = t.status === x.v;
        const Icon = x.icon;
        if (x.v === "scheduled")
          return (
            <button
              key={x.v}
              type="button"
              aria-pressed={on}
              onClick={() => setPicking((p) => !p)}
              className={clsx(
                "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors",
                on ? x.on : "bg-surface text-muted ring-line hover:text-ink hover:ring-line-strong",
              )}
            >
              <Icon className="size-3.5" /> {x.label}
              {on && t.scheduledDate && <> · {formatDay(t.scheduledDate)}</>}
            </button>
          );
        return (
          <ActionForm key={x.v} action={taskStatusAction} inlineError={false}>
            <input type="hidden" name="taskId" value={t.id} />
            <input type="hidden" name="status" value={x.v} />
            <button
              type="submit"
              aria-pressed={on}
              className={clsx(
                "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors",
                on ? x.on : "bg-surface text-muted ring-line hover:text-ink hover:ring-line-strong",
              )}
            >
              <Icon className="size-3.5" /> {x.label}
            </button>
          </ActionForm>
        );
      })}
      {picking && (
        <ActionForm action={taskStatusAction} onSuccess={() => setPicking(false)} className="flex items-center gap-1.5">
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="status" value="scheduled" />
          <DateInput name="scheduledDate" required min={today} defaultValue={t.scheduledDate ?? ""} aria-label="Day you'll do it" size="sm" className="w-[140px]" />
          <Submit variant="secondary" className="!h-8 !px-3 text-[12.5px]">
            Save
          </Submit>
        </ActionForm>
      )}
    </div>
  );
}

/** One task with a big tick button. `mode="mine"` for the person doing it, `"given"` for the manager who gave it. */
export function TaskRow({
  t,
  today,
  mode,
  canDelete,
  files,
  meId,
  manager,
  showGiver,
}: {
  t: TaskRowData;
  today: string;
  mode: "mine" | "given";
  canDelete: boolean;
  files?: AttachmentItem[];
  meId?: string;
  manager?: boolean;
  /** "Tasks I gave" with everyone's tasks: say who gave each one. */
  showGiver?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const late = !t.doneAt && t.dueDate && t.dueDate < today;
  const soon = !t.doneAt && t.dueDate && !late && t.dueDate <= addDaysISO(today, 2);
  const waiting = !t.doneAt && !!t.submittedAt;
  // Same rule as the server (mayApproveTask): not your own work, unless you gave it to yourself.
  const own = t.assigneeId === meId && t.createdById !== meId;
  const mayApprove = !own && (t.approverId === meId || t.createdById === meId || !!manager);
  const needsApproval = !!t.approverId && !mayApprove;
  const returned = !t.doneAt && t.returnNote && t.returnedAt;
  return (
    <div className={clsx("flex items-start gap-3 px-4 py-3", t.doneAt && "opacity-60", late && "bg-bad-soft/40", soon && "bg-warn-soft/40")}>
      <ActionForm action={taskDoneAction} inlineError={false}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="done" value={t.doneAt || (waiting && !mayApprove) ? "0" : "1"} />
        <button
          type="submit"
          title={t.doneAt ? "Reopen" : waiting ? (mayApprove ? "Approve" : "Waiting approval · tap to take it back") : needsApproval ? `Done: send it to ${t.approverName ?? "the approver"} to approve` : "Mark as done"}
          aria-label={t.doneAt ? `Reopen ${t.title}` : waiting && mayApprove ? `Approve ${t.title}` : `Done: ${t.title}`}
          className={clsx(
            "mt-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
            t.doneAt ? "animate-pop border-ok bg-ok text-white" : waiting ? "border-[#14b8a6] bg-[#e3f5f3] text-[#0f766e]" : "border-line-strong bg-surface text-transparent hover:border-ok hover:text-ok",
          )}
        >
          {waiting && !mayApprove ? <Hourglass className="size-3" strokeWidth={2.6} /> : <Check className="size-3.5" strokeWidth={3.2} />}
        </button>
      </ActionForm>
      <div className="min-w-0 flex-1">
        <div className={clsx("text-[14.5px] font-semibold", t.doneAt && "line-through")}>{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
          {isNewTask(t) && <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span>}
          {!t.doneAt && <PriorityChip priority={t.priority} />}
          {mode === "mine" ? (
            <span>from {t.createdByName}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Avatar name={t.assigneeName} size={18} badge={false} /> {t.assigneeName}
              {showGiver && <span className="text-faint">· given by {t.createdByName}</span>}
            </span>
          )}
          <span>· given {formatRelative(t.createdAt)}</span>
          {t.dueDate ? (
            <span className={clsx("inline-flex items-center gap-1", late ? "font-semibold text-bad" : soon ? "font-semibold text-warn" : "")}>
              <CalendarClock className="size-3.5" /> {late ? "Was due" : "Due"} {formatDay(t.dueDate)}
              {t.dueTime && ` · ${t.dueTime}`}
            </span>
          ) : (
            !t.doneAt && <span className="inline-flex items-center gap-1 text-faint"><CalendarClock className="size-3.5" /> No deadline</span>
          )}
          {t.recurrence !== "none" && (
            <span className="inline-flex items-center gap-1 text-electric">
              <Repeat className="size-3.5" /> {REPEAT.find((r) => r.v === t.recurrence)?.label}
            </span>
          )}
          {t.brandName && (
            <span className="inline-flex items-center gap-1">
              {t.brandColor && <BrandDot color={t.brandColor} />} {t.brandName}
            </span>
          )}
          {t.approverName && !t.doneAt && !waiting && (
            <span className="inline-flex items-center gap-1">
              <BadgeCheck className="size-3.5" /> Approval: {t.approverId === meId ? "you" : t.approverName}
            </span>
          )}
          {t.doneAt ? (
            <span className="text-ok">Done {formatRelative(t.doneAt)}</span>
          ) : waiting ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e3f5f3] px-2 py-0.5 text-[11.5px] font-semibold text-[#0f766e]">
              <Hourglass className="size-3" /> {mayApprove ? "Waiting for your approval" : `Waiting approval${t.approverName ? ` · ${t.approverName}` : ""}`}
            </span>
          ) : (
            mode === "given" && <StatusPill t={t} />
          )}
        </div>
        {t.notes && <div className="mt-1 text-[13px] text-ink-2">{t.notes}</div>}
        {returned && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-back-soft px-2.5 py-1.5 text-[12.5px] text-ink-2">
            <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-back" />
            <span>
              <b className="text-back">Sent back</b> {t.returnedById === meId ? "by you" : ""} {formatRelative(t.returnedAt!)}: &ldquo;{t.returnNote}&rdquo;
            </span>
          </div>
        )}
        {meId && (
          <div className="mt-2">
            <Attachments items={files ?? []} taskId={t.id} meId={meId} manager={manager} compact />
          </div>
        )}
        {mode === "mine" && !t.doneAt && !waiting && <StatusPicker t={t} today={today} />}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {waiting && mayApprove && (
            <ActionForm action={taskDoneAction} inlineError={false}>
              <input type="hidden" name="taskId" value={t.id} />
              <input type="hidden" name="done" value="1" />
              <Submit variant="success" className="!h-8 !px-3 text-[12.5px]">
                <BadgeCheck className="size-3.5" /> Approve
              </Submit>
            </ActionForm>
          )}
          {(!t.doneAt || mayApprove) && <SendBackTask t={t} toGiver={own || (mode === "mine" && !mayApprove)} />}
        </div>
      </div>
      {canDelete && (
        <>
          <button type="button" onClick={() => setConfirm(true)} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Delete ${t.title}`}>
            <Trash2 className="size-4" />
          </button>
          <Modal open={confirm} onClose={() => setConfirm(false)} title={`Delete “${t.title}”?`}>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirm(false)} className={btn("ghost")}>
                Keep it
              </button>
              {t.recurrence !== "none" && (
                <ActionForm action={deleteTaskAction} onSuccess={() => setConfirm(false)}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <input type="hidden" name="series" value="1" />
                  <Submit variant="secondary">Stop repeating</Submit>
                </ActionForm>
              )}
              <ActionForm action={deleteTaskAction} onSuccess={() => setConfirm(false)}>
                <input type="hidden" name="taskId" value={t.id} />
                <Submit variant="primary" className="!bg-bad hover:!bg-[#b92f2f]">
                  <Trash2 className="size-4" /> Delete
                </Submit>
              </ActionForm>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

/** Send a task back with a note: the person to whoever gave it ("I need…"), or the giver / approver to the person (changes). */
function SendBackTask({ t, toGiver }: { t: TaskRowData; toGiver: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("ghost", "sm", "!h-8 text-[12.5px] text-back")}>
        <CornerUpLeft className="size-3.5" /> Send back
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={toGiver ? `Send back to ${t.createdByName}` : `Send back to ${t.assigneeName}`} width={460}>
        <ActionForm action={sendBackTaskAction} onSuccess={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="taskId" value={t.id} />
          <p className="text-[13px] text-muted">
            {toGiver ? "Need something before you can do it? Say what. They get a notification and the task waits." : "Say what to change. It goes back to them, open again."}
          </p>
          <textarea name="note" required rows={3} autoFocus className="field resize-y" placeholder={toGiver ? "e.g. I need the client's logo files first" : "e.g. Add the prices to the second page"} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
              Cancel
            </button>
            <Submit>
              <CornerUpLeft className="size-4" /> Send back
            </Submit>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
