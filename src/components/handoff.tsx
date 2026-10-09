"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  CalendarDays,
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
  PenTool,
  Plus,
  Send,
  ThumbsUp,
  Truck,
  X,
} from "lucide-react";
import { assignAction, completeStageAction, handOffAction, platformAction, progressAction, reviewVersionAction, shootAction, submitVersionAction } from "@/app/actions";
import type { PlatformStatus, StageKind } from "@/db/schema";
import { PICKABLE_PROGRESS, PROGRESS_META, STAGE_META, TYPE_META, handoffTargets, isNewWork, type WorkContext } from "@/domain/workflow";
import { formatDateTime, formatDay, formatRelative, todayISO } from "@/lib/dates";
import { linkInfo, openLabel } from "@/lib/links";
import type { StageView, VersionView, WorkItem } from "@/server/queries";
import { ActionForm, Submit } from "./client";
import { BrandDot, ExtraBadge, ProgressChip, StageChip, TimeSpent, TypeIcon, btn } from "./ui";
import { DateInput } from "./date-input";
import { PlatformIcon } from "./platform-icon";
import { SendBack } from "./send-back";
import { backTargetsOf } from "@/domain/back-targets";
import { Attachments, type AttachmentItem } from "./attachments";

export type PickPerson = { id: string; name: string; teams: string[] };

/** What each person may do on a card — decided on the server, passed down. */
export type Rights = { deadline: boolean; assign: boolean; review: boolean };

const TARGET_INFO: Partial<Record<StageKind, { icon: typeof Send; hint: string; short: string }>> = {
  shooting: { icon: Camera, hint: "Shoot, then edit", short: "Shooting" },
  media: { icon: Clapperboard, hint: "Editing", short: "Editing" },
  design: { icon: PenTool, hint: "Posts & carousels", short: "Design" },
  social: { icon: Send, hint: "Ready: publish it", short: "Social" },
  delivery: { icon: Truck, hint: "Send to the client", short: "Delivery" },
};

type HandItem = Pick<WorkItem, "id" | "type" | "context" | "driveUrl" | "canvaUrl" | "canvaLink" | "stages" | "versions" | "shoot" | "title" | "defaults" | "slideNumber">;

function defaultTarget(item: HandItem, stageId: string, targets: StageKind[]): StageKind {
  const pos = item.stages.find((x) => x.id === stageId)?.position ?? 0;
  const routeNext = item.stages.find((s) => s.position > pos)?.kind;
  return routeNext && targets.includes(routeNext) ? routeNext : targets[0];
}

