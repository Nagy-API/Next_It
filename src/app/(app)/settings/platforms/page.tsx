import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { platforms } from "@/db/schema";
import { Badge } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { NewPlatformForm, PlatformControls } from "../forms";
import { can } from "@/domain/permissions";

export const metadata = { title: "Platforms · Settings" };

export default async function PlatformSettings() {
  const me = await requireUser();
  if (!can.managePlatforms(me)) redirect("/settings/account");
  const rows = await db.select().from(platforms).orderBy(asc(platforms.sortOrder));
  return (
    <div className="max-w-2xl space-y-4">
      <NewPlatformForm />
      <div className="card divide-y divide-line">
        {rows.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className={p.isActive ? "flex-1 font-medium" : "flex-1 font-medium text-muted"}>{p.name}</span>
            {!p.isActive && <Badge tone="neutral">Disabled</Badge>}
            <PlatformControls id={p.id} name={p.name} active={p.isActive} />
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">Disabled platforms disappear from new content, but items that already used them keep their status and links.</p>
    </div>
  );
}
