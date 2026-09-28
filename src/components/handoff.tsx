"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Clock,
  ExternalLink,
  Flame,
  FolderOpen,
  FolderUp,
  Hand,
  Layers,
  Lock,
  MapPin,
  MessageSquareWarning,
  Palette,
  PenTool,
  Send,
  ThumbsUp,
  Truck,
} from "lucide-react";
import { assignAction, completeStageAction, handOffAction, platformAction, progressAction, reviewVersionAction, shootAction, submitVersionAction } from "@/app/actions";
import type { StageKind, StageProgress } from "@/db/schema";
import { STAGE_META, TYPE_META, handoffTargets, type WorkContext } from "@/domain/workflow";
import { formatDateTime, formatDay, formatRelative } from "@/lib/dates";
import type { StageView, VersionView, WorkItem } from "@/server/queries";
import { ActionForm, Submit } from "./client";
import { Avatar } from "./avatar";
import { BrandDot, TypeIcon, btn } from "./ui";

export type PickPerson = { id: string; name: string; teams: string[] };

/** What each person may do on a card — decided on the server, passed down. */
export type Rights = { deadline: boolean; assign: boolean; review: boolean };

const TARGET_INFO: Partial<Record<StageKind, { icon: typeof Send; hint: string; short: string }>> = {
  shooting: { icon: Camera, hint: "Shoot, then edit", short: "Shooting" },
  media: { icon: Clapperboard, hint: "Editing only", short: "Editing" },
  design: { icon: PenTool, hint: "Posts & carousels", short: "Design" },
  social: { icon: Send, hint: "Straight to publishing", short: "Social" },
  delivery: { icon: Truck, hint: "Send to the client", short: "Delivery" },
};

export const PROGRESS_STEPS: { key: StageProgress; label: string }[] = [
  { key: "not_started", label: "Not started" },
  { key: "processing", label: "Processing" },
  { key: "adjusting", label: "Adjusting" },
  { key: "waiting_approval", label: "Waiting approval" },
];

type HandItem = Pick<WorkItem, "id" | "type" | "context" | "driveUrl" | "canvaUrl" | "canvaLink" | "stages" | "versions" | "shoot" | "title" | "defaults">;

function defaultTarget(item: HandItem, stageId: string, targets: StageKind[]): StageKind {
  const pos = item.stages.find((x) => x.id === stageId)?.position ?? 0;
  const routeNext = item.stages.find((s) => s.position > pos)?.kind;
  return routeNext && targets.includes(routeNext) ? routeNext : targets[0];
}

