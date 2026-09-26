import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge, BrandDot } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { BrandActiveToggle, BrandDefaultSelect, BrandEdit, NewBrandForm } from "../forms";

export const metadata = { title: "Brands · Settings" };

export default async function BrandSettings() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/settings/account");
  const [brands, people] = await Promise.all([getAllBrands(), getActivePeople()]);
  const pickable = people.map((p) => ({ id: p.id, name: p.name }));
  const inTeam = (t: string) => people.filter((p) => (p.teams as string[]).includes(t)).map((p) => ({ id: p.id, name: p.name }));
  const cols = [
    { field: "defaultCreatorId", label: "Content", people: inTeam("content").length ? inTeam("content") : pickable },
    { field: "defaultMediaId", label: "Media", people: inTeam("media") },
    { field: "defaultDesignId", label: "Graphic design", people: inTeam("design") },
    { field: "defaultSocialId", label: "Social", people: inTeam("social") },
  ] as const;
  const sorted = [...brands].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <NewBrandForm people={pickable} />
      <div className="card overflow-x-auto">
        <p className="border-b border-line px-4 py-3 text-[13px] text-muted">
          New work on a brand goes to these people automatically. Anyone can still pass a single task to someone else. &ldquo;Whole team&rdquo; means everyone in that team sees it and one of them takes it.
        </p>
        <div className="min-w-[900px] divide-y divide-line">
          <div className="grid grid-cols-[minmax(200px,1fr)_repeat(4,150px)_140px] gap-3 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            <span>Brand</span>
            {cols.map((c) => (
              <span key={c.field}>{c.label}</span>
            ))}
            <span />
          </div>
          {sorted.map((b) => (
            <div key={b.id} id={b.slug} className="grid scroll-mt-24 grid-cols-[minmax(200px,1fr)_repeat(4,150px)_140px] items-center gap-3 px-4 py-3 target:bg-electric-soft/50">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandDot color={b.color} className="size-2.5" />
                <Link href={`/brands/${b.slug}`} className="truncate font-medium hover:text-electric">
                  {b.name}
                </Link>
                {!b.isActive && <Badge tone="neutral">Inactive</Badge>}
                <BrandEdit brandId={b.id} name={b.name} color={b.color} />
              </div>
              {cols.map((c) => (
                <BrandDefaultSelect key={c.field} brandId={b.id} field={c.field} value={b[c.field]} people={c.people} label={`${b.name}: default ${c.label}`} empty={c.field === "defaultCreatorId" ? "Nobody" : "Whole team"} />
              ))}
              <div className="flex justify-end">
                <BrandActiveToggle brandId={b.id} active={b.isActive} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[12.5px] text-muted">Inactive brands move to the archive on the Brands page with all their months, items and history intact.</p>
    </div>
  );
}
