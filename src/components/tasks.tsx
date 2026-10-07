"use client";

import { useState } from "react";
import clsx from "clsx";
import { CalendarClock, Check, ClipboardPlus, Repeat, Trash2 } from "lucide-react";
import { createTaskAction, deleteTaskAction, taskDoneAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "./client";
import { Avatar } from "./avatar";
import { BrandDot, btn } from "./ui";
import { TEAM_META, isNewTask } from "@/domain/workflow";
import type { Team } from "@/db/schema";
import { formatDay, formatRelative } from "@/lib/dates";

type P = { id: string; name: string; teams: string[] };
type B = { id: string; name: string };

const REPEAT = [
  { v: "none", label: "Once" },
  { v: "daily", label: "Every day" },
  { v: "weekly", label: "Every week" },
  { v: "monthly", label: "Every month" },
] as const;

/** Managers: give a task to one or more people, with a deadline and an optional repeat. */
export function GiveTaskButton({ people, brands, variant = "sidebar" }: { people: P[]; brands: B[]; variant?: "sidebar" | "button" }) {
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
        <TaskForm people={people} brands={brands} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Where a brand task starts, and which content types can start there. */
const STEPS = [
  { v: "content", label: "Content", types: ["reel", "static", "carousel", "story"] },
  { v: "shooting", label: "Shooting", types: ["reel"] },
  { v: "media", label: "Editing", types: ["reel"] },
  { v: "design", label: "Design", types: ["static", "carousel"] },
  { v: "social", label: "Social", types: ["reel", "static", "carousel", "story"] },
] as const;
const TYPE_LABEL: Record<string, string> = { reel: "Reel", static: "Static post", carousel: "Carousel", story: "Story" };
const STEP_FOR_TEAM: Record<string, string> = { content: "content", media: "media", design: "design", social: "social" };

function TaskForm({ people, brands, onDone }: { people: P[]; brands: B[]; onDone: () => void }) {
  const [who, setWho] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<string>("none");
  const [brandId, setBrandId] = useState("");
  const [step, setStep] = useState<string>("");
  const [type, setType] = useState<string>("reel");
  const toggle = (id: string) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  // The step follows the first person's team until the manager picks one.
  const firstTeam = people.find((p) => p.id === who[0])?.teams.find((t) => STEP_FOR_TEAM[t]);
  const stepNow = step || (firstTeam ? STEP_FOR_TEAM[firstTeam] : "content");
  const stepMeta = STEPS.find((x) => x.v === stepNow)!;
  const typeNow = (stepMeta.types as readonly string[]).includes(type) ? type : stepMeta.types[0];
  const brandName = brands.find((b) => b.id === brandId)?.name;
  const groups = new Map<string, P[]>();
  for (const p of people) {
    const t = (p.teams.find((x) => x !== "leadership") ?? p.teams[0] ?? "other") as Team | "other";
    const label = t === "other" ? "Other" : TEAM_META[t].label;
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  return (
    <ActionForm action={createTaskAction} onSuccess={onDone} className="space-y-4">
      {who.map((id) => (
        <input key={id} type="hidden" name="assigneeId" value={id} />
      ))}
      <input type="hidden" name="recurrence" value={brandId ? "none" : repeat} />
      {brandId && <input type="hidden" name="step" value={stepNow} />}
      {brandId && <input type="hidden" name="type" value={typeNow} />}
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
                        on ? "border-electric bg-electric-soft text-[#1d5fd1]" : "border-line bg-white text-ink-2 hover:border-line-strong",
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
            <div className="label">Starts at</div>
            <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-0.5" role="radiogroup" aria-label="Starts at">
              {STEPS.map((x) => (
                <button
                  key={x.v}
                  type="button"
                  role="radio"
                  aria-checked={stepNow === x.v}
                  onClick={() => setStep(x.v)}
                  className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium", stepNow === x.v ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas hover:text-ink")}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          {stepMeta.types.length > 1 && (
            <div>
              <div className="label">Type</div>
              <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-0.5" role="radiogroup" aria-label="Type">
                {stepMeta.types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={typeNow === t}
                    onClick={() => setType(t)}
                    className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium", typeNow === t ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas hover:text-ink")}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[12.5px] text-ink-2">
            It goes into <b>{brandName}</b>&rsquo;s plan for this month as <b className="text-[#b45309]">Extra</b> work, starting at <b>{stepMeta.label}</b>
            {stepNow !== "content" && " (the steps before it are skipped)"}. They upload the link there and it goes for approval like any item.
          </p>
        </div>
      )}
      <div className={clsx("grid gap-3", !brandId && "sm:grid-cols-[1fr_120px]")}>
        <div>
          <label className="label" htmlFor="task-due">
            Deadline
          </label>
          <input id="task-due" type="date" name="dueDate" className="field" />
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
        <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-0.5" role="radiogroup" aria-label="Repeat">
          {REPEAT.map((r) => (
            <button
              key={r.v}
              type="button"
              role="radio"
              aria-checked={repeat === r.v}
              onClick={() => setRepeat(r.v)}
              className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium", repeat === r.v ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas hover:text-ink")}
            >
              {r.label}
            </button>
          ))}
        </div>
        {repeat !== "none" && <p className="mt-1.5 text-[12.5px] text-muted">When it&rsquo;s done, the next one is created by itself.</p>}
      </div>
      )}
      <div>
        <label className="label" htmlFor="task-notes">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="task-notes" name="notes" placeholder="Links, details…" className="field" />
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
};

/** One task with a big tick button. `mode="mine"` for the person doing it, `"given"` for the manager who gave it. */
export function TaskRow({ t, today, mode, canDelete }: { t: TaskRowData; today: string; mode: "mine" | "given"; canDelete: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const late = !t.doneAt && t.dueDate && t.dueDate < today;
  const soon = !t.doneAt && t.dueDate && !late && t.dueDate <= addDaysISO(today, 2);
  return (
    <div className={clsx("flex items-start gap-3 px-4 py-3", t.doneAt && "opacity-60", late && "bg-bad-soft/40", soon && "bg-warn-soft/40")}>
      <ActionForm action={taskDoneAction} inlineError={false}>
        <input type="hidden" name="taskId" value={t.id} />
        <input type="hidden" name="done" value={t.doneAt ? "0" : "1"} />
        <button
          type="submit"
          title={t.doneAt ? "Reopen" : "Mark as done"}
          aria-label={t.doneAt ? `Reopen ${t.title}` : `Done: ${t.title}`}
          className={clsx(
            "mt-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
            t.doneAt ? "border-ok bg-ok text-white" : "border-line-strong bg-white text-transparent hover:border-ok hover:text-ok",
          )}
        >
          <Check className="size-3.5" strokeWidth={3.2} />
        </button>
      </ActionForm>
      <div className="min-w-0 flex-1">
        <div className={clsx("text-[14.5px] font-semibold", t.doneAt && "line-through")}>{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
          {isNewTask(t) && <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span>}
          {mode === "mine" ? <span>from {t.createdByName}</span> : <span className="inline-flex items-center gap-1"><Avatar name={t.assigneeName} size={18} badge={false} /> {t.assigneeName}</span>}
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
          {t.doneAt && <span className="text-ok">Done {formatRelative(t.doneAt)}</span>}
        </div>
        {t.notes && <div className="mt-1 text-[13px] text-ink-2">{t.notes}</div>}
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

function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
