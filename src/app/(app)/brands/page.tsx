import Link from "next/link";
import { Archive, Plus } from "lucide-react";
import { BrandMark, ButtonLink, Empty, PageHeader, Person, ProgressBar } from "@/components/ui";
import { cairoDate, formatDay, monthLabel, todayISO, shiftMonth } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getAllBrands } from "@/server/cached";
import { getBrandMonthSummaries } from "@/server/queries";

export const metadata = { title: "Brands" };

export default async function BrandsPage() {
  await requireUser();
  const today = todayISO();
  const cur = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const nxt = shiftMonth(cur.year, cur.month, 1);
  const [brands, thisMonth, nextMonth] = await Promise.all([getAllBrands(), getBrandMonthSummaries(cur.year, cur.month), getBrandMonthSummaries(nxt.year, nxt.month)]);
  const active = brands.filter((b) => b.isActive);
  const archived = brands.filter((b) => !b.isActive);

  return (
    <div>
      <PageHeader
        title="Brands"
        subtitle="Monthly clients. Open a brand to see any month — current or years back."
        actions={
          <ButtonLink href="/settings/brands" variant="secondary">
            <Plus className="size-4" /> New brand
          </ButtonLink>
        }
      />
      {active.length === 0 ? (
        <Empty title="No active brands">Add your first brand in Settings.</Empty>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {active.map((b) => {
            const a = thisMonth.get(b.id) ?? [];
            const n = nextMonth.get(b.id) ?? [];
            return (
              <Link key={b.id} href={`/brands/${b.slug}`} className="grid items-center gap-4 px-5 py-4 transition-colors hover:bg-hover md:grid-cols-[1.3fr_1fr_1fr]">
                <div className="flex items-center gap-3">
                  <BrandMark name={b.name} color={b.color} logoUrl={b.logoUrl} size={36} className="!rounded-xl" />
                  <div>
                    <div className="font-display text-[16px] font-bold">{b.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      <Person name={b.creatorName} size={18} />
                    </div>
                  </div>
                </div>
                <MonthCell label={monthLabel(cur.year, cur.month)} items={a} />
                <MonthCell label={monthLabel(nxt.year, nxt.month)} items={n} />
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold">
            <Archive className="size-4 text-muted" /> Archive
            <span className="text-[13px] font-normal text-muted">— inactive brands. All their history stays available.</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((b) => (
              <Link key={b.id} href={`/brands/${b.slug}`} className="card flex items-center gap-3 px-4 py-3 opacity-80 hover:opacity-100">
                <BrandMark name={b.name} color={b.color} logoUrl={b.logoUrl} size={24} />
                <span className="flex-1 font-medium">{b.name}</span>
                <span className="text-[12px] text-muted">{b.archivedAt ? `Archived ${formatDay(cairoDate(b.archivedAt), { weekday: false })}` : "Archived"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MonthCell({ label, items: all }: { label: string; items: { completedAt: Date | null; current: { kind: string } | null; attention: string | null; extra: unknown }[] }) {
  // The plan's progress; extra tasks given on top are shown on their own.
  const items = all.filter((i) => !i.extra);
  const extras = all.length - items.length;
  const done = items.filter((i) => i.completedAt).length;
  const late = all.filter((i) => i.attention === "overdue").length;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        {all.length ? (
          <span>
            <b>{done}</b>
            <span className="text-muted">/{items.length}</span>
            {extras > 0 && <span className="ml-1.5 font-semibold text-[#b45309]">+{extras} extra</span>}
            {late > 0 && <span className="ml-2 font-semibold text-bad">{late} late</span>}
          </span>
        ) : (
          <span className="text-faint">not planned</span>
        )}
      </div>
      {all.length > 0 && (
        <ProgressBar
          className="mt-1.5"
          segments={[
            { value: done, color: "var(--color-ok)" },
            { value: items.filter((i) => i.current?.kind === "social").length, color: "var(--color-electric)" },
            { value: items.filter((i) => i.current && i.current.kind !== "social").length, color: "#c3cde0" },
          ]}
        />
      )}
    </div>
  );
}
