import Link from "next/link";
import { BarChart3, Users } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { DashboardForm } from "@/components/spaces/dashboard-form";
import { DashboardCards } from "@/components/spaces/dashboard-cards";
import { requireUser } from "@/server/auth";
import { WIDGETS, WIDGET_LIST, dashboardData, listDashboards } from "@/server/dashboards";
import { scopeOptions } from "@/server/dashboard-scopes";

export const metadata = { title: "Dashboards" };

export default async function DashboardsPage() {
  const me = await requireUser();
  const [mine, scopes, overview] = await Promise.all([listDashboards(me), scopeOptions(me), dashboardData(me, {})]);
  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <PageHeader title="Dashboards" subtitle="Live numbers for any space, folder or list. Build one in a few clicks; it always counts what's true right now." />
      {mine.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`} className="card flex items-start gap-3 p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid size-10 place-items-center rounded-xl bg-electric-soft text-electric">
                <BarChart3 className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-bold">{d.name}</span>
                <span className="block text-[12.5px] text-muted">
                  {(d.widgets as string[]).length} cards · by {d.ownerName}
                  {d.shared && (
                    <>
                      {" "}
                      · <Users className="inline size-3" /> shared
                    </>
                  )}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-[16px] font-bold">New dashboard</h2>
        <DashboardForm scopes={scopes} widgets={WIDGET_LIST.map((k) => ({ key: k, ...WIDGETS[k] }))} />
      </section>
      {overview ? (
        <section className="space-y-3">
          <h2 className="font-display text-[18px] font-bold">Everything you can see, right now</h2>
          <DashboardCards data={overview} widgets={["summary", "people", "overdue", "due_soon"]} />
        </section>
      ) : (
        <Empty icon={BarChart3} title="No space tasks yet">
          Dashboards count the tasks in Spaces. Create a space and add a few tasks first.
        </Empty>
      )}
    </div>
  );
}
