import Link from "next/link";
import clsx from "clsx";
import { STAGE_META } from "@/domain/workflow";
import { formatDay, monthName } from "@/lib/dates";
import type { WorkItem } from "@/server/queries";
import { FlowMini, ItemStatus } from "./flow";
import { Avatar, BrandDot, TypeIcon } from "./ui";

export function itemContextLabel(item: WorkItem) {
  if (item.brand && item.plan) return `${item.brand.name} · ${monthName(item.plan.month, true)} ${item.plan.year}`;
  if (item.project) return `${item.project.clientName} · ${item.project.name}`;
  return "";
}

/** The standard one-line item used in every list. Shows: what, whose, where in the cycle, and status. */
export function ItemRow({ item, showContext = true, compact, leading }: { item: WorkItem; showContext?: boolean; compact?: boolean; leading?: React.ReactNode }) {
  const c = item.current;
  const holder = c?.assignee?.name ?? null;
  return (
    <div className={clsx("group relative flex items-center gap-3 px-4 transition-colors hover:bg-[#f8faff]", compact ? "py-2.5" : "py-3", item.cancelledAt && "opacity-60")}>
      {leading}
      <div className="flex w-[52px] shrink-0 flex-col items-center text-center leading-tight">
        {item.postingDate ? (
          <>
            <span className="text-[11px] font-medium uppercase text-muted">{formatDay(item.postingDate, { weekday: false }).split(" ")[1]}</span>
            <span className="font-display text-[17px] font-bold">{Number(item.postingDate.slice(8))}</span>
          </>
        ) : (
          <span className="text-[11px] text-faint">No date</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/items/${item.id}`} className="flex items-center gap-1.5 font-medium text-ink after:absolute after:inset-0 group-hover:text-electric">
          <TypeIcon type={item.type} />
          <span className="truncate">{item.title}</span>
        </Link>
        {showContext && (
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
            {item.brand && <BrandDot color={item.brand.color} />}
            <span className="truncate">{itemContextLabel(item)}</span>
          </div>
        )}
      </div>
      <FlowMini item={item} className="hidden md:flex" />
      <div className="hidden w-[170px] shrink-0 items-center gap-2 text-[13px] sm:flex">
        {c ? (
          <>
            <Avatar name={holder} size={24} />
            <div className="min-w-0 leading-tight">
              <div className={clsx("truncate font-medium", !holder && "text-muted")}>{holder ?? "Unassigned"}</div>
              <div className="truncate text-[12px] text-muted">{STAGE_META[c.kind].label}</div>
            </div>
          </>
        ) : null}
      </div>
      <div className="hidden w-[150px] shrink-0 justify-end sm:flex">
        <ItemStatus item={item} />
      </div>
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
