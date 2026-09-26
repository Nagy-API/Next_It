"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, Check, ChevronDown, Clapperboard, ExternalLink, FolderOpen, Hand, Lock, Palette, PenTool, Send, Truck } from "lucide-react";
import { assignAction, completeStageAction, handOffAction, platformAction } from "@/app/actions";
import type { StageKind } from "@/db/schema";
import { STAGE_META, TYPE_META, handoffTargets, type WorkContext } from "@/domain/workflow";
import { formatDay, formatRelative } from "@/lib/dates";
import type { WorkItem } from "@/server/queries";
import { ActionForm, Submit } from "./client";
import { BrandDot, TypeIcon, btn } from "./ui";

export type PickPerson = { id: string; name: string; teams: string[] };

const TARGET_INFO: Partial<Record<StageKind, { icon: typeof Send; hint: string; short: string }>> = {
  media: { icon: Clapperboard, hint: "Filming & editing", short: "Media" },
  design: { icon: PenTool, hint: "Posts & carousels", short: "Design" },
  social: { icon: Send, hint: "Straight to publishing", short: "Social" },
  delivery: { icon: Truck, hint: "Send to the client", short: "Delivery" },
};

type HandItem = Pick<WorkItem, "id" | "type" | "context" | "driveUrl" | "canvaUrl" | "stages">;

function defaultTarget(item: HandItem, stageId: string, targets: StageKind[]): StageKind {
  const pos = item.stages.find((x) => x.id === stageId)?.position ?? 0;
  const routeNext = item.stages.find((s) => s.position > pos)?.kind;
  return routeNext && targets.includes(routeNext) ? routeNext : targets[0];
}

