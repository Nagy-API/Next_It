import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { DashboardCards } from "@/components/spaces/dashboard-cards";
import { DashboardForm, DeleteDashboard } from "@/components/spaces/dashboard-form";
import { Empty } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { WIDGETS, WIDGET_LIST, dashboardData, getDashboard, type Scope, type WidgetKey } from "@/server/dashboards";
import { scopeOptions, scopeValue } from "@/server/dashboard-scopes";

export default async function DashboardPage({ params }: PageProps<"/dashboards/[id]">) {
  const me = await requireUser();
  const d = await getDashboard(me, (await params).id);
  if (!d) notFound();
  const scope = d.scope as Scope;
  const [data, scopes] = await Promise.all([dashboardData(me, scope), scopeOptions(me)]);
  const mine = d.ownerId === me.id || me.isAdmin;
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Link href="/dashboards" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
        <ArrowLeft className="size-4" /> Dashboards
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold">{d.name}</h1>
          <p className="text-[13.5px] text-muted">{scopes.find((s) => s.value === scopeValue(scope))?.label ?? "Everything you can see"} · live</p>
        </div>
        {mine && <DeleteDashboard id={d.id} />}
      </div>
      {data ? (
        <DashboardCards data={data} widgets={(d.widgets as string[]).filter((w): w is WidgetKey => w in WIDGETS)} />
      ) : (
        <Empty title="Nothing to count yet">There are no tasks here yet (or you can&rsquo;t see this space).</Empty>
      )}
      {mine && (
        <details className="card p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-[15px] font-bold">
            <Pencil className="size-4 text-electric" /> Change this dashboard
          </summary>
          <div className="mt-4">
            <DashboardForm scopes={scopes} widgets={WIDGET_LIST.map((k) => ({ key: k, ...WIDGETS[k] }))} initial={{ id: d.id, name: d.name, scope: scopeValue(scope), widgets: d.widgets as string[], shared: d.shared }} />
          </div>
        </details>
      )}
    </div>
  );
}
