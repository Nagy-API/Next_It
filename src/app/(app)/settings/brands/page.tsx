import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge, BrandDot } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { BrandActiveToggle, BrandCreatorSelect, BrandEdit, NewBrandForm } from "../forms";

export const metadata = { title: "Brands · Settings" };

export default async function BrandSettings() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/settings/account");
  const [brands, people] = await Promise.all([getAllBrands(), getActivePeople()]);
  const pickable = people.map((p) => ({ id: p.id, name: p.name }));
  const sorted = [...brands].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <NewBrandForm people={pickable} />
      <div className="card divide-y divide-line">
        <div className="grid grid-cols-[1fr_220px_150px] gap-4 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted max-md:hidden">
          <span>Brand</span>
          <span>Default content creator</span>
          <span />
        </div>
        {sorted.map((b) => (
          <div key={b.id} id={b.slug} className="grid scroll-mt-24 items-center gap-4 px-4 py-3 target:bg-electric-soft/50 md:grid-cols-[1fr_220px_150px]">
            <div className="flex items-center gap-2.5">
              <BrandDot color={b.color} className="size-2.5" />
              <Link href={`/brands/${b.slug}`} className="font-medium hover:text-electric">
                {b.name}
              </Link>
              {!b.isActive && <Badge tone="neutral">Inactive</Badge>}
              <BrandEdit brandId={b.id} name={b.name} color={b.color} />
            </div>
            <BrandCreatorSelect brandId={b.id} value={b.defaultCreatorId} people={pickable} />
            <div className="flex justify-end">
              <BrandActiveToggle brandId={b.id} active={b.isActive} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">Inactive brands move to the archive on the Brands page with all their months, items and history intact.</p>
    </div>
  );
}
