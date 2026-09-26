import Link from "next/link";
import clsx from "clsx";
import { ArrowRightLeft, CalendarClock, CornerUpLeft, Lock, MessageSquare, Pencil, Send, Settings2 } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { BrandDot, PageHeader, btn } from "@/components/ui";
import { addDays, cairoDate, formatDay, formatTime, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getAllBrands } from "@/server/cached";
import { ACTIVITY_KINDS, activityKindOf, getActivity, getPeople, type ActivityKind } from "@/server/queries";

export const metadata = { title: "Activity log" };

const KIND_STYLE: Record<ActivityKind, { icon: typeof Send; cls: string }> = {
  work: { icon: ArrowRightLeft, cls: "bg-electric-soft text-electric" },
  back: { icon: CornerUpLeft, cls: "bg-back-soft text-back" },
  deadlines: { icon: CalendarClock, cls: "bg-warn-soft text-warn" },
  publishing: { icon: Send, cls: "bg-ok-soft text-ok" },
  comments: { icon: MessageSquare, cls: "bg-[#f1e8fd] text-[#6d28d9]" },
  edits: { icon: Pencil, cls: "bg-canvas text-ink-2" },
  admin: { icon: Settings2, cls: "bg-canvas text-muted" },
};

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requireUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [people, brands] = await Promise.all([getPeople({ includeInactive: true }), getAllBrands()]);
  const brand = brands.find((b) => b.slug === get("brand"));
  const kind = get("what") && get("what")! in ACTIVITY_KINDS ? (get("what") as ActivityKind) : undefined;
  const before = Number(get("before")) || undefined;
  const { rows, hasMore } = await getActivity({ actorId: get("person"), brandId: brand?.id, kind, before, limit: 100 });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = cairoDate(r.at);
    groups.set(d, [...(groups.get(d) ?? []), r]);
  }
  const today = todayISO();
  const dayTitle = (d: string) => (d === today ? `Today · ${formatDay(d)}` : d === addDays(today, -1) ? `Yesterday · ${formatDay(d)}` : formatDay(d));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const k of ["person", "brand", "what", "before"]) {
      const v = k in patch ? patch[k] : k === "before" ? undefined : get(k);
      if (v) p.set(k, v);
    }
    return `/activity${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        title="Activity log"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> Every change in the system — who, what and exactly when. Nobody can edit or delete it.
          </span>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={link({ what: undefined })} className={chip(!kind)}>
          Everything
        </Link>
        {(Object.keys(ACTIVITY_KINDS) as ActivityKind[]).map((k) => {
          const Icon = KIND_STYLE[k].icon;
          return (
            <Link key={k} href={link({ what: k })} className={chip(kind === k)}>
              <Icon className="size-3.5" /> {ACTIVITY_KINDS[k].label}
            </Link>
          );
        })}
      </div>
      <div className="mb-6">
        <FilterBar
          filters={[
            { name: "person", label: "Person", options: people.map((p) => ({ value: p.id, label: p.name })) },
            { name: "brand", label: "Brand", options: brands.map((b) => ({ value: b.slug, label: b.name })) },
          ]}
        />
      </div>
      <div className="space-y-6">
        {[...groups.entries()].map(([day, list]) => (
          <section key={day}>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="eyebrow">{dayTitle(day)}</div>
              <span className="text-[12px] text-faint">{list.length} changes</span>
            </div>
            <ol className="card divide-y divide-line">
              {list.map((a) => {
                const k = activityKindOf(a.action);
                const Icon = KIND_STYLE[k].icon;
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="w-11 shrink-0 pt-1 text-[12px] tabular-nums text-faint">{formatTime(a.at)}</span>
                    <span className={clsx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", KIND_STYLE[k].cls)} title={ACTIVITY_KINDS[k].label}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      {a.actorName && a.summary.startsWith(a.actorName) ? (
                        <span className="text-ink-2">
                          <b className="font-semibold text-ink">{a.actorName}</b>
                          {a.summary.slice(a.actorName.length)}
                        </span>
                      ) : (
                        <span className="text-ink-2">
                          <b className="font-semibold text-ink">{a.actorName ?? "System"}</b> · {a.summary}
                        </span>
                      )}
                      {a.itemId && a.itemTitle && (
                        <Link href={`/items/${a.itemId}`} className="ml-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-electric">
                          {a.brandColor && <BrandDot color={a.brandColor} />}
                          {a.itemTitle}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {rows.length === 0 && <p className="card px-4 py-10 text-center text-[13px] text-muted">Nothing recorded for this filter yet.</p>}
      </div>
      {hasMore && (
        <div className="mt-6 text-center">
          <Link href={link({ before: String(rows[rows.length - 1].id) })} className={btn("secondary")}>
            Older changes
          </Link>
        </div>
      )}
    </div>
  );
}

function chip(on: boolean) {
  return clsx(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
    on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink-2 hover:border-line-strong",
  );
}
