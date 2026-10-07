import clsx from "clsx";
import { AlertTriangle, Check, CornerUpLeft, Flag, Hourglass, Send } from "lucide-react";
import { STAGE_META, finalLabel, type StageHealth } from "@/domain/workflow";
import { diffDays, formatDateTime, formatDay, plural, todayISO } from "@/lib/dates";
import type { StageView, WorkItem } from "@/server/queries";
import { Avatar, Badge, type Tone } from "./ui";

const PROGRESS_TEXT = { not_started: "Not started yet", processing: "Processing", adjusting: "Adjusting", waiting_approval: "Waiting approval" } as const;

/* ------------------------------------------------------------------ */
/* Health → words                                                       */
/* ------------------------------------------------------------------ */

export function healthBadge(s: StageView, today = todayISO()): { tone: Tone; label: string } | null {
  const h: StageHealth = s.health;
  switch (h) {
    case "overdue":
      return { tone: "bad", label: `${plural(diffDays(today, s.deadline!), "day")} late` };
    case "overdue_excused":
      return { tone: "neutral", label: "Late · exception" };
    case "due_today":
      return { tone: "warn", label: "Due today" };
    case "due_soon":
      return { tone: "warn", label: `Due ${formatDay(s.deadline, { weekday: false })}` };
    case "on_track":
      return { tone: "neutral", label: `Due ${formatDay(s.deadline, { weekday: false })}` };
    case "rework":
      return { tone: "back", label: "Changes requested" };
    case "blocked":
      return { tone: "wait", label: "Waiting on previous stage" };
    case "done_late":
      return { tone: "bad", label: `Delivered late` };
    case "done_excused":
      return { tone: "neutral", label: "Late · exception" };
    case "done_on_time":
      return { tone: "ok", label: "On time" };
    default:
      return null;
  }
}

/** One short sentence: where the work is and who has it. */
export function whereLine(item: WorkItem): string {
  if (item.cancelledAt) return "Cancelled";
  if (item.completedAt) return finalLabel(item.context);
  const c = item.current;
  if (!c) return "—";
  return `${STAGE_META[c.kind].label} · ${c.assignee?.name ?? "Unassigned"}`;
}

/* ------------------------------------------------------------------ */
/* Big stepper (item page)                                              */
/* ------------------------------------------------------------------ */

type NodeState = "done" | "active" | "returned" | "late" | "waiting" | "final-done" | "final-waiting";

function nodeState(s: StageView): NodeState {
  if (s.status === "done") return "done";
  if (s.status === "waiting") return "waiting";
  if (s.health === "overdue") return "late";
  if (s.round > 1 && s.returnedAt) return "returned";
  return "active";
}

function NodeIcon({ state, size = 36 }: { state: NodeState; size?: number }) {
  const cls = "flex shrink-0 items-center justify-center rounded-full";
  const st = { width: size, height: size };
  const i = "size-[45%]";
  switch (state) {
    case "done":
    case "final-done":
      return (
        <span className={clsx(cls, "bg-ok text-white")} style={st}>
          {state === "final-done" ? <Flag className={i} strokeWidth={2.4} /> : <Check className={i} strokeWidth={3} />}
        </span>
      );
    case "active":
      return (
        <span className={clsx(cls, "bg-electric text-white animate-pulse-dot")} style={st}>
          <span className="size-[30%] rounded-full bg-white" />
        </span>
      );
    case "returned":
      return (
        <span className={clsx(cls, "bg-back text-white")} style={st}>
          <CornerUpLeft className={i} strokeWidth={2.6} />
        </span>
      );
    case "late":
      return (
        <span className={clsx(cls, "bg-bad text-white")} style={st}>
          <AlertTriangle className={i} strokeWidth={2.4} />
        </span>
      );
    case "final-waiting":
      return (
        <span className={clsx(cls, "border-2 border-dashed border-line-strong bg-white text-faint")} style={st}>
          <Flag className={i} strokeWidth={2} />
        </span>
      );
    default:
      return <span className={clsx(cls, "border-2 border-line-strong bg-white")} style={st} />;
  }
}

