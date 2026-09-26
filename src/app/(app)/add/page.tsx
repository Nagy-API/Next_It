import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, platforms, projects } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { parseMonthKey, shiftMonth, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { AddForm } from "./add-form";

export const metadata = { title: "Add content" };

export default async function AddPage({ searchParams }: PageProps<"/add">) {
  await requireUser();
  const sp = await searchParams;
  const [brands, people, platformRows, projectRows] = await Promise.all([
    getAllBrands(),
    getActivePeople(),
    db.select({ id: platforms.id, name: platforms.name }).from(platforms).where(eq(platforms.isActive, true)).orderBy(asc(platforms.sortOrder)),
    db.select({ id: projects.id, name: projects.name, clientName: clients.name }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).orderBy(asc(clients.name), asc(projects.name)),
  ]);
  const active = brands.filter((b) => b.isActive);
  const today = todayISO();
  // Default: next month (plans are usually prepared ahead), or the month in the URL.
  const m = parseMonthKey(typeof sp.m === "string" ? sp.m : null) ?? shiftMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1);
  const brand = active.find((b) => b.slug === sp.brand);
  const projectId = typeof sp.project === "string" ? sp.project : "";
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Add content" subtitle="Add one piece or a whole month at once. Everything else — stages, owners, timestamps — is set up for you." />
      <AddForm
        brands={active.map((b) => ({ id: b.id, name: b.name, slug: b.slug, color: b.color, defaultCreatorId: b.defaultCreatorId }))}
        projects={projectRows}
        people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))}
        platforms={platformRows}
        initial={{ mode: projectId ? "project" : "plan", brandId: brand?.id ?? "", year: m.year, month: m.month, projectId }}
      />
    </div>
  );
}
