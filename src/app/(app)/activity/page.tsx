import Link from "next/link";
import { Lock } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Avatar, BrandDot, PageHeader, btn } from "@/components/ui";
import { cairoDate, formatDay, formatTime } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getAllBrands } from "@/server/cached";
import { getActivity, getPeople } from "@/server/queries";

export const metadata = { title: "History" };

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requireUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [people, brands] = await Promise.all([getPeople({ includeInactive: true }), getAllBrands()]);
  const brand = brands.find((b) => b.slug === get("brand"));
  const before = Number(get("before")) || undefined;
  const { rows, hasMore } = await getActivity({ actorId: get("person"), brandId: brand?.id, before, limit: 100 });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = cairoDate(r.at);
    groups.set(d, [...(groups.get(d) ?? []), r]);
  }
  const moreHref = () => {
    const p = new URLSearchParams();
    if (get("person")) p.set("person", get("person")!);
    if (get("brand")) p.set("brand", get("brand")!);
    p.set("before", String(rows[rows.length - 1].id));
    return `/activity?${p}`;
  };
  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        title="History"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> Every change, who made it and when. This record can&rsquo;t be edited or deleted.
          </span>
        }
      />
      <div className="mb-5">
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
            <div className="eyebrow mb-2">{formatDay(day)}</div>
            <div className="card divide-y divide-line">
              {list.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="w-11 shrink-0 pt-0.5 text-[12px] tabular-nums text-faint">{formatTime(a.at)}</span>
                  <Avatar name={a.actorName ?? "System"} size={22} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-ink-2">{a.summary}</span>
                    {a.itemId && a.itemTitle && (
                      <Link href={`/items/${a.itemId}`} className="ml-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-electric">
                        {a.brandColor && <BrandDot color={a.brandColor} />}
                        {a.itemTitle}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {rows.length === 0 && <p className="text-[13px] text-muted">No history for this filter.</p>}
      </div>
      {hasMore && (
        <div className="mt-6 text-center">
          <Link href={moreHref()} className={btn("secondary")}>
            Older changes
          </Link>
        </div>
      )}
    </div>
  );
}