export function FlowStepper({ item }: { item: WorkItem }) {
  const today = todayISO();
  const done = !!item.completedAt;
  const nodes = item.stages;
  return (
    <ol className="grid gap-y-5" style={{ gridTemplateColumns: `repeat(${nodes.length + 1}, minmax(0, 1fr))` }}>
      {nodes.map((s, i) => {
        const state = item.cancelledAt && s.status === "active" ? "waiting" : nodeState(s);
        const prevDone = i === 0 || nodes[i - 1].status === "done";
        return (
          <li key={s.id} className="relative min-w-0 pr-3">
            {/* connector */}
            <div className={clsx("absolute left-[44px] right-2 top-[17px] h-[2px] rounded", s.status === "done" ? "bg-ok" : "bg-line-strong")} />
            <NodeIcon state={state} />
            <div className="mt-2.5 min-w-0">
              <div className={clsx("text-[12px] font-semibold uppercase tracking-[0.06em]", s.status === "waiting" ? "text-faint" : "text-muted")}>{STAGE_META[s.kind].label}</div>
              <div className={clsx("mt-1 flex items-center gap-1.5 text-[14px] font-semibold", s.status === "waiting" && "text-muted")}>
                <Avatar name={s.status === "done" ? (s.assignee?.name ?? s.completedBy?.name) : s.assignee?.name} size={20} />
                <span className="truncate">{(s.status === "done" ? (s.assignee?.name ?? s.completedBy?.name) : s.assignee?.name) ?? "Unassigned"}</span>
              </div>
              <div className="mt-1 text-[12px] leading-snug text-muted">
                {s.status === "done" && s.completedAt && <>Done {formatDateTime(s.completedAt)}</>}
                {s.status === "active" && (state === "returned" ? <span className="text-back">Sent back — needs changes</span> : state === "late" ? <span className="font-medium text-bad">{healthBadge(s, today)?.label}</span> : <span className="font-medium text-electric">{PROGRESS_TEXT[s.progress]}</span>)}
                {s.status === "waiting" && (prevDone ? "Up next" : "Waiting")}
              </div>
            </div>
          </li>
        );
      })}
      <li className="min-w-0">
        <NodeIcon state={done ? "final-done" : "final-waiting"} />
        <div className="mt-2.5">
          <div className={clsx("text-[12px] font-semibold uppercase tracking-[0.06em]", done ? "text-ok" : "text-faint")}>{finalLabel(item.context)}</div>
          <div className="mt-1 text-[12px] text-muted">{done ? formatDateTime(item.completedAt) : item.context === "plan" && item.postingDate ? `Planned ${formatDay(item.postingDate)}` : "Not yet"}</div>
        </div>
      </li>
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Compact chain (lists)                                                */
/* ------------------------------------------------------------------ */

export function FlowMini({ item, className }: { item: WorkItem; className?: string }) {
  const done = !!item.completedAt;
  return (
    <div className={clsx("flex items-center", className)} aria-label="Workflow progress">
      {item.stages.map((s, i) => {
        const state = nodeState(s);
        const name = s.status === "done" ? (s.assignee?.name ?? s.completedBy?.name) : s.assignee?.name;
        const title = `${STAGE_META[s.kind].label} · ${name ?? "Unassigned"} · ${s.status === "done" ? "Done" : s.status === "active" ? (state === "late" ? "Late" : state === "returned" ? "Returned" : "Current") : "Waiting"}`;
        const initials = name ? name.slice(0, 1).toUpperCase() : "·";
        return (
          <div key={s.id} className="flex items-center">
            {i > 0 && <span className={clsx("h-[2px] w-2.5", item.stages[i - 1].status === "done" ? "bg-ok" : "bg-line-strong")} />}
            <span
              title={title}
              className={clsx(
                "flex size-[22px] items-center justify-center rounded-full text-[10px] font-bold",
                state === "done" && "bg-ok text-white",
                state === "active" && "bg-electric text-white ring-3 ring-electric/20",
                state === "returned" && "bg-back text-white ring-3 ring-back/20",
                state === "late" && "bg-bad text-white ring-3 ring-bad/20",
                state === "waiting" && "border border-line-strong bg-white text-faint",
              )}
            >
              {state === "done" ? <Check className="size-3" strokeWidth={3.5} /> : initials}
            </span>
          </div>
        );
      })}
      <span className={clsx("h-[2px] w-2.5", done ? "bg-ok" : "bg-line-strong")} />
      <span title={finalLabel(item.context)} className={clsx("flex size-[22px] items-center justify-center rounded-full", done ? "bg-ok text-white" : "border border-dashed border-line-strong text-faint")}>
        <Flag className="size-3" strokeWidth={2.4} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status chip used in lists                                             */
/* ------------------------------------------------------------------ */

export function ItemStatus({ item }: { item: WorkItem }) {
  if (item.cancelledAt) return <Badge tone="neutral">Cancelled</Badge>;
  if (item.completedAt) return <Badge tone="ok" icon={item.context === "plan" ? Send : Check}>{finalLabel(item.context)}</Badge>;
  const c = item.current;
  if (!c) return null;
  if (item.attention === "at_risk" && c.health !== "overdue")
    return item.postingDate && item.postingDate < todayISO() ? (
      <Badge tone="bad" icon={Hourglass} title="The posting date has passed and it isn't with Social Media yet">
        Posting date passed
      </Badge>
    ) : (
      <Badge tone="warn" icon={Hourglass} title="Posting soon but not with Social Media yet">
        Posting soon
      </Badge>
    );
  const b = healthBadge(c);
  if (b) return <Badge tone={b.tone}>{b.label}</Badge>;
  return null;
}