/** Team choice as compact chips (content step only). */
function TargetChips({ targets, value, onChange, big }: { targets: StageKind[]; value: StageKind; onChange: (t: StageKind) => void; big?: boolean }) {
  return (
    <div className={clsx("grid gap-2", big ? "sm:grid-cols-3" : "grid-cols-3")}>
      {targets.map((t) => {
        const info = TARGET_INFO[t];
        const Icon = info?.icon ?? Send;
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={on}
            className={clsx(
              "flex items-center gap-2 rounded-xl border-2 text-left transition-colors",
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

function WhoAndWhen({ stageId, target, people, existingDeadline, assigneeId, setAssigneeId }: { stageId: string; target: StageKind; people: PickPerson[]; existingDeadline: string | null; assigneeId: string; setAssigneeId: (v: string) => void }) {
  const team = STAGE_META[target]?.team;
  const teamPeople = people.filter((p) => team && p.teams.includes(team));
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor={`who-${stageId}`}>
          Who? <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id={`who-${stageId}`} name="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="field">
          <option value="">Anyone in {STAGE_META[target].label}</option>
          {teamPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="w-[170px]">
        <label className="label" htmlFor={`dl-${stageId}`}>
          Deadline <span className="font-normal text-muted">(optional)</span>
        </label>
        {existingDeadline ? (
          <div className="flex h-[38px] items-center gap-1.5 rounded-lg bg-canvas px-3 text-[13.5px] font-medium" title="Deadlines can't be changed once set">
            <Lock className="size-3.5 text-muted" /> {formatDay(existingDeadline)}
          </div>
        ) : (
          <input id={`dl-${stageId}`} type="date" name="deadline" className="field" />
        )}
      </div>
    </div>
  );
}

/**
 * Item page: "I'm done — send it to…". Pasting the link IS the delivery; the time is saved automatically.
 */
export function HandOffPanel({ item, stageId, from, people }: { item: HandItem; stageId: string; from: StageKind; people: PickPerson[] }) {
  const context: WorkContext = item.context;
  const targets = handoffTargets(from, context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, stageId, targets));
  const [assigneeId, setAssigneeId] = useState("");
  const existingDeadline = item.stages.find((s) => s.kind === target)?.deadline ?? null;
  const needsDrive = STAGE_META[from].needsDriveLink;
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";

  return (
    <ActionForm action={handOffAction} className="space-y-4">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName} />
      {from === "content" && (
        <div>
          <label className="label" htmlFor={`canva-${stageId}`}>
            Canva link to this content&rsquo;s slide
          </label>
          <input id={`canva-${stageId}`} name="canvaUrl" defaultValue={item.canvaUrl ?? ""} placeholder="https://canva.link/…" className="field" required />
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
      <WhoAndWhen stageId={stageId} target={target} people={people} existingDeadline={existingDeadline} assigneeId={assigneeId} setAssigneeId={setAssigneeId} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit size="lg">
          Send to {assigneeName || STAGE_META[target].label}
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

/* ------------------------------------------------------------------ */
/* Task card (My tasks): everything needed to finish, in one place        */
/* ------------------------------------------------------------------ */

export function TaskCard({ item, meId, people }: { item: WorkItem; meId: string; people: PickPerson[] }) {
  const cur = item.current!;
  const prev = item.stages.filter((s) => s.position < cur.position && s.status === "done").at(-1);
  const from = prev ? (prev.assignee?.name ?? prev.completedBy?.name) : null;
  const where = item.brand ? item.brand.name : item.project ? `${item.project.clientName} · ${item.project.name}` : "";
  const late = cur.health === "overdue";
  const returned = cur.round > 1 && !!cur.returnedAt;
  const unclaimed = !cur.assignee;

  return (
    <div className={clsx("card overflow-hidden", late && "border-bad/50", returned && "border-back/50")}>
      <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-1.5 text-[15.5px] font-semibold hover:text-electric">
              <TypeIcon type={item.type} />
              <span className="truncate">{item.title}</span>
            </Link>
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
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
          {cur.deadline && (
            <span className={clsx("rounded-full px-2.5 py-1", late ? "bg-bad text-white" : "bg-canvas text-ink-2")}>
              {late ? "LATE · was due" : "Due"} {formatDay(cur.deadline)}
            </span>
          )}
        </div>
      </div>

      {returned && (
        <div className="mx-4 mt-2.5 rounded-lg bg-back-soft px-3 py-2 text-[13px] text-ink">
          <b className="text-back">Sent back by {cur.returnedBy?.name ?? "someone"}</b>
          {cur.returnNote ? <>: &ldquo;{cur.returnNote}&rdquo;</> : " — check the notes."}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 px-4">
        {item.canvaUrl && (
          <a href={item.canvaUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <Palette className="size-3.5 text-[#7d2ae8]" /> Open Canva <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        {item.driveUrl && (
          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            <FolderOpen className="size-3.5 text-[#1a73e8]" /> Drive file <ExternalLink className="size-3 text-faint" />
          </a>
        )}
        <Link href={`/items/${item.id}`} className={btn("ghost", "sm")}>
          Details & notes
        </Link>
        {unclaimed && <TakeButton stageId={cur.id} userId={meId} size="sm" />}
      </div>

      <div className="mt-3 border-t border-line bg-[#fafbfe] px-4 py-3.5">
        <QuickAction item={item} people={people} />
      </div>
    </div>
  );
}

function QuickAction({ item, people }: { item: WorkItem; people: PickPerson[] }) {
  const cur = item.current!;
  if (cur.kind === "content") return <ContentQuick item={item} people={people} />;
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

function ContentQuick({ item, people }: { item: WorkItem; people: PickPerson[] }) {
  const cur = item.current!;
  const targets = handoffTargets("content", item.context);
  const [target, setTarget] = useState<StageKind>(defaultTarget(item, cur.id, targets));
  const [more, setMore] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const assigneeName = people.find((p) => p.id === assigneeId)?.name ?? "";
  return (
    <ActionForm action={handOffAction} className="space-y-3">
      <input type="hidden" name="stageId" value={cur.id} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="assigneeName" value={assigneeName} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`qc-${cur.id}`}>
          Canva link
        </label>
        <input id={`qc-${cur.id}`} name="canvaUrl" required defaultValue={item.canvaUrl ?? ""} placeholder="Paste the Canva link to this content's slide" className="field min-w-[240px] flex-1" />
        <Submit variant="primary">
          Send to {assigneeName || STAGE_META[target].label} <ArrowRight className="size-4" />
        </Submit>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-[420px]">
          <TargetChips targets={targets} value={target} onChange={(t) => {
              setTarget(t);
              setAssigneeId("");
            }} />
        </div>
        <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-electric">
          Person & deadline <ChevronDown className={clsx("size-3.5 transition-transform", more && "rotate-180")} />
        </button>
      </div>
      {more && (
        <WhoAndWhen
          stageId={cur.id}
          target={target}
          people={people}
          existingDeadline={item.stages.find((s) => s.kind === target)?.deadline ?? null}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
        />
      )}
    </ActionForm>
  );
}
