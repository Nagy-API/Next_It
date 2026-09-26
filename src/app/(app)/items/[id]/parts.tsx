"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, CornerUpLeft, ExternalLink, Lock, Pencil, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { formatDay } from "@/lib/dates";
import {
  assignAction,
  cancelItemAction,
  commentAction,
  completeStageAction,
  deadlineAction,
  exceptionAction,
  platformAction,
  returnAction,
  updateItemAction,
} from "@/app/actions";
import { ActionForm, AutoInput, AutoSelect, Popover, Submit } from "@/components/client";
import { btn } from "@/components/ui";
import type { ContentType, PlatformStatus, StageKind } from "@/db/schema";
import { PLATFORM_STATUS_META, STAGE_META, TYPE_META } from "@/domain/workflow";

type P = { id: string; name: string; teams: string[] };

/* ------------------------------------------------------------------ */
/* People picker (team members first)                                    */
/* ------------------------------------------------------------------ */

function PeopleOptions({ people, team }: { people: P[]; team: string | null }) {
  const first = team ? people.filter((p) => p.teams.includes(team)) : [];
  const rest = people.filter((p) => !first.includes(p));
  return (
    <>
      <option value="">Unassigned</option>
      {first.length > 0 && (
        <optgroup label={team ? `${STAGE_META[(team === "content" ? "content" : team) as StageKind]?.label ?? "Team"} team` : "Team"}>
          {first.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={first.length ? "Everyone else" : "Everyone"}>
        {rest.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export function AssignSelect({ stageId, kind, value, people, className }: { stageId: string; kind: StageKind; value: string | null; people: P[]; className?: string }) {
  return (
    <ActionForm action={assignAction} inlineError={false} className={className}>
      <input type="hidden" name="stageId" value={stageId} />
      <AutoSelect name="userId" defaultValue={value ?? ""} key={value ?? ""} aria-label={`${STAGE_META[kind].label} owner`} className="w-full">
        <PeopleOptions people={people} team={STAGE_META[kind].team} />
      </AutoSelect>
    </ActionForm>
  );
}

export function DeadlineInput({ stageId, value, disabled, locked }: { stageId: string; value: string | null; disabled?: boolean; locked?: boolean }) {
  if (locked && !value) return <span className="inline-flex h-[30px] items-center text-[13px] text-muted">No deadline</span>;
  if (locked && value)
    return (
      <span className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-canvas px-2.5 text-[13px] font-medium" title="Deadlines can't be changed once set (admins can)">
        <Lock className="size-3.5 text-muted" /> {formatDay(value)}
      </span>
    );
  return (
    <ActionForm action={deadlineAction} inlineError={false} className="flex items-center gap-1">
      <input type="hidden" name="stageId" value={stageId} />
      <AutoInput type="date" name="deadline" defaultValue={value ?? ""} key={value ?? ""} disabled={disabled} aria-label="Deadline" className="w-[150px]" />
    </ActionForm>
  );
}

export function ExceptionToggle({ stageId, excused }: { stageId: string; excused: boolean }) {
  return (
    <ActionForm action={exceptionAction} inlineError={false}>
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="excused" value={excused ? "0" : "1"} />
      <Submit variant="ghost" size="sm" className="!h-7 !px-2 text-[12.5px]" title={excused ? "Count this as late again" : "There was a legitimate reason — don't count it as late"}>
        {excused ? <Undo2 className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
        {excused ? "Undo exception" : "Mark as exception"}
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */
/* The main "what happens next" action                                   */
/* ------------------------------------------------------------------ */

export function CompleteStage({
  stageId,
  kind,
  nextLabel,
  nextOwner,
  needsDrive,
  driveUrl,
  finalLabel,
}: {
  stageId: string;
  kind: StageKind;
  nextLabel: string | null;
  nextOwner: string | null;
  needsDrive: boolean;
  driveUrl: string | null;
  finalLabel: string;
}) {
  return (
    <ActionForm action={completeStageAction} className="space-y-3">
      <input type="hidden" name="stageId" value={stageId} />
      {needsDrive && (
        <div>
          <label className="label" htmlFor="driveUrl">
            Google Drive link to the {kind === "media" ? "final video" : "final design"}
          </label>
          <input id="driveUrl" name="driveUrl" defaultValue={driveUrl ?? ""} placeholder="https://drive.google.com/…" className="field" required />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="primary" size="lg">
          {STAGE_META[kind].completeLabel}
          <ArrowRight className="size-4" />
        </Submit>
        <span className="text-[13px] text-muted">
          {nextLabel ? (
            <>
              Goes to <b className="font-semibold text-ink">{nextLabel}</b>
              {nextOwner ? (
                <>
                  {" "}
                  → <b className="font-semibold text-ink">{nextOwner}</b>
                </>
              ) : (
                " (no owner yet)"
              )}
            </>
          ) : (
            <>
              Item becomes <b className="font-semibold text-ink">{finalLabel}</b>
            </>
          )}
          {" · "}time & name are recorded automatically
        </span>
      </div>
    </ActionForm>
  );
}

export function SendBack({ itemId, targets, label = "Send back" }: { itemId: string; targets: { kind: StageKind; owner: string | null }[]; label?: string }) {
  const [target, setTarget] = useState<StageKind>(targets[targets.length - 1]?.kind);
  if (!targets.length) return null;
  return (
    <Popover
      width={340}
      label={label}
      triggerClassName={btn("secondary", "md")}
      trigger={
        <>
          <CornerUpLeft className="size-4 text-back" /> {label}
        </>
      }
    >
      {(close) => (
        <ActionForm action={returnAction} onSuccess={close} className="space-y-3">
          <input type="hidden" name="itemId" value={itemId} />
          <div className="text-[13px] font-semibold">Something needs changing? Send it back to:</div>
          <div className="space-y-1.5">
            {targets.map((t) => (
              <label key={t.kind} className={clsx("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[14px]", target === t.kind ? "border-back bg-back-soft" : "border-line hover:border-line-strong")}>
                <input type="radio" name="target" value={t.kind} checked={target === t.kind} onChange={() => setTarget(t.kind)} className="accent-[var(--color-back)]" />
                <span className="flex-1 font-medium">{STAGE_META[t.kind].label}</span>
                <span className="text-[12.5px] text-muted">{t.owner ?? "no owner"}</span>
              </label>
            ))}
          </div>
          <textarea name="note" rows={3} placeholder="What needs to change? (optional)" className="field resize-none" />
          <Submit variant="primary" className="w-full !bg-back hover:!bg-[#c9560c]">
            <CornerUpLeft className="size-4" /> Send back to {STAGE_META[target].label}
          </Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

export function CancelToggle({ itemId, cancelled }: { itemId: string; cancelled: boolean }) {
  return (
    <ActionForm action={cancelItemAction} inlineError={false}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="cancelled" value={cancelled ? "0" : "1"} />
      <Submit variant={cancelled ? "primary" : "ghost"} size="sm">
        {cancelled ? (
          <>
            <RotateCcw className="size-3.5" /> Restore item
          </>
        ) : (
          "Cancel this item"
        )}
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Platforms                                                              */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<PlatformStatus, string> = {
  not_planned: "text-faint",
  pending: "text-ink-2",
  scheduled: "text-electric",
  published: "text-ok",
  cancelled: "text-muted line-through",
};

export function PlatformRow({
  itemId,
  platform,
  row,
  canPublish,
  readOnly,
}: {
  itemId: string;
  platform: { id: string; name: string; isActive: boolean };
  row: { status: PlatformStatus; date: string | null; time: string | null; liveUrl: string | null } | null;
  canPublish: boolean;
  readOnly?: boolean;
}) {
  const status = row?.status ?? "not_planned";
  const [editingLink, setEditingLink] = useState(false);
  const planned = status !== "not_planned";
  if (readOnly)
    return (
      <div className="grid grid-cols-[110px_150px_1fr] items-center gap-3 px-4 py-2.5 text-[13.5px]">
        <div className={clsx("font-medium", !planned && "text-muted")}>{platform.name}</div>
        <div className={clsx("font-medium", STATUS_STYLE[status])}>{PLATFORM_STATUS_META[status].label}</div>
        <div className="flex items-center gap-3 text-muted">
          {row?.date && <span>{formatDay(row.date)}{row.time ? ` · ${row.time}` : ""}</span>}
          {row?.liveUrl && (
            <a href={row.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ok hover:underline">
              <ExternalLink className="size-3.5" /> Live post
            </a>
          )}
        </div>
      </div>
    );
  return (
    <div className={clsx("grid grid-cols-[110px_150px_1fr] items-center gap-3 px-4 py-2.5 max-md:grid-cols-[1fr_150px]", !planned && "bg-[#fbfcfe]")}>
      <div className={clsx("font-medium", !planned && "text-muted")}>
        {platform.name}
        {!platform.isActive && <span className="ml-1 text-[11px] text-faint">(retired)</span>}
      </div>
      <ActionForm action={platformAction} inlineError={false}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="platformId" value={platform.id} />
        <AutoSelect name="status" defaultValue={status} key={status} className={clsx("w-full font-medium", STATUS_STYLE[status])} aria-label={`${platform.name} status`}>
          {(Object.keys(PLATFORM_STATUS_META) as PlatformStatus[]).map((s) => (
            <option key={s} value={s} disabled={!canPublish && (s === "scheduled" || s === "published")}>
              {PLATFORM_STATUS_META[s].label}
            </option>
          ))}
        </AutoSelect>
      </ActionForm>
      {planned && status !== "cancelled" ? (
        <div className="flex flex-wrap items-center gap-2 max-md:col-span-2">
          <ActionForm action={platformAction} inlineError={false} className="flex items-center gap-1.5">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="platformId" value={platform.id} />
            <AutoInput type="date" name="date" defaultValue={row?.date ?? ""} key={`d${row?.date}`} className="w-[140px]" aria-label={`${platform.name} date`} />
            <AutoInput type="time" name="time" defaultValue={row?.time ?? ""} key={`t${row?.time}`} className="w-[100px]" aria-label={`${platform.name} time`} />
          </ActionForm>
          {row?.liveUrl && !editingLink ? (
            <span className="flex min-w-0 items-center gap-1">
              <a href={row.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate text-[13px] font-medium text-ok hover:underline">
                <ExternalLink className="size-3.5" /> Live post
              </a>
              <button type="button" onClick={() => setEditingLink(true)} className="rounded p-1 text-faint hover:text-ink" aria-label="Edit live link">
                <Pencil className="size-3" />
              </button>
            </span>
          ) : status === "published" || editingLink ? (
            <ActionForm action={platformAction} onSuccess={() => setEditingLink(false)} className="flex min-w-0 flex-1 items-center gap-1.5">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="platformId" value={platform.id} />
              <input name="liveUrl" defaultValue={row?.liveUrl ?? ""} placeholder="Paste the live post link" className="field field-sm min-w-0 flex-1" />
              <Submit size="sm" variant="secondary">
                Save
              </Submit>
            </ActionForm>
          ) : null}
        </div>
      ) : (
        <div className="text-[12.5px] text-faint max-md:hidden">{status === "cancelled" ? "Cancelled for this platform" : "Not posting here"}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Details & comments                                                     */
/* ------------------------------------------------------------------ */

export function DetailsForm({
  item,
  canChangeType,
  canEditContent = true,
}: {
  item: { id: string; title: string; type: ContentType; postingDate: string | null; postingTime: string | null; canvaUrl: string | null; driveUrl: string | null; context: "plan" | "project" };
  canChangeType: boolean;
  canEditContent?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className={btn("ghost", "sm", "-mr-2")}>
        <Pencil className="size-3.5" /> Edit
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy-950/30 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && setEditing(false)}>
      <div className="card w-full max-w-lg animate-in p-5 shadow-pop">
        <div className="mb-4 font-display text-[16px] font-bold">Edit details</div>
        <ActionForm action={updateItemAction} onSuccess={() => setEditing(false)} className="space-y-3">
          <input type="hidden" name="itemId" value={item.id} />
          <div>
            <label className="label">Title</label>
            <input name="title" defaultValue={item.title} className="field" required disabled={!canEditContent} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Type</label>
              <select name="type" defaultValue={item.type} disabled={!canChangeType} className="field" title={canChangeType ? "" : "Only while still in Content"}>
                {(Object.keys(TYPE_META) as ContentType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{item.context === "plan" ? "Posting date" : "Due date"}</label>
              <input type="date" name="postingDate" defaultValue={item.postingDate ?? ""} className="field" />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" name="postingTime" defaultValue={item.postingTime ?? ""} className="field" />
            </div>
          </div>
          <div>
            <label className="label">Canva link (to this exact page)</label>
            <input name="canvaUrl" defaultValue={item.canvaUrl ?? ""} placeholder="https://canva.link/…" className="field" disabled={!canEditContent} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btn("ghost")} onClick={() => setEditing(false)}>
              Close
            </button>
            <Submit>Save changes</Submit>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}

export function CommentBox({ itemId }: { itemId: string }) {
  return (
    <ActionForm action={commentAction} resetOnSuccess toast={false} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Add a note for the team…"
        className="field resize-y"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-faint">Ctrl + Enter to post</span>
        <Submit size="sm" variant="dark">
          Post note
        </Submit>
      </div>
    </ActionForm>
  );
}

export function TakeIt({ stageId, userId }: { stageId: string; userId: string }) {
  return (
    <ActionForm action={assignAction} inlineError={false}>
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="userId" value={userId} />
      <Submit variant="dark" size="sm">
        I&rsquo;ll take it
      </Submit>
    </ActionForm>
  );
}