function TargetChips({ targets, value, onChange, big }: { targets: StageKind[]; value: StageKind; onChange: (t: StageKind) => void; big?: boolean }) {
  return (
    <div className={clsx("grid gap-2", targets.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-label="Send to">
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

/** Who gets it next (anyone may pick a teammate of that step or themselves; managers anyone) and the deadline (managers). */
function WhoAndWhen({
  stageId,
  target,
  people,
  meId,
  existingDeadline,
  assigneeId,
  setAssigneeId,
  rights,
  defaultPerson,
}: {
  stageId: string;
  target: StageKind;
  people: PickPerson[];
  meId: string;
  existingDeadline: string | null;
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  rights: Rights;
  defaultPerson: string | null;
}) {
  const team = STAGE_META[target]?.team;
  const teamPeople = people.filter((p) => team && p.teams.includes(team) && p.name !== defaultPerson && p.id !== meId);
  const others = rights.assign ? people.filter((p) => !teamPeople.includes(p) && p.name !== defaultPerson && p.id !== meId) : [];
  const me = people.find((p) => p.id === meId);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor={`who-${stageId}`}>
          Who works on it?
        </label>
        <select id={`who-${stageId}`} name="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
          <option value="">{defaultPerson ? `${defaultPerson} (usual person)` : `Anyone in ${STAGE_META[target].label}`}</option>
          {me && me.name !== defaultPerson && <option value={me.id}>Me, I&rsquo;ll do it</option>}
          {teamPeople.length > 0 && (
            <optgroup label={`${STAGE_META[target].label} team`}>
              {teamPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Everyone else">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
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
            <DateInput id={`dl-${stageId}`} name="deadline" className="w-full" />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Item page: the panel for whoever's turn it is                          */
/* ------------------------------------------------------------------ */

export function HandOffPanel({ item, stageId, from, people, rights, meId }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[]; rights: Rights; meId: string }) {
  if (from === "shooting") return <ShootPanel item={item} stageId={stageId} people={people} rights={rights} meId={meId} />;
  return <SendOnPanel item={item} stageId={stageId} from={from} people={people} rights={rights} meId={meId} />;
}

/** The content link field: any link (Canva, a Google Doc, Drive…), optional. */
function ContentLinkField({ item, id, compact }: { item: HandItem; id: string; compact?: boolean }) {
  const fromMonth = !!item.canvaLink && !item.canvaUrl;
  return (
    <div className={compact ? "min-w-[220px] flex-1" : ""}>
      {!compact && (
        <label className="label" htmlFor={id}>
          Content link <span className="font-normal text-muted">(optional · Canva, Google Doc, Drive…)</span>
        </label>
      )}
      <input
        id={id}
        name="canvaUrl"
        defaultValue={item.canvaUrl ?? ""}
        aria-label="Content link (optional)"
        placeholder={fromMonth ? `Uses the month's Canva${item.slideNumber ? ` · slide ${item.slideNumber}` : ""} (or paste another link)` : "Paste the content link (optional)"}
        className="field"
      />
    </div>
  );
}

function SendOnPanel({ item, stageId, from, people, rights, meId }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[]; rights: Rights; meId: string }) {
  const context: WorkContext = item.context;
  const targets = handoffTargets(from, context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, stageId, targets));
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const existingDeadline = nextStage?.deadline ?? null;
  const defaultPerson = nextStage ? (nextStage.assignee?.name ?? null) : (item.defaults[target] ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  const final = target === "social" || target === "delivery";

  return (
    <ActionForm action={handOffAction} className="space-y-4">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
      {from === "content" && <ContentLinkField item={item} id={`canva-${stageId}`} />}
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
      {final && from === "content" && (
        <div>
          <label className="label" htmlFor={`final-${stageId}`}>
            Final file <span className="font-normal text-muted">(optional · the ready post or video on Drive)</span>
          </label>
          <input id={`final-${stageId}`} name="driveUrl" defaultValue={item.driveUrl ?? ""} placeholder="https://drive.google.com/…" className="field" />
        </div>
      )}
      <WhoAndWhen
        stageId={stageId}
        target={target}
        people={people}
        meId={meId}
        existingDeadline={existingDeadline}
        assigneeId={assigneeId}
        setAssigneeId={setAssigneeId}
        rights={rights}
        defaultPerson={defaultPerson}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit size="lg">
          <Check className="size-4" strokeWidth={3} /> Done, send to {assigneeName || defaultPerson || STAGE_META[target].label}
          <ArrowRight className="size-4" />
        </Submit>
        <span className="text-[12.5px] text-muted">Your name and the time are saved automatically.</span>
      </div>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Pre-production: plan the shoot, then send it on                        */
/* ------------------------------------------------------------------ */

function ShootForm({ item, compact }: { item: HandItem; compact?: boolean }) {
  return (
    <ActionForm action={shootAction} className={clsx("grid items-end gap-2", compact ? "grid-cols-2 sm:grid-cols-[150px_110px_130px_1fr_auto]" : "sm:grid-cols-[170px_120px_150px_1fr_auto]")}>
      <input type="hidden" name="itemId" value={item.id} />
      <div>
        <label className="label" htmlFor={`sd-${item.id}`}>
          Shoot day
        </label>
        <DateInput id={`sd-${item.id}`} name="shootDate" defaultValue={item.shoot.date ?? ""} className="w-full" required />
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
    <span className={clsx("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-[#fdf0f6] px-2.5 py-1 text-[12.5px] font-medium text-[#a1355f]", className)}>
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

function ShootPanel({ item, stageId, people, rights, meId, compact }: { item: HandItem; stageId: string; people: PickPerson[]; rights: Rights; meId: string; compact?: boolean }) {
  const targets = handoffTargets("shooting", item.context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, stageId, targets));
  const [assigneeId, setAssigneeId] = useState("");
  const [more, setMore] = useState(false);
  const next = item.stages.find((s) => s.kind === target);
  const defaultPerson = next ? (next.assignee?.name ?? null) : (item.defaults[target] ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  return (
    <div className="space-y-3">
      <ShootForm item={item} compact={compact} />
      <ActionForm action={handOffAction} className="space-y-3 border-t border-dashed border-line pt-3">
        <input type="hidden" name="stageId" value={stageId} />
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
        <div className="flex flex-wrap items-center gap-2">
          <Submit variant="primary">
            <Check className="size-4" strokeWidth={3} /> Shooting done, send to {assigneeName || defaultPerson || STAGE_META[target].short} <ArrowRight className="size-4" />
          </Submit>
          <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
            Another step or person <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
          </button>
        </div>
        {more && (
          <div className="space-y-3">
            <div className="max-w-[460px]">
              <TargetChips
                targets={targets}
                value={target}
                onChange={(t) => {
                  setTarget(t);
                  setAssigneeId("");
                }}
              />
            </div>
            <WhoAndWhen
              stageId={stageId}
              target={target}
              people={people}
              meId={meId}
              existingDeadline={next?.deadline ?? null}
              assigneeId={assigneeId}
              setAssigneeId={setAssigneeId}
              rights={rights}
              defaultPerson={defaultPerson}
            />
          </div>
        )}
      </ActionForm>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Post-production & design: v1, v2… (with options) sent for approval     */
/* ------------------------------------------------------------------ */

const VERSION_TONE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting approval", cls: "bg-[#e3f5f3] text-[#0f766e]" },
  approved: { label: "Approved", cls: "bg-ok-soft text-ok" },
  changes: { label: "Changes requested", cls: "bg-back-soft text-back" },
  replaced: { label: "Replaced", cls: "bg-canvas text-muted" },
};

const letter = (i: number) => String.fromCharCode(65 + i);

function VersionRow({ v }: { v: VersionView }) {
  const tone = VERSION_TONE[v.status] ?? VERSION_TONE.replaced;
  const options = [v.url, ...v.altUrls];
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <span className={clsx("mt-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold", v.status === "approved" ? "bg-ok text-white" : "bg-navy-900 text-white")}>v{v.number}</span>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {options.length === 1 ? (
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-electric hover:underline">
              Open file <ExternalLink className="size-3" />
            </a>
          ) : (
            options.map((u, i) => (
              <a
                key={u}
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold hover:underline", v.chosenUrl === u ? "bg-ok-soft text-ok" : "text-electric")}
              >
                {v.chosenUrl === u && <Check className="size-3" strokeWidth={3} />}Option {letter(i)} <ExternalLink className="size-3" />
              </a>
            ))
          )}
          <span className="text-muted">
            by {v.submittedBy?.name ?? "—"} · {formatDateTime(v.submittedAt)}
          </span>
          <span className={clsx("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", tone.cls)}>{tone.label}</span>
        </div>
        {v.note && <div className="mt-0.5 text-ink-2">&ldquo;{v.note}&rdquo;</div>}
        {v.reviewedAt && (
          <div className={clsx("mt-0.5", v.status === "changes" ? "text-back" : "text-muted")}>
            {v.status === "approved" ? `Approved${v.chosenUrl && options.length > 1 ? ` option ${letter(options.indexOf(v.chosenUrl))}` : ""}` : "Changes asked"} by {v.reviewedBy?.name} · {formatRelative(v.reviewedAt)}
            {v.reviewNote && <>: &ldquo;{v.reviewNote}&rdquo;</>}
          </div>
        )}
      </div>
    </li>
  );
}

function ReviewButtons({ v, next, compact }: { v: VersionView; next: string; compact?: boolean }) {
  const [asking, setAsking] = useState(false);
  const options = [v.url, ...v.altUrls];
  const [chosen, setChosen] = useState(options.length > 1 ? "" : v.url);
  return (
    <div className="space-y-2.5">
      {options.length > 1 && (
        <div className="space-y-1.5">
          <div className="text-[13px] font-medium text-ink-2">{options.length} options sent. Pick the one to approve:</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {options.map((u, i) => (
              <label key={u} className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-[13.5px] transition-colors", chosen === u ? "border-ok bg-ok-soft/60" : "border-line bg-white hover:border-line-strong")}>
                <input type="radio" name={`opt-${v.id}`} checked={chosen === u} onChange={() => setChosen(u)} className="accent-[#0f9d6b]" />
                <span className="flex-1 font-semibold">Option {letter(i)}</span>
                <a href={u} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-electric hover:underline">
                  Open <ExternalLink className="size-3" />
                </a>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActionForm action={reviewVersionAction} inlineError={false}>
          <input type="hidden" name="versionId" value={v.id} />
          <input type="hidden" name="decision" value="approve" />
          <input type="hidden" name="chosenUrl" value={chosen} />
          <Submit variant="success" size={compact ? "md" : "lg"} disabled={!chosen}>
            <ThumbsUp className="size-4" /> Approve {options.length > 1 ? (chosen ? `option ${letter(options.indexOf(chosen))}` : "") : `v${v.number}`}, send to {next}
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
            Send back, ask for v{v.number + 1}
          </Submit>
        </ActionForm>
      )}
    </div>
  );
}

function SubmitVersionForm({ stageId, nextNumber, what, pending, compact }: { stageId: string; nextNumber: number; what: string; pending: boolean; compact?: boolean }) {
  const [extra, setExtra] = useState(0);
  return (
    <ActionForm action={submitVersionAction} resetOnSuccess onSuccess={() => setExtra(0)} className="space-y-2">
      <input type="hidden" name="stageId" value={stageId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`vu-${stageId}`}>
          Google Drive link to v{nextNumber}
        </label>
        <input id={`vu-${stageId}`} name="url" required placeholder={`Drive link to v${nextNumber} of the ${what}${extra ? " (option A)" : ""}`} className="field min-w-[240px] flex-1" />
        <Submit variant={pending ? "secondary" : "primary"}>
          <Send className="size-4" /> Send v{nextNumber} for approval
        </Submit>
      </div>
      {Array.from({ length: extra }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <input name="altUrl" required placeholder={`Drive link to option ${letter(i + 1)}`} aria-label={`Option ${letter(i + 1)} link`} className="field min-w-[240px] flex-1" />
          <button type="button" onClick={() => setExtra((n) => n - 1)} className="rounded-md p-1.5 text-faint hover:bg-canvas hover:text-ink" aria-label="Remove this option">
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {extra < 3 && (
          <button type="button" onClick={() => setExtra((n) => n + 1)} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-electric hover:bg-electric-soft">
            <Plus className="size-3.5" /> Another option for the same {what === "video" ? "video" : "post"}
          </button>
        )}
        <input name="note" placeholder={extra ? "Note: what's different between the options" : "Note for the reviewer (optional)"} className={clsx("field field-sm min-w-[200px] flex-1", compact && !extra && "hidden sm:block")} />
      </div>
    </ActionForm>
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
          <Clock className="size-3.5 text-[#0f766e]" /> v{pending.number} is waiting for approval. You&rsquo;ll get a notification. You can still send a newer version below.
        </p>
      )}
      {canDo && <SubmitVersionForm stageId={stage.id} nextNumber={nextNumber} what={what} pending={!!pending} compact={compact} />}
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
        <Hand className="size-4" /> I&rsquo;ll work on it
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

/**
 * Where the person is with their step. One tap saves; "Scheduled" asks for the day.
 * The clock runs while it's In progress or Adjusting and stops at Waiting approval.
 */
export function ProgressPicker({ stage, size = "md", showTime = true }: { stage: Pick<StageView, "id" | "progress" | "progressAt" | "scheduledFor" | "time">; size?: "sm" | "md"; showTime?: boolean }) {
  const [scheduling, setScheduling] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full flex-wrap rounded-xl border border-line bg-white p-0.5" role="radiogroup" aria-label="Status">
          {PICKABLE_PROGRESS.map((key) => {
            const m = PROGRESS_META[key];
            const on = stage.progress === key;
            const cls = clsx("cursor-pointer rounded-[9px] font-medium transition-colors duration-150", size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]", !on && "text-muted hover:bg-canvas hover:text-ink");
            const style = on ? { backgroundColor: m.bg, color: m.fg, boxShadow: `inset 0 0 0 1px ${m.dot}55` } : undefined;
            if (key === "scheduled")
              return (
                <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setScheduling((s) => !s)} className={cls} style={style}>
                  {on && stage.scheduledFor ? `Scheduled · ${formatDay(stage.scheduledFor)}` : m.label}
                </button>
              );
            return (
              <ActionForm key={key} action={progressAction} inlineError={false} toast={false}>
                <input type="hidden" name="stageId" value={stage.id} />
                <input type="hidden" name="progress" value={key} />
                <button type="submit" role="radio" aria-checked={on} className={cls} style={style}>
                  {m.label}
                </button>
              </ActionForm>
            );
          })}
        </div>
        {showTime && <TimeSpent ms={stage.time.ms} running={stage.time.running} />}
        {showTime && !stage.time.ms && stage.progressAt && stage.progress !== "not_started" && <span className="text-[12px] text-muted">since {formatRelative(stage.progressAt)}</span>}
      </div>
      {scheduling && <ScheduleForm stageId={stage.id} value={stage.scheduledFor} onDone={() => setScheduling(false)} />}
    </div>
  );
}

function ScheduleForm({ stageId, value, onDone, ack }: { stageId: string; value: string | null; onDone?: () => void; ack?: boolean }) {
  return (
    <ActionForm action={progressAction} onSuccess={onDone} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f6f1fe] px-3 py-2">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="progress" value="scheduled" />
      {ack && <input type="hidden" name="ack" value="1" />}
      <CalendarDays className="size-4 text-[#6d28d9]" />
      <span className="text-[13px] font-medium text-[#5b21b6]">I&rsquo;ll do it on</span>
      <DateInput name="scheduledFor" defaultValue={value ?? ""} min={todayISO()} required size="sm" className="w-[150px]" aria-label="Day you'll do it" />
      <Submit size="sm" variant="dark">
        Schedule
      </Submit>
    </ActionForm>
  );
}

/** "Changes requested": read what to change, then "On it" (Adjusting, the clock runs) or schedule it. */
export function ChangesBanner({ item, stage }: { item: Pick<WorkItem, "versions">; stage: Pick<StageView, "id" | "kind" | "progress" | "returnNote" | "returnedBy" | "returnedAt" | "scheduledFor"> }) {
  const [scheduling, setScheduling] = useState(false);
  if (stage.progress !== "changes_requested") return null;
  const v = item.versions.filter((x) => x.kind === stage.kind).at(-1);
  const fromVersion = v?.status === "changes" && (!stage.returnedAt || (v.reviewedAt && v.reviewedAt >= stage.returnedAt));
  const note = fromVersion ? v!.reviewNote : stage.returnNote;
  const by = fromVersion ? v!.reviewedBy?.name : stage.returnedBy?.name;
  const at = fromVersion ? v!.reviewedAt : stage.returnedAt;
  return (
    <div className="space-y-2.5 rounded-xl border border-[#fbd5bb] bg-[#fff6ef] px-3.5 py-3">
      <div className="text-[13.5px]">
        <b className="text-[#c2410c]">Changes requested{by ? ` by ${by}` : ""}</b>
        {at && <span className="text-muted"> · {formatRelative(at)}</span>}
        {note ? <div className="mt-1 text-ink">&ldquo;{note}&rdquo;</div> : <div className="mt-1 text-muted">See the comments for what to change.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActionForm action={progressAction} inlineError={false}>
          <input type="hidden" name="stageId" value={stage.id} />
          <input type="hidden" name="progress" value="adjusting" />
          <input type="hidden" name="ack" value="1" />
          <Submit size="sm" variant="primary">
            <Check className="size-3.5" strokeWidth={3} /> OK, I&rsquo;m on it
          </Submit>
        </ActionForm>
        <button type="button" onClick={() => setScheduling((s) => !s)} className={btn("secondary", "sm")}>
          <CalendarDays className="size-3.5 text-[#6d28d9]" /> Schedule it
        </button>
      </div>
      {scheduling && <ScheduleForm stageId={stage.id} value={stage.scheduledFor} ack onDone={() => setScheduling(false)} />}
    </div>
  );
}

/** "Content ✓ 22 Sep 18:00 · King" — the delivery times, recorded automatically (with the time worked). */
export function DeliveryTimes({ item, className }: { item: Pick<WorkItem, "stages">; className?: string }) {
  const done = item.stages.filter((s) => s.status === "done" && s.completedAt);
  if (!done.length) return null;
  return (
    <div className={clsx("flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted", className)}>
      {done.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1" title={`${STAGE_META[s.kind].label} delivered ${formatDateTime(s.completedAt)}`}>
          <CheckCircle2 className="size-3.5 text-ok" />
          <span className="font-medium text-ink-2">{STAGE_META[s.kind].short}</span> {formatDateTime(s.completedAt)} · {s.assignee?.name ?? s.completedBy?.name}
          {s.time.ms > 0 && <TimeSpent ms={s.time.ms} className="ml-0.5 !text-[11.5px] !font-normal text-muted" />}
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
/* Social: one row per app, with its icon and status                      */
/* ------------------------------------------------------------------ */

const PLATFORM_TONE: Record<PlatformStatus, { label: string; cls: string }> = {
  not_planned: { label: "Not planned", cls: "bg-canvas text-faint" },
  pending: { label: "To post", cls: "bg-[#f1f3f7] text-ink-2" },
  scheduled: { label: "Scheduled", cls: "bg-[#f3ecfe] text-[#6d28d9]" },
  published: { label: "Live", cls: "bg-ok-soft text-ok" },
  cancelled: { label: "Not posting", cls: "bg-canvas text-muted line-through" },
};

export function PlatformStatusPill({ status, date, time }: { status: PlatformStatus; date?: string | null; time?: string | null }) {
  const t = PLATFORM_TONE[status];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", t.cls)}>
      {status === "published" && <Check className="size-3" strokeWidth={3} />}
      {t.label}
      {(status === "scheduled" || status === "published") && date ? ` · ${formatDay(date)}${time ? ` ${time}` : ""}` : ""}
    </span>
  );
}

/** Esraa's step: each planned app with its icon. Paste the live link → Live; or pick a day → Scheduled. */
export function SocialPanel({ item, allPlatforms, canPublish = true }: { item: Pick<WorkItem, "id" | "platforms" | "driveUrl" | "canvaLink" | "canvaUrl">; allPlatforms?: { id: string; name: string }[]; canPublish?: boolean }) {
  const planned = item.platforms.filter((p) => p.status !== "not_planned");
  const missing = (allPlatforms ?? []).filter((p) => !item.platforms.some((x) => x.platformId === p.id && x.status !== "not_planned"));
  const live = planned.filter((p) => p.status === "published").length;
  const targeted = planned.filter((p) => p.status !== "cancelled").length;
  return (
    <div className="space-y-2.5">
      {(planned.length > 0 || item.driveUrl) && (
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          <span>{planned.length > 0 ? `${live}/${targeted} live` : ""}</span>
          {item.driveUrl && (
            <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-electric hover:underline">
              <FolderOpen className="size-3.5" /> Final file
            </a>
          )}
        </div>
      )}
      <ul className="space-y-1.5">
        {planned.map((p) => (
          <SocialRow key={p.platformId} itemId={item.id} p={p} canPublish={canPublish} />
        ))}
      </ul>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted">{planned.length ? "Add" : "Where does it go?"}</span>
          {missing.map((p) => (
            <ActionForm key={p.id} action={platformAction} inlineError={false} toast={false}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="platformId" value={p.id} />
              <input type="hidden" name="status" value="pending" />
              <button type="submit" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-1 pr-2.5 text-[12.5px] font-medium transition-colors hover:border-electric hover:bg-electric-soft">
                <PlatformIcon name={p.name} size={18} /> {p.name}
              </button>
            </ActionForm>
          ))}
        </div>
      )}
    </div>
  );
}

function SocialRow({ itemId, p, canPublish }: { itemId: string; p: WorkItem["platforms"][number]; canPublish: boolean }) {
  const [scheduling, setScheduling] = useState(false);
  const live = p.status === "published";
  const off = p.status === "cancelled";
  return (
    <li className={clsx("rounded-xl border px-2.5 py-2 transition-colors", live ? "border-ok/25 bg-ok-soft/40" : "border-line bg-white")}>
      <div className="flex flex-wrap items-center gap-2">
        <PlatformIcon name={p.name} size={26} muted={off} />
        <span className="w-[84px] truncate text-[13.5px] font-semibold">{p.name}</span>
        <PlatformStatusPill status={p.status} date={p.date} time={p.time} />
        {live && p.liveUrl ? (
          <a href={p.liveUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-ok hover:underline">
            Open post <ExternalLink className="size-3" />
          </a>
        ) : !off && canPublish ? (
          <ActionForm action={platformAction} className="flex min-w-[220px] flex-1 items-center gap-1.5">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="platformId" value={p.platformId} />
            <input name="liveUrl" required placeholder={`Paste the ${p.name} link once it's live`} aria-label={`${p.name} live link`} className="field field-sm h-8 min-w-0 flex-1" />
            <Submit size="sm" variant="primary">
              <Check className="size-3.5" strokeWidth={3} /> Live
            </Submit>
            <button type="button" onClick={() => setScheduling((s) => !s)} title="Schedule" aria-label={`Schedule ${p.name}`} className={clsx("rounded-md p-1.5 hover:bg-[#f3ecfe]", p.status === "scheduled" ? "text-[#6d28d9]" : "text-muted")}>
              <CalendarDays className="size-4" />
            </button>
          </ActionForm>
        ) : null}
      </div>
      {scheduling && !live && (
        <ActionForm action={platformAction} onSuccess={() => setScheduling(false)} className="mt-2 flex flex-wrap items-center gap-2 pl-[34px]">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="platformId" value={p.platformId} />
          <input type="hidden" name="status" value="scheduled" />
          <DateInput name="date" defaultValue={p.date ?? ""} required size="sm" className="w-[150px]" aria-label={`${p.name} day`} />
          <input type="time" name="time" defaultValue={p.time ?? ""} aria-label={`${p.name} time`} className="field field-sm h-8 w-[110px]" />
          <Submit size="sm" variant="dark">
            Schedule
          </Submit>
        </ActionForm>
      )}
    </li>
  );
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
  allPlatforms,
  attachments,
  manager,
}: {
  item: WorkItem;
  meId: string;
  people: PickPerson[];
  rights: Rights;
  today: string;
  /** "review": the card is shown to someone who has to approve a version. */
  mode?: "do" | "review";
  allPlatforms?: { id: string; name: string }[];
  attachments?: AttachmentItem[];
  manager?: boolean;
}) {
  const cur = item.current!;
  const prev = item.stages.filter((s) => s.position < cur.position && s.status === "done").at(-1);
  const from = prev ? (prev.assignee?.name ?? prev.completedBy?.name) : (item.extra?.by?.name ?? null);
  const fresh = mode === "do" && isNewWork(item);
  const where = item.brand ? item.brand.name : item.project ? `${item.project.clientName} · ${item.project.name}` : "";
  const late = cur.health === "overdue";
  const changes = cur.progress === "changes_requested";
  const returned = cur.round > 1 && !!cur.returnedAt && !changes;
  const unclaimed = !cur.assignee && mode === "do";
  const working = mode === "do" && (cur.kind === "media" || cur.kind === "design" || cur.kind === "content" || cur.kind === "shooting" || cur.kind === "social");
  const backTargets = mode === "do" ? backTargetsOf(item, cur) : [];

  return (
    <article
      // The brand's colour as a stripe on the left: you see whose work it is before reading.
      style={item.brand ? { boxShadow: `inset 3px 0 0 ${item.brand.color}` } : undefined}
      className={clsx(
        "card animate-rise overflow-hidden transition-[box-shadow,transform] duration-150 hover:shadow-pop",
        late ? "border-bad/40" : item.hot ? "border-[#ff8a1f]/50" : (changes || returned) && "border-back/40",
      )}
    >
      <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-1.5 text-[15.5px] font-semibold hover:text-electric">
              <TypeIcon type={item.type} />
              <span className="truncate">{item.title}</span>
            </Link>
            {item.slideNumber && <span className="rounded-md bg-[#f1e8fd] px-1.5 py-0.5 text-[11px] font-bold text-[#6d28d9]">Slide {item.slideNumber}</span>}
            <HotBadge item={item} today={today} />
            {unclaimed ? (
              <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW for your team</span>
            ) : (
              fresh && <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span>
            )}
            {item.extra && <ExtraBadge by={item.extra.by?.name} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
            {item.brand && <BrandDot color={item.brand.color} />}
            <span className="font-medium text-ink-2">{where}</span>
            <span>· {TYPE_META[item.type].label}</span>
            {item.postingDate && <span>· posting {formatDay(item.postingDate)}</span>}
            {cur.activatedAt && (
              <span>
                · arrived {formatRelative(cur.activatedAt)}
                {from && <> from {from}</>}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StageChip kind={cur.kind} />
            <ProgressChip progress={cur.progress} scheduledFor={cur.scheduledFor} running={cur.time.running} hideNotStarted />
            <TimeSpent ms={cur.time.ms} running={cur.time.running} />
          </div>
        </div>
        {cur.deadline && (
          <span className={clsx("whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold", late ? "bg-bad text-white" : "bg-canvas text-ink-2")}>
            {late ? "LATE · was due" : "Due"} {formatDay(cur.deadline)}
          </span>
        )}
      </div>

      {changes && mode === "do" && (
        <div className="mx-4 mt-3">
          <ChangesBanner item={item} stage={cur} />
        </div>
      )}
      {returned && mode === "do" && (
        <div className="mx-4 mt-2.5 rounded-lg bg-back-soft px-3 py-2 text-[13px] text-ink">
          <b className="text-back">Sent back by {cur.returnedBy?.name ?? "someone"}</b>
          {cur.returnNote ? <>: &ldquo;{cur.returnNote}&rdquo;</> : ", check the comments."}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 px-4">
        {item.canvaLink && (
          <a href={item.canvaLink} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <LinkGlyph url={item.canvaLink} /> {openLabel(item.canvaLink)}
            {item.slideNumber && !item.canvaUrl ? ` · slide ${item.slideNumber}` : ""} <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        {item.driveUrl && cur.kind !== "media" && cur.kind !== "design" && cur.kind !== "social" && (
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
        {backTargets.length > 0 && <SendBack itemId={item.id} targets={backTargets} people={people} meId={meId} manager={manager} size="sm" />}
      </div>

      {attachments && attachments.length > 0 && (
        <div className="mt-2.5 px-4">
          <Attachments items={attachments} itemId={item.id} meId={meId} manager={manager} canAdd={false} compact />
        </div>
      )}

      <DeliveryTimes item={item} className="mt-2.5 px-4" />

      {working && !changes && (
        <div className="mt-3 px-4">
          <ProgressPicker stage={cur} size="sm" showTime={false} />
        </div>
      )}

      <div className="mt-3 border-t border-line bg-[#fafbfe] px-4 py-3.5">
        {mode === "review" ? (
          <VersionPanel item={item} stage={cur} canDo={false} canReview compact />
        ) : (
          <QuickAction item={item} people={people} rights={rights} meId={meId} allPlatforms={allPlatforms} />
        )}
      </div>
    </article>
  );
}

/** A small mark for the kind of link (Canva, Google Doc, Drive…). */
export function LinkGlyph({ url }: { url: string }) {
  const k = linkInfo(url).kind;
  const color = k === "canva" ? "#7d2ae8" : k === "doc" ? "#1a73e8" : k === "sheet" ? "#188038" : k === "slides" ? "#f4b400" : k === "drive" ? "#1a73e8" : "#64748b";
  if (k === "drive") return <FolderOpen className="size-3.5" style={{ color }} />;
  return (
    <span aria-hidden className="inline-flex size-3.5 items-center justify-center rounded-[4px] text-[9px] font-black text-white" style={{ background: color }}>
      {k === "canva" ? "C" : k === "doc" ? "D" : k === "sheet" ? "S" : k === "slides" ? "P" : "↗"}
    </span>
  );
}

function QuickAction({ item, people, rights, meId, allPlatforms }: { item: WorkItem; people: PickPerson[]; rights: Rights; meId: string; allPlatforms?: { id: string; name: string }[] }) {
  const cur = item.current!;
  if (cur.kind === "content") return <ContentQuick item={item} people={people} rights={rights} meId={meId} />;
  if (cur.kind === "shooting") return <ShootPanel item={item} stageId={cur.id} people={people} rights={rights} meId={meId} compact />;
  if (cur.kind === "media" || cur.kind === "design") return <VersionPanel item={item} stage={cur} canDo canReview={rights.review} compact />;
  if (cur.kind === "delivery") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <DeliverButton stageId={cur.id} /> once the files are with the client.
      </div>
    );
  }
  return <SocialPanel item={item} allPlatforms={allPlatforms} />;
}

function ContentQuick({ item, people, rights, meId }: { item: WorkItem; people: PickPerson[]; rights: Rights; meId: string }) {
  const cur = item.current!;
  const targets = handoffTargets("content", item.context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, cur.id, targets));
  const [more, setMore] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const defaultPerson = nextStage ? (nextStage.assignee?.name ?? null) : (item.defaults[target] ?? null);
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  const final = target === "social" || target === "delivery";
  return (
    <ActionForm action={handOffAction} className="space-y-3">
      <input type="hidden" name="stageId" value={cur.id} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName || defaultPerson || ""} />
      <div className="w-full max-w-[560px]">
        <TargetChips
          targets={targets}
          value={target}
          onChange={(t) => {
            setTarget(t);
            setAssigneeId("");
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentLinkField item={item} id={`qc-${cur.id}`} compact />
        {final && <input name="driveUrl" defaultValue={item.driveUrl ?? ""} placeholder="Final file on Drive (optional)" aria-label="Final file link (optional)" className="field min-w-[200px] flex-1" />}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="primary">
          Content ready, send to {assigneeName || defaultPerson || STAGE_META[target].label} <ArrowRight className="size-4" />
        </Submit>
        <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
          {rights.deadline ? "Person & deadline" : "Choose the person"} <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
        </button>
      </div>
      {more && (
        <WhoAndWhen
          stageId={cur.id}
          target={target}
          people={people}
          meId={meId}
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
