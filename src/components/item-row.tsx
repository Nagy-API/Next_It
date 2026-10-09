import Link from "next/link";
import clsx from "clsx";
import { STAGE_META } from "@/domain/workflow";
import { formatDateTime, formatDay, monthName } from "@/lib/dates";
import { Check } from "lucide-react";
import type { WorkItem } from "@/server/queries";
import { FlowMini, ItemStatus } from "./flow";
import { Avatar, BrandDot, ExtraBadge, ProgressChip, StageChip, TimeSpent, TypeIcon } from "./ui";

export function itemContextLabel(item: WorkItem) {
  if (item.brand && item.plan) return `${item.brand.name} · ${monthName(item.plan.month, true)} ${item.plan.year}`;
  if (item.project) return `${item.project.clientName} · ${item.project.name}`;
  return "";
}

/** The standard one-line item used in every list. Shows: what, whose, where in the cycle, and status. */
export function ItemRow({ item, showContext = true, compact, leading, actions }: { item: WorkItem; showContext?: boolean; compact?: boolean; leading?: React.ReactNode; actions?: React.ReactNode }) {
  const c = item.current;
  const holder = c?.assignee?.name ?? null;
  const last = item.stages.filter((s) => s.status === "done" && s.completedAt).at(-1);
  return (
    <div
      style={showContext && item.brand ? { boxShadow: `inset 3px 0 0 ${item.brand.color}` } : undefined}
      className={clsx("group relative flex items-center gap-3 px-4 transition-colors hover:bg-[#f8faff]", compact ? "py-2.5" : "py-3", item.cancelledAt && "opacity-60")}
    >
      {leading}
      <div className="flex w-[52px] shrink-0 flex-col items-center text-center leading-tight">
        {item.postingDate ? (
          <>
            <span className="text-[11px] font-medium uppercase text-muted">{formatDay(item.postingDate, { weekday: false }).split(" ")[1]}</span>
            <span className="font-display text-[17px] font-bold">{Number(item.postingDate.slice(8))}</span>
          </>
        ) : item.current?.deadline ? (
          <>
            <span className="text-[11px] font-medium uppercase text-muted">Due</span>
            <span className="font-display text-[17px] font-bold">{Number(item.current.deadline.slice(8))}</span>
            <span className="text-[10.5px] text-muted">{formatDay(item.current.deadline, { weekday: false }).split(" ")[1]}</span>
          </>
        ) : (
          <span className="text-[11px] text-faint">No date</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-1.5 font-medium text-ink after:absolute after:inset-0 group-hover:text-electric">
            <TypeIcon type={item.type} />
            <span className="truncate">{item.title}</span>
          </Link>
          {item.slideNumber ? (
            <span className="shrink-0 rounded bg-[#f1e8fd] px-1 text-[11px] font-bold text-[#6d28d9]" title={`Slide ${item.slideNumber} in the month's Canva`}>
              #{item.slideNumber}
            </span>
          ) : null}
          {item.extra && <ExtraBadge by={item.extra.by?.name} />}
        </div>
        {showContext && (
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
            {item.brand && <BrandDot color={item.brand.color} />}
            <span className="truncate">{itemContextLabel(item)}</span>
          </div>
        )}
        {c && (
          <div className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
            <StageChip kind={c.kind} short className="!px-1.5 !py-0 !text-[11px]" />
            <ProgressChip progress={c.progress} scheduledFor={c.scheduledFor} running={c.time.running} hideNotStarted className="!px-1.5 !py-0 !text-[11px]" />
            {holder && <span className="text-[11.5px] text-muted">· {holder}</span>}
          </div>
        )}
        {last && !compact && (
          <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted">
            <Check className="size-3 shrink-0 text-ok" strokeWidth={3} /> {STAGE_META[last.kind].short} delivered {formatDateTime(last.completedAt)} · {last.assignee?.name ?? last.completedBy?.name}
          </div>
        )}
      </div>
      {!compact && <FlowMini item={item} className="hidden xl:flex" />}
      <div className={clsx("hidden shrink-0 items-center gap-2 text-[13px] sm:flex", compact ? "w-[170px]" : "w-[230px]")}>
        {c ? (
          holder ? (
            <>
              <Avatar name={holder} size={24} />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  {holder}
                  {c.time.ms > 0 && <TimeSpent ms={c.time.ms} running={c.time.running} className="!text-[11px] !font-normal text-muted" />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <StageChip kind={c.kind} short className="!px-1.5 !py-0 !text-[11px]" />
                  <ProgressChip progress={c.progress} scheduledFor={c.scheduledFor} running={c.time.running} hideNotStarted className="!px-1.5 !py-0 !text-[11px]" />
                </div>
              </div>
            </>
          ) : (
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-warn">Waiting for {STAGE_META[c.kind].short} team</div>
              <div className="truncate text-[12px] text-muted">nobody picked it up yet</div>
            </div>
          )
        ) : null}
      </div>
      <div className={clsx("hidden shrink-0 justify-end sm:flex", compact ? "w-[130px]" : "w-[150px]")}>
        <ItemStatus item={item} />
      </div>
      {actions && <div className="relative z-10 flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function ItemList({ items, showContext, empty, compact }: { items: WorkItem[]; showContext?: boolean; empty?: React.ReactNode; compact?: boolean }) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} showContext={showContext} compact={compact} />
      ))}
    </div>
  );
}