function TargetChips({ targets, value, onChange, big }: { targets: StageKind[]; value: StageKind; onChange: (t: StageKind) => void; big?: boolean }) {
  return (
    <div className={clsx("grid gap-2", big ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4")} role="radiogroup" aria-label="Send to">
      {targets.map((t) => {
        const info = TARGET_INFO[t];
        const Icon = info?.icon ?? Send;
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={clsx(
              "flex cursor-pointer items-center gap-2 rounded-xl border-2 text-left transition-colors duration-150",
              big ? "px-3 py-2.5" : "px-2.5 py-1.5",
              on ? "border-electric bg-electric-soft" : "border-line bg-white hover:border-line-strong",
            )}
          >
            <Icon className={clsx("size-[18px] shrink-0", on ? "text-electric" : "text-muted")} strokeWidth={1.9} />
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold">{big ? STAGE_META[t].label : info?.short}</span>
              {big && <span className="block text-[12px] text-muted">{info?.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Who gets it next (managers choose; others see the default) and the deadline (managers only). */
function WhoAndWhen({
  stageId,
  target,
  people,
  existingDeadline,
  assigneeId,
  setAssigneeId,
  rights,
  defaultPerson,
}: {
  stageId: string;
  target: StageKind;
  people: PickPerson[];
  existingDeadline: string | null;
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  rights: Rights;
  defaultPerson: string | null;
}) {
  const team = STAGE_META[target]?.team;
  const teamPeople = people.filter((p) => team && p.teams.includes(team));
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor={`who-${stageId}`}>
          Who?
        </label>
        {rights.assign ? (
          <select id={`who-${stageId}`} name="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
            <option value="">{defaultPerson ? `${defaultPerson} (default)` : `Anyone in ${STAGE_META[target].label}`}</option>
            {teamPeople
              .filter((p) => p.name !== defaultPerson)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        ) : (
          <div className="flex h-[38px] items-center gap-2 rounded-lg bg-canvas px-3 text-[13.5px] font-medium" id={`who-${stageId}`}>
            {defaultPerson ? (
              <>
                <Avatar name={defaultPerson} size={20} badge={false} /> {defaultPerson}
              </>
            ) : (
              `The ${STAGE_META[target].label} team`
            )}
          </div>
        )}
      </div>
      {(rights.deadline || existingDeadline) && (
        <div className="w-[170px]">
          <label className="label" htmlFor={`dl-${stageId}`}>
            Deadline {!existingDeadline && <span className="font-normal text-muted">(optional)</span>}
          </label>
          {existingDeadline ? (
            <div className="flex h-[38px] items-center gap-1.5 rounded-lg bg-canvas px-3 text-[13.5px] font-medium" title="Deadlines can't be changed once set">
              <Lock className="size-3.5 text-muted" /> {formatDay(existingDeadline)}
            </div>
          ) : (
            <input id={`dl-${stageId}`} type="date" name="deadline" className="field" />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Item page: the panel for whoever's turn it is                          */
/* ------------------------------------------------------------------ */

export function HandOffPanel({ item, stageId, from, people, rights }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[]; rights: Rights }) {
  if (from === "shooting") return <ShootPanel item={item} stageId={stageId} people={people} rights={rights} />;
  return <SendOnPanel item={item} stageId={stageId} from={from} people={people} rights={rights} />;
}

function SendOnPanel({ item, stageId, from, people, rights }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[]; rights: Rights }) {
  const context: WorkContext = item.context;
  const targets = handoffTargets(from, context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, stageId, targets));
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const existingDeadline = nextStage?.deadline ?? null;
  const defaultPerson = nextStage ? (nextStage.assignee?.name ?? null) : (item.defaults[target] ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  const hasCanva = !!item.canvaLink;

  return (
    <ActionForm action={handOffAction} className="space-y-4">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
      {from === "content" && (
        <div>
          <label className="label" htmlFor={`canva-${stageId}`}>
            {hasCanva ? "This slide's own Canva link (optional — the month's link is used otherwise)" : "Canva link to this content"}
          </label>
          <input id={`canva-${stageId}`} name="canvaUrl" defaultValue={item.canvaUrl ?? ""} placeholder="https://canva.link/…" className="field" required={!hasCanva} />
        </div>
      )}
      {targets.length > 1 && (
        <div>
          <div className="label">Send it to</div>
          <TargetChips
            targets={targets}
            value={target}
            onChange={(t) => {
              setTarget(t);
              setAssigneeId("");
            }}
            big
          />
        </div>
      )}
      <WhoAndWhen
        stageId={stageId}
        target={target}
        people={people}
        existingDeadline={existingDeadline}
        assigneeId={assigneeId}
        setAssigneeId={setAssigneeId}
        rights={rights}
        defaultPerson={defaultPerson}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit size="lg">
          <Check className="size-4" strokeWidth={3} /> Done — send to {assigneeName || defaultPerson || STAGE_META[target].label}
          <ArrowRight className="size-4" />
        </Submit>
        <span className="text-[12.5px] text-muted">Your name and the time are saved automatically.</span>
      </div>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Pre-production: plan the shoot, then send it to editing                */
/* ------------------------------------------------------------------ */

function ShootForm({ item, compact }: { item: HandItem; compact?: boolean }) {
  return (
    <ActionForm action={shootAction} className={clsx("grid items-end gap-2", compact ? "grid-cols-2 sm:grid-cols-[150px_110px_130px_1fr_auto]" : "sm:grid-cols-[170px_120px_150px_1fr_auto]")}>
      <input type="hidden" name="itemId" value={item.id} />
      <div>
        <label className="label" htmlFor={`sd-${item.id}`}>
          Shoot day
        </label>
        <input id={`sd-${item.id}`} type="date" name="shootDate" defaultValue={item.shoot.date ?? ""} className="field" required />
      </div>
      <div>
        <label className="label" htmlFor={`st-${item.id}`}>
          Time
        </label>
        <input id={`st-${item.id}`} type="time" name="shootTime" defaultValue={item.shoot.time ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor={`su-${item.id}`}>
          How long
        </label>
        <select id={`su-${item.id}`} name="shootDuration" defaultValue={item.shoot.duration ?? ""} className="field">
          <option value="">—</option>
          {["30 min", "1 hour", "2 hours", "3 hours", "4 hours", "Half day", "Full day"].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className={compact ? "col-span-2 sm:col-span-1" : ""}>
        <label className="label" htmlFor={`sl-${item.id}`}>
          Where <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id={`sl-${item.id}`} name="shootLocation" defaultValue={item.shoot.location ?? ""} placeholder="Studio, client's place…" className="field" />
      </div>
      <Submit variant="secondary">{item.shoot.date ? "Update" : "Save shoot"}</Submit>
    </ActionForm>
  );
}

export function ShootSummary({ shoot, className }: { shoot: WorkItem["shoot"]; className?: string }) {
  if (!shoot.date) return null;
  return (
    <span className={clsx("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-[#fff4e5] px-2.5 py-1 text-[12.5px] font-medium text-[#9a4d00]", className)}>
      <Camera className="size-3.5" /> Shoot {formatDay(shoot.date)}
      {shoot.time && ` · ${shoot.time}`}
      {shoot.duration && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {shoot.duration}
        </span>
      )}
      {shoot.location && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" /> {shoot.location}
        </span>
      )}
    </span>
  );
}

function ShootPanel({ item, stageId, people, rights, compact }: { item: HandItem; stageId: string; people: PickPerson[]; rights: Rights; compact?: boolean }) {
  const [assigneeId, setAssigneeId] = useState("");
  const [more, setMore] = useState(false);
  const editing = item.stages.find((s) => s.kind === "media");
  const defaultPerson = editing ? (editing.assignee?.name ?? null) : (item.defaults.media ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  return (
    <div className="space-y-3">
      <ShootForm item={item} compact={compact} />
      <ActionForm action={handOffAction} className="space-y-3 border-t border-dashed border-line pt-3">
        <input type="hidden" name="stageId" value={stageId} />
        <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
        <div className="flex flex-wrap items-center gap-2">
          <Submit variant="primary">
            <Check className="size-4" strokeWidth={3} /> Shooting done — send to {assigneeName || defaultPerson || "Editing"} <ArrowRight className="size-4" />
          </Submit>
          {(rights.assign || rights.deadline) && (
            <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
              {rights.assign ? "Choose editor" : ""}
              {rights.assign && rights.deadline ? " & " : ""}
              {rights.deadline ? "deadline" : ""} <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
            </button>
          )}
        </div>
        {more && (
          <WhoAndWhen
            stageId={stageId}
            target="media"
            people={people}
            existingDeadline={editing?.deadline ?? null}
            assigneeId={assigneeId}
            setAssigneeId={setAssigneeId}
            rights={rights}
            defaultPerson={defaultPerson}
          />
        )}
      </ActionForm>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Post-production & design: v1, v2… sent for approval                    */
/* ------------------------------------------------------------------ */

const VERSION_TONE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting approval", cls: "bg-warn-soft text-[#9a5b00]" },
  approved: { label: "Approved", cls: "bg-ok-soft text-ok" },
  changes: { label: "Changes requested", cls: "bg-back-soft text-back" },
  replaced: { label: "Replaced", cls: "bg-canvas text-muted" },
};

function VersionRow({ v }: { v: VersionView }) {
  const tone = VERSION_TONE[v.status] ?? VERSION_TONE.replaced;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <span className={clsx("mt-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold", v.status === "approved" ? "bg-ok text-white" : "bg-navy-900 text-white")}>v{v.number}</span>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-electric hover:underline">
            Open file <ExternalLink className="size-3" />
          </a>
          <span className="text-muted">
            by {v.submittedBy?.name ?? "—"} · {formatDateTime(v.submittedAt)}
          </span>
          <span className={clsx("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", tone.cls)}>{tone.label}</span>
        </div>
        {v.note && <div className="mt-0.5 text-ink-2">&ldquo;{v.note}&rdquo;</div>}
        {v.reviewedAt && (
          <div className={clsx("mt-0.5", v.status === "changes" ? "text-back" : "text-muted")}>
            {v.status === "approved" ? "Approved" : "Changes asked"} by {v.reviewedBy?.name} · {formatRelative(v.reviewedAt)}
            {v.reviewNote && <>: &ldquo;{v.reviewNote}&rdquo;</>}
          </div>
        )}
      </div>
    </li>
  );
}

function ReviewButtons({ v, next, compact }: { v: VersionView; next: string; compact?: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ActionForm action={reviewVersionAction} inlineError={false}>
          <input type="hidden" name="versionId" value={v.id} />
          <input type="hidden" name="decision" value="approve" />
          <Submit variant="success" size={compact ? "md" : "lg"}>
            <ThumbsUp className="size-4" /> Approve v{v.number} — send to {next}
          </Submit>
        </ActionForm>
        <button type="button" onClick={() => setAsking((a) => !a)} className={btn("secondary", compact ? "md" : "lg")}>
          <MessageSquareWarning className="size-4 text-back" /> Request changes
        </button>
      </div>
      {asking && (
        <ActionForm action={reviewVersionAction} onSuccess={() => setAsking(false)} className="space-y-2 rounded-xl border border-back/30 bg-back-soft/40 p-3">
          <input type="hidden" name="versionId" value={v.id} />
          <input type="hidden" name="decision" value="changes" />
          <label className="label" htmlFor={`rn-${v.id}`}>
            What should change in v{v.number}?
          </label>
          <textarea id={`rn-${v.id}`} name="note" required rows={2} placeholder="e.g. Cut the first 3 seconds and make the logo bigger" className="field resize-y" />
          <Submit variant="primary" className="!bg-back hover:!bg-[#c9560c]">
            Send back — ask for v{v.number + 1}
          </Submit>
        </ActionForm>
      )}
    </div>
  );
}

export function VersionPanel({
  item,
  stage,
  canDo,
  canReview,
  compact,
  readOnly,
}: {
  item: HandItem;
  stage: Pick<StageView, "id" | "kind">;
  canDo: boolean;
  canReview: boolean;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const list = item.versions.filter((v) => v.kind === stage.kind);
  const latest = list.at(-1);
  const pending = latest?.status === "pending" ? latest : null;
  const nextNumber = (latest?.number ?? 0) + 1;
  const final = item.context === "plan" ? "Social" : "Delivery";
  const nextStage = item.stages.find((s) => s.kind === (item.context === "plan" ? "social" : "delivery"));
  const nextName = nextStage?.assignee?.name ?? final;
  const what = stage.kind === "media" ? "video" : "design";
  const [showAll, setShowAll] = useState(false);
  const shown = compact && !showAll ? list.slice(-1) : list;
  return (
    <div className="space-y-3">
      {list.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            {!readOnly && (
              <div className="label mb-0 inline-flex items-center gap-1.5">
                <Layers className="size-3.5" /> Versions
              </div>
            )}
            {compact && list.length > 1 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-[12px] font-medium text-electric">
                {showAll ? "Show latest only" : `Show all ${list.length}`}
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {shown.map((v) => (
              <VersionRow key={v.id} v={v} />
            ))}
          </ul>
        </div>
      )}
      {pending && canReview && <ReviewButtons v={pending} next={nextName} compact={compact} />}
      {pending && !canReview && canDo && (
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Clock className="size-3.5 text-warn" /> v{pending.number} is waiting for approval. You&rsquo;ll get a notification — you can still send a newer version below.
        </p>
      )}
      {canDo && (
        <ActionForm action={submitVersionAction} resetOnSuccess className="space-y-2">
          <input type="hidden" name="stageId" value={stage.id} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`vu-${stage.id}`}>
              Google Drive link to v{nextNumber}
            </label>
            <input
              id={`vu-${stage.id}`}
              name="url"
              required
              placeholder={`Paste the Google Drive link to v${nextNumber} of the ${what}`}
              className="field min-w-[240px] flex-1"
            />
            <Submit variant={pending ? "secondary" : "primary"}>
              <Send className="size-4" /> Send v{nextNumber} for approval
            </Submit>
          </div>
          {!compact && <input name="note" placeholder="Note for the reviewer (optional) — e.g. “fixed the colours”" className="field" />}
        </ActionForm>
      )}
      {!readOnly && !canDo && !canReview && !pending && <p className="text-[13px] text-muted">The {STAGE_META[stage.kind].label} team is working on it.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                   */
/* ------------------------------------------------------------------ */

export function TakeButton({ stageId, userId, size = "md" }: { stageId: string; userId: string; size?: "sm" | "md" }) {
  return (
    <ActionForm action={assignAction} inlineError={false} toast={false}>
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="userId" value={userId} />
      <Submit variant="secondary" size={size} title="Reserve it so your team knows you're on it">
        <Hand className="size-4" /> I&rsquo;ll take it
      </Submit>
    </ActionForm>
  );
}

export function DeliverButton({ stageId }: { stageId: string }) {
  return (
    <ActionForm action={completeStageAction} inlineError={false}>
      <input type="hidden" name="stageId" value={stageId} />
      <Submit variant="success">
        <Truck className="size-4" /> Mark as delivered
      </Submit>
    </ActionForm>
  );
}

/** Where the person is with their step — the same statuses as the old tracker. One click saves. */
export function ProgressPicker({ stage, size = "md" }: { stage: Pick<StageView, "id" | "progress" | "progressAt">; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-0.5" role="radiogroup" aria-label="Status">
        {PROGRESS_STEPS.map((p) => (
          <ActionForm key={p.key} action={progressAction} inlineError={false} toast={false}>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="progress" value={p.key} />
            <button
              type="submit"
              role="radio"
              aria-checked={stage.progress === p.key}
              className={clsx(
                "cursor-pointer rounded-[9px] font-medium transition-colors duration-150",
                size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
                stage.progress === p.key
                  ? p.key === "adjusting"
                    ? "bg-back text-white"
                    : p.key === "waiting_approval"
                      ? "bg-warn text-white"
                      : p.key === "processing"
                        ? "bg-electric text-white"
                        : "bg-navy-900 text-white"
                  : "text-muted hover:bg-canvas hover:text-ink",
              )}
            >
              {p.label}
            </button>
          </ActionForm>
        ))}
      </div>
      {stage.progressAt && stage.progress !== "not_started" && <span className="text-[12px] text-muted">since {formatRelative(stage.progressAt)}</span>}
    </div>
  );
}

/** "Content ✓ 22 Sep 18:00 · King" — the delivery times, recorded automatically. */
export function DeliveryTimes({ item, className }: { item: Pick<WorkItem, "stages">; className?: string }) {
  const done = item.stages.filter((s) => s.status === "done" && s.completedAt);
  if (!done.length) return null;
  return (
    <div className={clsx("flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted", className)}>
      {done.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1" title={`${STAGE_META[s.kind].label} delivered ${formatDateTime(s.completedAt)}`}>
          <CheckCircle2 className="size-3.5 text-ok" />
          <span className="font-medium text-ink-2">{STAGE_META[s.kind].short}</span> {formatDateTime(s.completedAt)} · {s.assignee?.name ?? s.completedBy?.name}
        </span>
      ))}
    </div>
  );
}

/** "Posts in 36 hours" — for work that must move now. */
export function HotBadge({ item, today }: { item: Pick<WorkItem, "postingDate" | "postingTime" | "current" | "hot">; today: string }) {
  if (!item.hot) return null;
  const late = item.current?.health === "overdue";
  const soon = addDaysISO(today, 2);
  const d = item.postingDate && item.postingDate <= soon ? item.postingDate : null;
  const dl = item.current?.deadline ?? null;
  const label = d
    ? d < today
      ? "Posting date passed"
      : d === today
        ? `Posts TODAY${item.postingTime ? ` ${item.postingTime}` : ""}`
        : `Posts ${formatDay(d, { weekday: true })}`
    : late
      ? `Late · was due ${formatDay(dl)}`
      : dl === today
        ? "Step due TODAY"
        : `Step due ${formatDay(dl)}`;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", late || (d && d <= today) ? "bg-bad text-white" : "bg-[#ff8a1f] text-white")}>
      <Flame className="size-3.5" /> {label}
    </span>
  );
}

function addDaysISO(iso: string, n: number) {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Task card (My tasks): everything needed to finish, in one place        */
/* ------------------------------------------------------------------ */

export function TaskCard({
  item,
  meId,
  people,
  rights,
  today,
  mode = "do",
}: {
  item: WorkItem;
  meId: string;
  people: PickPerson[];
  rights: Rights;
  today: string;
  /** "review": the card is shown to someone who has to approve a version. */
  mode?: "do" | "review";
}) {
  const cur = item.current!;
  const prev = item.stages.filter((s) => s.position < cur.position && s.status === "done").at(-1);
  const from = prev ? (prev.assignee?.name ?? prev.completedBy?.name) : null;
  const where = item.brand ? item.brand.name : item.project ? `${item.project.clientName} · ${item.project.name}` : "";
  const late = cur.health === "overdue";
  const returned = cur.round > 1 && !!cur.returnedAt;
  const unclaimed = !cur.assignee && mode === "do";
  const working = mode === "do" && (cur.kind === "media" || cur.kind === "design" || cur.kind === "content" || cur.kind === "shooting");

  return (
    <article
      className={clsx(
        "card overflow-hidden transition-shadow duration-150 hover:shadow-pop",
        late ? "border-bad/50" : item.hot ? "border-[#ff8a1f]/60 ring-2 ring-[#ff8a1f]/15" : returned && "border-back/50",
      )}
    >
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold hover:text-electric">
              <TypeIcon type={item.type} />
              <span className="truncate">{item.title}</span>
            </Link>
            {item.slideNumber && <span className="rounded-md bg-[#f1e8fd] px-1.5 py-0.5 text-[11.5px] font-bold text-[#6d28d9]">Slide {item.slideNumber}</span>}
            <HotBadge item={item} today={today} />
            {unclaimed && <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW for your team</span>}
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{STAGE_META[cur.kind].label}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
            {item.brand && <BrandDot color={item.brand.color} />}
            <span className="font-medium text-ink-2">{where}</span>
            <span>· {TYPE_META[item.type].label}</span>
            {item.postingDate && <span>· posting {formatDay(item.postingDate)}</span>}
            {from && cur.activatedAt && (
              <span>
                · from {from}, {formatRelative(cur.activatedAt)}
              </span>
            )}
          </div>
        </div>
        {cur.deadline && (
          <span className={clsx("whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold", late ? "bg-bad text-white" : "bg-canvas text-ink-2")}>
            {late ? "LATE · was due" : "Due"} {formatDay(cur.deadline)}
          </span>
        )}
      </div>

      {returned && mode === "do" && (
        <div className="mx-4 mt-2.5 rounded-lg bg-back-soft px-3 py-2 text-[13px] text-ink">
          <b className="text-back">Sent back by {cur.returnedBy?.name ?? "someone"}</b>
          {cur.returnNote ? <>: &ldquo;{cur.returnNote}&rdquo;</> : " — check the comments."}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 px-4">
        {item.canvaLink && (
          <a href={item.canvaLink} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <Palette className="size-3.5 text-[#7d2ae8]" /> {item.slideNumber && !item.canvaUrl ? `Open Canva · slide ${item.slideNumber}` : "Open Canva"} <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        {item.driveUrl && cur.kind !== "media" && cur.kind !== "design" && (
          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <FolderOpen className="size-3.5 text-[#1a73e8]" /> Final file <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        {(cur.kind === "media" || cur.kind === "design") && item.driveFolderUrl && mode === "do" && (
          <a href={item.driveFolderUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <FolderUp className="size-3.5 text-[#1a73e8]" /> Upload folder <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        <ShootSummary shoot={item.shoot} />
        <Link href={`/items/${item.id}`} className={btn("ghost", "sm")}>
          Details & comments
        </Link>
        {unclaimed && <TakeButton stageId={cur.id} userId={meId} size="sm" />}
      </div>

      <DeliveryTimes item={item} className="mt-2.5 px-4" />

      {working && (
        <div className="mt-3 px-4">
          <ProgressPicker stage={cur} size="sm" />
        </div>
      )}

      <div className="mt-3 border-t border-line bg-[#fafbfe] px-4 py-3.5">
        {mode === "review" ? (
          <VersionPanel item={item} stage={cur} canDo={false} canReview compact />
        ) : (
          <QuickAction item={item} people={people} rights={rights} />
        )}
      </div>
    </article>
  );
}

function QuickAction({ item, people, rights }: { item: WorkItem; people: PickPerson[]; rights: Rights }) {
  const cur = item.current!;
  if (cur.kind === "content") return <ContentQuick item={item} people={people} rights={rights} />;
  if (cur.kind === "shooting") return <ShootPanel item={item} stageId={cur.id} people={people} rights={rights} compact />;
  if (cur.kind === "media" || cur.kind === "design") return <VersionPanel item={item} stage={cur} canDo canReview={rights.review} compact />;
  if (cur.kind === "delivery") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <DeliverButton stageId={cur.id} /> once the files are with the client.
      </div>
    );
  }
  // Social: one field per planned platform — pasting the live link publishes it.
  const targeted = item.platforms.filter((p) => p.status === "pending" || p.status === "scheduled");
  const live = item.platforms.filter((p) => p.status === "published");
  if (!targeted.length) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <Link href={`/items/${item.id}`} className={btn("primary")}>
          <Send className="size-4" /> Choose platforms & publish
        </Link>
        {item.driveUrl && (
          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary")}>
            <FolderOpen className="size-4 text-[#1a73e8]" /> Final file
          </a>
        )}
        {live.length > 0 && <span>Live on {live.map((p) => p.name).join(", ")}</span>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {targeted.map((p) => (
        <ActionForm key={p.platformId} action={platformAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="platformId" value={p.platformId} />
          <span className="w-[92px] text-[13px] font-semibold">{p.name}</span>
          <input name="liveUrl" required placeholder={`Paste the ${p.name} post link once it's live`} className="field field-sm h-9 min-w-[220px] flex-1" />
          <Submit size="sm" variant="primary">
            <Check className="size-3.5" strokeWidth={3} /> Published
          </Submit>
        </ActionForm>
      ))}
      {live.length > 0 && <div className="text-[12.5px] text-ok">Already live on {live.map((p) => p.name).join(", ")}</div>}
    </div>
  );
}

function ContentQuick({ item, people, rights }: { item: WorkItem; people: PickPerson[]; rights: Rights }) {
  const cur = item.current!;
  const targets = handoffTargets("content", item.context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, cur.id, targets));
  const [more, setMore] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const defaultPerson = nextStage ? (nextStage.assignee?.name ?? null) : (item.defaults[target] ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  const hasCanva = !!item.canvaLink;
  return (
    <ActionForm action={handOffAction} className="space-y-3">
      <input type="hidden" name="stageId" value={cur.id} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
      <div className="flex flex-wrap items-center gap-2">
        {hasCanva ? (
          <span className="min-w-[200px] flex-1 text-[13px] text-muted">
            {item.slideNumber && !item.canvaUrl ? `Written on slide ${item.slideNumber} of the month's Canva?` : "Script ready in Canva?"} Send it on:
          </span>
        ) : (
          <>
            <label className="sr-only" htmlFor={`qc-${cur.id}`}>
              Canva link
            </label>
            <input id={`qc-${cur.id}`} name="canvaUrl" required placeholder="Paste the Canva link (or add the month's Canva link on the brand page)" className="field min-w-[240px] flex-1" />
          </>
        )}
        <Submit variant="primary">
          Content ready — send to {assigneeName || defaultPerson || STAGE_META[target].label} <ArrowRight className="size-4" />
        </Submit>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-[520px]">
          <TargetChips
            targets={targets}
            value={target}
            onChange={(t) => {
              setTarget(t);
              setAssigneeId("");
            }}
          />
        </div>
        {(rights.assign || rights.deadline) && (
          <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
            {rights.assign ? "Choose person" : ""}
            {rights.assign && rights.deadline ? " & " : ""}
            {rights.deadline ? "deadline" : ""} <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
          </button>
        )}
      </div>
      {more && (
        <WhoAndWhen
          stageId={cur.id}
          target={target}
          people={people}
          existingDeadline={nextStage?.deadline ?? null}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          rights={rights}
          defaultPerson={defaultPerson}
        />
      )}
    </ActionForm>
  );
}
