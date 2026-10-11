"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Ban, Camera, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clapperboard, Clock, ExternalLink, MapPin, Pencil, Plus, RotateCcw, ShoppingBag, StickyNote, Trash2, Users, Warehouse } from "lucide-react";
import { deleteShootAction, saveShootAction, shootStatusAction } from "@/app/shoot-actions";
import { shootAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "./client";
import { Avatar } from "./avatar";
import { BrandMark } from "./ui";
import { DateInput } from "./date-input";
import { addDays, dayOfWeek, formatDay, monthLabel, monthRange, todayISO } from "@/lib/dates";
import type { ShootEntry } from "@/server/shoots";
import { weekStart } from "@/domain/shoot";

type Person = { id: string; name: string };
type BrandOpt = { id: string; name: string; slug: string; color: string };
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

/** Saturday that starts the week of `iso`. */

/** The same day one month earlier / later (the 31st becomes the last day of a shorter month). */
function shiftMonth(iso: string, dir: number) {
  let y = Number(iso.slice(0, 4));
  let m = Number(iso.slice(5, 7)) + dir;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const last = Number(monthRange(y, m).end.slice(8));
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(Number(iso.slice(8)), last)).padStart(2, "0")}`;
}

export function ShootBoard({
  entries,
  view,
  anchor,
  people,
  brands,
  canPlan,
  openId,
}: {
  entries: ShootEntry[];
  view: "week" | "month" | "list";
  anchor: string;
  people: Person[];
  brands: BrandOpt[];
  canPlan: boolean;
  openId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const today = todayISO();
  const [open, setOpen] = useState<ShootEntry | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // The picked day: arrows move it a day (or a month); the page loads a new range only when it leaves this one.
  const [sel, setSel] = useState(anchor);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSel(anchor), [anchor]);
  useEffect(() => {
    if (!openId) return;
    const e = entries.find((x) => x.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (e) setOpen(e);
  }, [openId, entries]);
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("open");
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v);
    else q.delete(k);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  const ws = weekStart(anchor);
  const mr = monthRange(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)));
  const [from, to] = view === "month" ? [mr.start, mr.end] : view === "week" ? [ws, addDays(ws, 6)] : [anchor, addDays(anchor, 29)];
  const pick = (d: string) => {
    if (d >= from && d <= to && view !== "list") {
      setSel(d);
      const q = new URLSearchParams(sp.toString());
      q.delete("open");
      q.set("d", d);
      window.history.replaceState(null, "", `${pathname}?${q}`);
    } else go({ d: d === today ? null : d });
  };
  const title =
    view === "month"
      ? monthLabel(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))
      : view === "week"
        ? `${formatDay(ws)} – ${formatDay(addDays(ws, 6))}`
        : `${formatDay(anchor)} – ${formatDay(addDays(anchor, 29))}`;
  const brandSlug = sp.get("brand") ?? "";
  const dayItems = entries.filter((e) => e.day === sel);

  const navBtn = "grid size-9 cursor-pointer place-items-center rounded-lg transition-colors";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-line bg-surface p-0.5" role="tablist" aria-label="View">
          {(["week", "month", "list"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => go({ view: v === "week" ? null : v })}
              className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors", view === v ? "bg-strong text-white" : "text-muted hover:text-ink")}
            >
              {v}
            </button>
          ))}
        </div>
        {/* « a month · ‹ a day · Today · › a day · » a month */}
        <div className="flex items-center gap-1" role="group" aria-label="Move through the calendar">
          <button type="button" onClick={() => go({ d: shiftMonth(sel, -1) })} className={clsx(navBtn, "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")} aria-label="One month back" title="One month back">
            <ChevronsLeft className="size-[18px]" />
          </button>
          <button type="button" onClick={() => pick(addDays(sel, -1))} className={clsx(navBtn, "border border-line bg-surface hover:border-line-strong")} aria-label="One day back" title="One day back">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => go({ d: null })} className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-strong">
            Today
          </button>
          <button type="button" onClick={() => pick(addDays(sel, 1))} className={clsx(navBtn, "border border-line bg-surface hover:border-line-strong")} aria-label="One day forward" title="One day forward">
            <ChevronRight className="size-4" />
          </button>
          <button type="button" onClick={() => go({ d: shiftMonth(sel, 1) })} className={clsx(navBtn, "bg-sunken text-ink-2 hover:bg-hover hover:text-ink")} aria-label="One month forward" title="One month forward">
            <ChevronsRight className="size-[18px]" />
          </button>
        </div>
        <span className="font-display text-[16px] font-bold max-sm:basis-full">{title}</span>
        <select value={brandSlug} onChange={(e) => go({ brand: e.target.value || null })} aria-label="Brand" className="field field-sm h-9 w-auto sm:ml-auto">
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        {canPlan && (
          <button type="button" onClick={() => setAdding(sel)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-electric px-3.5 text-[14px] font-semibold text-white shadow-sm transition-transform hover:brightness-110 active:scale-[0.97] max-sm:ml-auto">
            <Plus className="size-4" strokeWidth={2.5} /> Add a shoot
          </button>
        )}
      </div>

      {view === "week" && (
        <>
          {/* Phones: a strip of the 7 days, then the picked day's shoots. */}
          <div className="md:hidden">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d, i) => {
                const n = entries.filter((e) => e.day === d && e.status !== "cancelled").length;
                const on = d === sel;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pick(d)}
                    aria-pressed={on}
                    className={clsx("flex cursor-pointer flex-col items-center rounded-xl border py-1.5 transition-colors", on ? "border-electric bg-electric text-white" : d === today ? "border-electric/50 bg-electric-soft" : "border-line bg-surface")}
                  >
                    <span className={clsx("text-[10.5px] font-semibold uppercase", on ? "text-white/80" : "text-muted")}>{WEEKDAYS[i]}</span>
                    <span className="font-display text-[17px] font-bold leading-tight">{Number(d.slice(8))}</span>
                    <span className={clsx("mt-0.5 h-1.5 w-1.5 rounded-full", n ? (on ? "bg-white" : "bg-[#be185d]") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
            <DayList day={sel} today={today} items={dayItems} onOpen={setOpen} onAdd={canPlan ? setAdding : undefined} />
          </div>
          <div className="hidden md:block">
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d, i) => {
                const items = entries.filter((e) => e.day === d);
                const isToday = d === today;
                return (
                  <div key={d} className={clsx("flex min-h-[260px] min-w-0 flex-col rounded-2xl border p-2", isToday ? "border-electric/50 bg-electric-soft/50" : "border-line bg-subtle", d === sel && !isToday && "ring-2 ring-electric/40")}>
                    <button type="button" onClick={() => pick(d)} className="mb-2 flex cursor-pointer items-baseline justify-between px-1">
                      <span className={clsx("text-[11.5px] font-semibold uppercase tracking-[0.08em]", isToday ? "text-electric" : "text-muted")}>{WEEKDAYS[i]}</span>
                      <span className={clsx("font-display text-[18px] font-bold", isToday ? "text-electric" : "text-ink")}>{Number(d.slice(8))}</span>
                    </button>
                    {isToday && <span className="mb-2 self-start rounded-full bg-electric px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">Today</span>}
                    <div className="flex flex-1 flex-col gap-2">
                      {items.map((e) => (
                        <SlotCard key={e.id} e={e} onOpen={() => setOpen(e)} compact />
                      ))}
                      {!items.length && <p className="px-1 text-[12px] text-faint">No shoots</p>}
                    </div>
                    {canPlan && (
                      <button type="button" onClick={() => setAdding(d)} className="mt-2 inline-flex cursor-pointer items-center gap-1 self-start rounded-lg px-1.5 py-1 text-[12px] font-medium text-muted hover:bg-surface hover:text-electric">
                        <Plus className="size-3.5" /> Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === "month" && (
        <>
          <MonthGrid anchor={anchor} sel={sel} entries={entries} onOpen={setOpen} onPick={pick} onAdd={canPlan ? setAdding : undefined} />
          <div className="md:hidden">
            <DayList day={sel} today={today} items={dayItems} onOpen={setOpen} onAdd={canPlan ? setAdding : undefined} />
          </div>
        </>
      )}

      {view === "list" && (
        <div className="space-y-4">
          {[...new Set(entries.map((e) => e.day))].map((d) => (
            <section key={d}>
              <h3 className={clsx("mb-2 flex flex-wrap items-center gap-2 font-display text-[15px] font-bold", d === today && "text-electric")}>
                {formatDay(d, { weekday: true })}
                {d === today && <span className="rounded-full bg-electric px-2 py-0.5 text-[10.5px] font-bold uppercase text-white">Today</span>}
                <span className="text-[12.5px] font-normal text-muted">{entries.filter((e) => e.day === d).length} shoot(s)</span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entries
                  .filter((e) => e.day === d)
                  .map((e) => (
                    <SlotCard key={e.id} e={e} onOpen={() => setOpen(e)} />
                  ))}
              </div>
            </section>
          ))}
          {!entries.length && <div className="card px-5 py-10 text-center text-[14px] text-muted">No shoots in these 30 days.</div>}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? open.title : ""} width={560}>
        {open && <ShootDetails e={open} people={people} brands={brands} canPlan={canPlan} onDone={() => setOpen(null)} />}
      </Modal>
      <Modal open={!!adding} onClose={() => setAdding(null)} title="Add a shoot" width={600}>
        {adding && <ShootForm day={adding} people={people} brands={brands} brandId={brands.find((b) => b.slug === brandSlug)?.id} onDone={() => setAdding(null)} />}
      </Modal>
    </div>
  );
}

/** One day's shoots, big and easy to tap (phones). */
function DayList({ day, today, items, onOpen, onAdd }: { day: string; today: string; items: ShootEntry[]; onOpen: (e: ShootEntry) => void; onAdd?: (d: string) => void }) {
  return (
    <section className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={clsx("font-display text-[15px] font-bold", day === today && "text-electric")}>
          {day === today ? "Today · " : ""}
          {formatDay(day, { weekday: true })}
        </h3>
        {onAdd && (
          <button type="button" onClick={() => onAdd(day)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-electric hover:bg-electric-soft">
            <Plus className="size-4" /> Add
          </button>
        )}
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((e) => (
            <SlotCard key={e.id} e={e} onOpen={() => onOpen(e)} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong bg-subtle px-4 py-6 text-center text-[13px] text-muted">No shoots this day.</p>
      )}
    </section>
  );
}

/* ------------------------------ One slot ------------------------------ */

export function SlotCard({ e, onOpen, compact }: { e: ShootEntry; onOpen: () => void; compact?: boolean }) {
  const color = e.brand?.color ?? "#8b5cf6";
  const missing = [e.rentals && !e.rentalsReady, e.purchases && !e.purchasesReady].filter(Boolean).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        "group w-full cursor-pointer rounded-xl border border-line bg-surface p-2.5 text-left shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-pop",
        e.status === "cancelled" && "opacity-55",
      )}
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-bold tabular-nums text-ink">
        <Clock className="size-3.5 text-muted" />
        {e.start ? `${e.start}${e.end ? `–${e.end}` : ""}` : "Time not set"}
        {e.status === "shot" && <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-ok-soft px-1.5 text-[10.5px] font-bold text-ok">
            <Check className="size-3" strokeWidth={3} /> Shot
          </span>}
        {e.status === "cancelled" && <span className="ml-auto rounded-full bg-bad-soft px-1.5 text-[10.5px] font-bold text-bad">Cancelled</span>}
      </div>
      <div className={clsx("mt-1 font-semibold leading-snug text-ink group-hover:text-electric", compact ? "line-clamp-2 text-[13px]" : "text-[14px]", e.status === "cancelled" && "line-through")}>{e.title}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-muted">
        {e.brand ? <BrandMark name={e.brand.name} color={e.brand.color} logoUrl={e.brand.logoUrl} size={16} /> : <Clapperboard className="size-3.5" />}
        <span className="truncate">{e.where}</span>
      </div>
      {(e.location || e.people || missing > 0 || e.notes) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
          {e.location && (
            <span className="inline-flex max-w-full items-center gap-0.5 truncate">
              <MapPin className="size-3" /> {e.location}
            </span>
          )}
          {!!e.people && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="size-3" /> {e.people}
            </span>
          )}
          {missing > 0 && <span className="rounded bg-warn-soft px-1 font-semibold text-warn">{missing} to get</span>}
          {e.notes && <StickyNote className="size-3" aria-label="Has notes" />}
        </div>
      )}
      {(e.crew.length > 0 || e.owner) && (
        <div className="mt-2 flex -space-x-1.5">
          {[...(e.owner ? [e.owner] : []), ...e.crew.filter((c) => c.id !== e.owner?.id)].slice(0, 5).map((p) => (
            <Avatar key={p.id} name={p.name} size={20} ring badge={false} />
          ))}
        </div>
      )}
    </button>
  );
}

/* ------------------------------ Month grid ------------------------------ */

function MonthGrid({ anchor, sel, entries, onOpen, onPick, onAdd }: { anchor: string; sel: string; entries: ShootEntry[]; onOpen: (e: ShootEntry) => void; onPick: (d: string) => void; onAdd?: (d: string) => void }) {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const { start, end } = monthRange(y, m);
  const gridStart = weekStart(start);
  const total = Math.ceil((((dayOfWeek(start) + 1) % 7) + Number(end.slice(8))) / 7) * 7;
  const today = todayISO();
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((d) => (
          <div key={d} className="border-b border-line bg-subtle px-1 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint md:px-2 md:text-left md:text-[11px]">
            {d}
          </div>
        ))}
        {Array.from({ length: total }, (_, i) => addDays(gridStart, i)).map((d) => {
          const inMonth = d >= start && d <= end;
          const items = entries.filter((e) => e.day === d);
          const live = items.filter((e) => e.status !== "cancelled");
          return (
            <div key={d} className={clsx("group/day min-w-0 border-b border-r border-line p-1 md:min-h-[104px] md:p-1.5", !inMonth && "bg-subtle", d === sel && "bg-electric-soft/60")}>
              {/* Phones: the day number and a dot per shoot; tap shows that day below. */}
              <button type="button" onClick={() => onPick(d)} disabled={!inMonth} className="flex w-full cursor-pointer flex-col items-center gap-1 py-1 disabled:cursor-default md:hidden" aria-label={`${formatDay(d)}: ${live.length} shoot(s)`}>
                <span className={clsx("grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums", d === sel ? "bg-electric text-white" : d === today ? "text-electric ring-1 ring-electric" : inMonth ? "text-ink-2" : "text-faint")}>{Number(d.slice(8))}</span>
                <span className="flex h-1.5 gap-0.5">
                  {live.slice(0, 3).map((e) => (
                    <span key={e.id} className="size-1.5 rounded-full" style={{ background: e.brand?.color ?? "#be185d" }} />
                  ))}
                </span>
              </button>
              <div className="hidden md:block">
                <div className="mb-1 flex items-center justify-between">
                  <span className={clsx("text-[12px] font-semibold tabular-nums", d === today ? "grid size-6 place-items-center rounded-full bg-electric text-white" : inMonth ? "text-ink-2" : "text-faint")}>{Number(d.slice(8))}</span>
                  {onAdd && inMonth && (
                    <button type="button" onClick={() => onAdd(d)} className="cursor-pointer rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-electric focus-visible:opacity-100 group-hover/day:opacity-100" aria-label={`Add a shoot on ${formatDay(d)}`}>
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 4).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpen(e)}
                      className={clsx("block w-full cursor-pointer truncate rounded-md border-l-[3px] bg-surface px-1.5 py-0.5 text-left text-[11.5px] font-medium shadow-card hover:text-electric", e.status === "cancelled" && "line-through opacity-60")}
                      style={{ borderLeftColor: e.brand?.color ?? "#8b5cf6" }}
                    >
                      <span className="tabular-nums text-muted">{e.start}</span> {e.brand?.name ?? e.title}
                    </button>
                  ))}
                  {items.length > 4 && <div className="px-1 text-[11px] text-muted">+{items.length - 4} more</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Details ------------------------------ */

function ShootDetails({ e, people, brands, canPlan, onDone }: { e: ShootEntry; people: Person[]; brands: BrandOpt[]; canPlan: boolean; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing && e.slot) return <ShootForm day={e.day} people={people} brands={brands} slot={e} onDone={onDone} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-electric-soft px-2.5 py-1 font-semibold text-electric">
          <Camera className="size-3.5" /> {formatDay(e.day, { weekday: true })} · {e.start ?? "time not set"}
          {e.end ? `–${e.end}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted">
          {e.brand && <BrandMark name={e.brand.name} color={e.brand.color} logoUrl={e.brand.logoUrl} size={18} />}
          {e.where}
        </span>
        {e.status === "shot" && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-bold text-ok">✓ Shot</span>}
        {e.status === "cancelled" && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[12px] font-bold text-bad">Cancelled</span>}
      </div>
      <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[130px_1fr]">
        {e.location && <Row icon={MapPin} k="Where" v={e.location} />}
        {!!e.people && <Row icon={Users} k="On camera" v={`${e.people} ${e.people === 1 ? "person" : "people"}`} />}
        {e.rentals && <Row icon={Warehouse} k="To rent" v={`${e.rentals} ${e.rentalsReady ? "✓ ready" : "· not ready yet"}`} />}
        {e.purchases && <Row icon={ShoppingBag} k="To buy" v={`${e.purchases} ${e.purchasesReady ? "✓ ready" : "· not ready yet"}`} />}
        {(e.owner || e.crew.length > 0) && <Row icon={Users} k="Who goes" v={[...(e.owner ? [e.owner.name] : []), ...e.crew.filter((c) => c.id !== e.owner?.id).map((c) => c.name)].join(", ")} />}
        {e.kind === "slot" && <Row icon={Clapperboard} k="After the shoot" v={e.after === "edit" ? `Editing${e.editor ? ` by ${e.editor.name}` : ""}` : "Just shooting"} />}
      </dl>
      {e.notes && (
        <div className="rounded-xl border border-[#f6d9ad] bg-[#fffaf2] p-3 text-[13.5px] text-ink-2">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#b45309]">
            <StickyNote className="size-3.5" /> Notes for the crew
          </div>
          <p className="whitespace-pre-wrap">{e.notes}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {e.kind === "item" || e.slot?.itemId ? (
          <Link href={e.href} className="inline-flex items-center gap-1.5 rounded-lg bg-electric px-3 py-2 text-[13.5px] font-semibold text-white hover:brightness-110">
            Open the content <ExternalLink className="size-3.5" />
          </Link>
        ) : null}
        {e.kind === "item" && canPlan && e.status === "planned" && <CancelItemShoot itemId={e.id} onDone={onDone} />}
        {e.kind === "item" && <span className="text-[12.5px] text-muted">Change the plan on its Pre-production step.</span>}
        {e.kind === "slot" && canPlan && (
          <>
            {e.status === "planned" && (
              <StatusButton id={e.id} status="shot" label={e.after === "edit" ? `Shot, send to ${e.editor?.name ?? "editing"}` : "Mark as shot"} primary onDone={onDone} />
            )}
            {e.status !== "planned" && <StatusButton id={e.id} status="planned" label="Back to planned" icon={RotateCcw} onDone={onDone} />}
            <button type="button" onClick={() => setEditing(true)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] font-medium hover:border-line-strong">
              <Pencil className="size-3.5" /> Edit
            </button>
            {e.status === "planned" && <StatusButton id={e.id} status="cancelled" label="Cancel shoot" icon={Ban} onDone={onDone} />}
            <ActionForm action={deleteShootAction} onSuccess={onDone} inlineError={false}>
              <input type="hidden" name="shootId" value={e.id} />
              <button type="submit" onClick={(ev) => !confirm(`Delete “${e.title}” from the schedule?`) && ev.preventDefault()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-bad-soft hover:text-bad">
                <Trash2 className="size-3.5" /> Delete
              </button>
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}

/** Takes the day off a content item's shoot (it goes back to "Waiting for a shoot day"). */
function CancelItemShoot({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  return (
    <ActionForm action={shootAction} onSuccess={onDone}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="shootDate" value="" />
      <input type="hidden" name="shootTime" value="" />
      <input type="hidden" name="shootEndTime" value="" />
      <input type="hidden" name="shootDuration" value="" />
      <button type="submit" onClick={(ev) => !confirm("Cancel this shoot day? The content goes back to waiting for a day.") && ev.preventDefault()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] font-medium text-bad hover:bg-bad-soft">
        <Ban className="size-3.5" /> Cancel shoot day
      </button>
    </ActionForm>
  );
}

function Row({ icon: Icon, k, v }: { icon: typeof MapPin; k: string; v: string }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-muted">
        <Icon className="size-3.5" /> {k}
      </dt>
      <dd className="font-medium text-ink">{v}</dd>
    </>
  );
}

function StatusButton({ id, status, label, primary, icon: Icon = Check, onDone }: { id: string; status: string; label: string; primary?: boolean; icon?: typeof Check; onDone: () => void }) {
  return (
    <ActionForm action={shootStatusAction} onSuccess={onDone} inlineError={false}>
      <input type="hidden" name="shootId" value={id} />
      <input type="hidden" name="status" value={status} />
      <Submit variant={primary ? "success" : "secondary"}>
        <Icon className="size-4" /> {label}
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------ Add / edit ------------------------------ */

function ShootForm({ day, people, brands, brandId, slot, onDone }: { day: string; people: Person[]; brands: BrandOpt[]; brandId?: string; slot?: ShootEntry; onDone: () => void }) {
  const s = slot?.slot;
  const [d, setD] = useState(s?.day ?? day);
  const [after, setAfter] = useState<"none" | "edit">((s?.after as "none" | "edit") ?? "none");
  return (
    <ActionForm action={saveShootAction} onSuccess={onDone} className="space-y-3.5">
      {s && <input type="hidden" name="shootId" value={s.id} />}
      <div>
        <label className="label" htmlFor="sh-title">
          What&rsquo;s being shot
        </label>
        <input id="sh-title" name="title" required defaultValue={s?.title ?? ""} placeholder="e.g. OG Hub opening event, Blissify podcast EP 3" className="field" autoFocus />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_100px_100px]">
        <div>
          <label className="label" htmlFor="sh-brand">
            Brand <span className="font-normal text-muted">(optional)</span>
          </label>
          <select id="sh-brand" name="brandId" defaultValue={s?.brandId ?? brandId ?? ""} className="field">
            <option value="">Not for a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Day</label>
          <DateInput name="day" value={d} onChange={setD} required aria-label="Day" className="w-full" />
        </div>
        <div>
          <label className="label" htmlFor="sh-from">
            From
          </label>
          <input id="sh-from" type="time" name="startTime" required defaultValue={s?.startTime ?? "14:00"} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="sh-to">
            To
          </label>
          <input id="sh-to" type="time" name="endTime" required defaultValue={s?.endTime ?? "16:00"} className="field" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="sh-loc">
            Where
          </label>
          <input id="sh-loc" name="location" defaultValue={s?.location ?? ""} placeholder="Studio, client's place…" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="sh-ppl">
            On camera
          </label>
          <input id="sh-ppl" type="number" min={0} max={999} name="people" defaultValue={s?.people ?? ""} placeholder="0" className="field" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Need name="rentals" label="To rent" placeholder="Lights, a lens…" value={s?.rentals ?? ""} ready={!!s?.rentalsReady} />
        <Need name="purchases" label="To buy" placeholder="Props, flowers…" value={s?.purchases ?? ""} ready={!!s?.purchasesReady} />
      </div>
      <div>
        <div className="label">Who goes</div>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <label key={p.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2.5 text-[13px] has-[:checked]:border-electric has-[:checked]:bg-electric-soft has-[:checked]:text-electric">
              <input type="checkbox" name="crewIds" value={p.id} defaultChecked={s?.crewIds.includes(p.id)} className="sr-only" />
              <Avatar name={p.name} size={20} badge={false} /> {p.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="sh-notes">
          Notes for the crew <span className="font-normal text-muted">(what to wear, who to call, what to bring)</span>
        </label>
        <textarea id="sh-notes" name="notes" rows={3} defaultValue={s?.notes ?? ""} placeholder="e.g. Come in white. Call Mostafa when you arrive." className="field" />
      </div>
      <div>
        <div className="label">After the shoot</div>
        <input type="hidden" name="after" value={after} />
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["none", "Just shooting", "It stays on the schedule as shot"],
              ["edit", "Send it for editing", "Marked shot → it goes to the editor"],
            ] as const
          ).map(([v, l, h]) => (
            <button key={v} type="button" onClick={() => setAfter(v)} className={clsx("cursor-pointer rounded-xl border p-2.5 text-left transition-colors", after === v ? "border-electric bg-electric-soft/60" : "border-line hover:border-line-strong")}>
              <div className="text-[13.5px] font-semibold">{l}</div>
              <div className="text-[12px] text-muted">{h}</div>
            </button>
          ))}
        </div>
        {after === "edit" && (
          <select name="editorId" required defaultValue={s?.editorId ?? ""} aria-label="Who edits it" className="field mt-2">
            <option value="" disabled>
              Who edits it?
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="cursor-pointer rounded-lg px-3 py-2 text-[14px] text-muted hover:text-ink">
          Cancel
        </button>
        <Submit>{s ? "Save" : "Add to the schedule"}</Submit>
      </div>
    </ActionForm>
  );
}

function Need({ name, label, placeholder, value, ready }: { name: string; label: string; placeholder: string; value: string; ready: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={`sh-${name}`}>
        {label}
      </label>
      <input id={`sh-${name}`} name={name} defaultValue={value} placeholder={placeholder} className="field" />
      <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
        <input type="checkbox" name={`${name}Ready`} defaultChecked={ready} className="size-4 accent-[var(--color-ok)]" /> Got it / ready
      </label>
    </div>
  );
}
