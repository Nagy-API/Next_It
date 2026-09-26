"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, Check, CheckCircle2, ChevronDown, Clapperboard, ExternalLink, FolderOpen, FolderUp, Hand, Lock, Palette, PenTool, Send, Truck } from "lucide-react";
import { assignAction, completeStageAction, handOffAction, platformAction, progressAction } from "@/app/actions";
import type { StageKind, StageProgress } from "@/db/schema";
import { STAGE_META, TYPE_META, handoffTargets, type WorkContext } from "@/domain/workflow";
import { formatDateTime, formatDay, formatRelative } from "@/lib/dates";
import type { StageView, WorkItem } from "@/server/queries";
import { ActionForm, Submit } from "./client";
import { BrandDot, TypeIcon, btn } from "./ui";

export type PickPerson = { id: string; name: string; teams: string[] };

const TARGET_INFO: Partial<Record<StageKind, { icon: typeof Send; hint: string; short: string }>> = {
  media: { icon: Clapperboard, hint: "Filming & editing", short: "Media" },
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

type HandItem = Pick<WorkItem, "id" | "type" | "context" | "driveUrl" | "canvaUrl" | "canvaLink" | "stages">;

function defaultTarget(item: HandItem, stageId: string, targets: StageKind[]): StageKind {
  const pos = item.stages.find((x) => x.id === stageId)?.position ?? 0;
  const routeNext = item.stages.find((s) => s.position > pos)?.kind;
  return routeNext && targets.includes(routeNext) ? routeNext : targets[0];
}

function TargetChips({ targets, value, onChange, big }: { targets: StageKind[]; value: StageKind; onChange: (t: StageKind) => void; big?: boolean }) {
  return (
    <div className={clsx("grid gap-2", big ? "sm:grid-cols-3" : "grid-cols-3")} role="radiogroup" aria-label="Send to">
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

function WhoAndWhen({
  stageId,
  target,
  people,
  existingDeadline,
  assigneeId,
  setAssigneeId,
  canDeadline,
  defaultPerson,
}: {
  stageId: string;
  target: StageKind;
  people: PickPerson[];
  existingDeadline: string | null;
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  canDeadline: boolean;
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
      </div>
      {(canDeadline || existingDeadline) && (
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

/** Item page: "I'm done — send it to…". The time and name are saved automatically. */
export function HandOffPanel({ item, stageId, from, people, canDeadline }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[]; canDeadline: boolean }) {
  const context: WorkContext = item.context;
  const targets = handoffTargets(from, context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, stageId, targets));
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const existingDeadline = nextStage?.deadline ?? null;
  const defaultPerson = nextStage?.assignee?.name ?? null;
  const needsDrive = STAGE_META[from].needsDriveLink;
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
      {needsDrive && (
        <div>
          <label className="label" htmlFor={`drive-${stageId}`}>
            Google Drive link to the final {from === "media" ? "video" : "design"}
          </label>
          <input id={`drive-${stageId}`} name="driveUrl" defaultValue={item.driveUrl ?? ""} placeholder="https://drive.google.com/…" className="field" required />
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
        canDeadline={canDeadline}
        defaultPerson={defaultPerson}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit size="lg">
          Send to {assigneeName || defaultPerson || STAGE_META[target].label}
          <ArrowRight className="size-4" />
        </Submit>
        <span className="text-[12.5px] text-muted">Your name and the time are saved automatically.</span>
      </div>
    </ActionForm>
  );
}

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

/* ------------------------------------------------------------------ */
/* Task card (My tasks): everything needed to finish, in one place        */
/* ------------------------------------------------------------------ */

export function TaskCard({ item, meId, people, canDeadline }: { item: WorkItem; meId: string; people: PickPerson[]; canDeadline: boolean }) {
  const cur = item.current!;
  const prev = item.stages.filter((s) => s.position < cur.position && s.status === "done").at(-1);
  const from = prev ? (prev.assignee?.name ?? prev.completedBy?.name) : null;
  const where = item.brand ? item.brand.name : item.project ? `${item.project.clientName} · ${item.project.name}` : "";
  const late = cur.health === "overdue";
  const returned = cur.round > 1 && !!cur.returnedAt;
  const unclaimed = !cur.assignee;
  const working = cur.kind === "media" || cur.kind === "design" || cur.kind === "content";

  return (
    <article className={clsx("card overflow-hidden transition-shadow duration-150 hover:shadow-pop", late && "border-bad/50", returned && "border-back/50")}>
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold hover:text-electric">
              <TypeIcon type={item.type} />
              <span className="truncate">{item.title}</span>
            </Link>
            {item.slideNumber && <span className="rounded-md bg-[#f1e8fd] px-1.5 py-0.5 text-[11.5px] font-bold text-[#6d28d9]">Slide {item.slideNumber}</span>}
            {unclaimed && <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">NEW for your team</span>}
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

      {returned && (
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
        {item.driveUrl && (
          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <FolderOpen className="size-3.5 text-[#1a73e8]" /> Final file <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        {(cur.kind === "media" || cur.kind === "design") && item.driveFolderUrl && (
          <a href={item.driveFolderUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <FolderUp className="size-3.5 text-[#1a73e8]" /> Upload folder <ExternalLink className="size-3 text-faint" />
          </a>
        )}
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
        <QuickAction item={item} people={people} canDeadline={canDeadline} />
      </div>
    </article>
  );
}

function QuickAction({ item, people, canDeadline }: { item: WorkItem; people: PickPerson[]; canDeadline: boolean }) {
  const cur = item.current!;
  if (cur.kind === "content") return <ContentQuick item={item} people={people} canDeadline={canDeadline} />;
  if (cur.kind === "media" || cur.kind === "design") {
    return (
      <ActionForm action={handOffAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="stageId" value={cur.id} />
        <label className="sr-only" htmlFor={`qd-${cur.id}`}>
          Google Drive link
        </label>
        <input
          id={`qd-${cur.id}`}
          name="driveUrl"
          required
          defaultValue={item.driveUrl ?? ""}
          placeholder={`Paste the Google Drive link to the final ${cur.kind === "media" ? "video" : "design"}`}
          className="field min-w-[240px] flex-1"
        />
        <Submit variant="primary">
          <Check className="size-4" strokeWidth={3} /> Done — send to {item.context === "plan" ? "Social" : "Delivery"}
        </Submit>
      </ActionForm>
    );
  }
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

function ContentQuick({ item, people, canDeadline }: { item: WorkItem; people: PickPerson[]; canDeadline: boolean }) {
  const cur = item.current!;
  const targets = handoffTargets("content", item.context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, cur.id, targets));
  const [more, setMore] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const nextStage = item.stages.find((s) => s.kind === target);
  const defaultPerson = nextStage?.assignee?.name ?? null;
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
        <div className="w-full max-w-[420px]">
          <TargetChips
            targets={targets}
            value={target}
            onChange={(t) => {
              setTarget(t);
              setAssigneeId("");
            }}
          />
        </div>
        <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
          Choose person{canDeadline ? " & deadline" : ""} <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
        </button>
      </div>
      {more && (
        <WhoAndWhen
          stageId={cur.id}
          target={target}
          people={people}
          existingDeadline={nextStage?.deadline ?? null}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          canDeadline={canDeadline}
          defaultPerson={defaultPerson}
        />
      )}
    </ActionForm>
  );
}
