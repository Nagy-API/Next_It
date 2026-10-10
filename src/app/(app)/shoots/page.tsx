import Link from "next/link";
import { Suspense } from "react";
import { Camera, Hourglass } from "lucide-react";
import { ShootBoard } from "@/components/shoots";
import { weekStart } from "@/domain/shoot";
import { BrandMark } from "@/components/ui";
import { can } from "@/domain/permissions";
import { addDays, formatDay, isValidISODate, monthRange, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { getShootSchedule, getUnscheduled } from "@/server/shoots";

export const metadata = { title: "Shoot schedule" };

export default async function ShootsPage({ searchParams }: PageProps<"/shoots">) {
  const me = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "month" || sp.view === "list" ? sp.view : "week";
  const anchor = typeof sp.d === "string" && isValidISODate(sp.d) ? sp.d : todayISO();
  const [from, to] =
    view === "month"
      ? (() => {
          const r = monthRange(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)));
          return [addDays(r.start, -7), addDays(r.end, 7)];
        })()
      : view === "week"
        ? [weekStart(anchor), addDays(weekStart(anchor), 6)]
        : [anchor, addDays(anchor, 29)];
  const [all, unscheduled, people, brands] = await Promise.all([getShootSchedule(from, to), getUnscheduled(), getActivePeople(), getAllBrands()]);
  const brandSlug = typeof sp.brand === "string" ? sp.brand : "";
  const entries = brandSlug ? all.filter((e) => e.brand?.slug === brandSlug) : all;
  const waiting = brandSlug ? unscheduled.filter((u) => u.brand?.slug === brandSlug) : unscheduled;
  const liveBrands = brands.filter((b) => b.isActive);
  const today = todayISO();
  const todays = all.filter((e) => e.day === today && e.status !== "cancelled");

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#be185d] via-[#9d174d] to-[#4c0519] px-5 py-5 text-white sm:px-7">
        <Camera aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-40 text-white/10" />
        <h1 className="flex items-center gap-2.5 font-display text-[24px] font-bold sm:text-[28px]">🎬 Shoot schedule</h1>
        <p className="mt-1 max-w-[640px] text-[14px] text-white/80">Every shoot in one place: what we shoot each day, from when to when, who goes and what&rsquo;s needed. Shoots planned on content show up here by themselves.</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">
          {todays.length ? `Today: ${todays.length} shoot${todays.length > 1 ? "s" : ""} · ${todays.map((t) => `${t.start ?? ""} ${t.brand?.name ?? t.title}`.trim()).join(" · ")}` : "No shoot today"}
        </p>
      </header>
      <div className="grid gap-5 min-[1500px]:grid-cols-[minmax(0,1fr)_280px]">
        <Suspense fallback={null}>
          <ShootBoard
            entries={entries}
            view={view}
            anchor={anchor}
            people={people.map((p) => ({ id: p.id, name: p.name }))}
            brands={liveBrands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, color: b.color }))}
            canPlan={can.planShoot(me)}
            openId={typeof sp.open === "string" ? sp.open : null}
          />
        </Suspense>
        <aside className="card h-fit p-4">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
            <Hourglass className="size-4 text-warn" /> Waiting for a shoot day
            <span className="rounded-full bg-warn-soft px-2 text-[12px] text-warn">{waiting.length}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Reels at Pre-production without a day yet.</p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 min-[1500px]:grid-cols-1">
            {waiting.slice(0, 12).map((u) => (
              <li key={u.id}>
                <Link href={`/items/${u.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover">
                  {u.brand && <BrandMark name={u.brand.name} color={u.brand.color} size={18} />}
                  <span className="min-w-0 flex-1 truncate font-medium">{u.title}</span>
                  {u.postingDate && <span className={u.postingDate <= addDays(today, 3) ? "text-[11.5px] font-semibold text-bad" : "text-[11.5px] text-muted"}>{formatDay(u.postingDate)}</span>}
                </Link>
              </li>
            ))}
            {!waiting.length && <li className="text-[13px] text-muted">Nothing waiting 🎉</li>}
          </ul>
          {waiting.length > 12 && (
            <details className="group mt-1">
              <summary className="cursor-pointer list-none px-2 py-1.5 text-[13px] font-semibold text-electric hover:underline">
                <span className="group-open:hidden">Show {waiting.length - 12} more</span>
                <span className="hidden group-open:inline">Show less</span>
              </summary>
              <ul className="grid gap-1.5 sm:grid-cols-2 min-[1500px]:grid-cols-1">
                {waiting.slice(12).map((u) => (
                  <li key={u.id}>
                    <Link href={`/items/${u.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover">
                      {u.brand && <BrandMark name={u.brand.name} color={u.brand.color} size={18} />}
                      <span className="min-w-0 flex-1 truncate font-medium">{u.title}</span>
                      {u.postingDate && <span className="text-[11.5px] text-muted">{formatDay(u.postingDate)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
