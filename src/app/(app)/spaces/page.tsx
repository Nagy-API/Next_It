import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Lock, Plus, Sparkles } from "lucide-react";
import { ButtonLink, Empty, PageHeader } from "@/components/ui";
import { can } from "@/domain/permissions";
import { requireUser } from "@/server/auth";
import { getWorkspace } from "@/server/settings";
import { visibleSpaces } from "@/server/spaces";

export const metadata = { title: "Spaces" };

export default async function SpacesPage() {
  const me = await requireUser();
  if (!(await getWorkspace()).modules.spaces) redirect("/my-work");
  const list = await visibleSpaces(me);
  const canCreate = can.createSpaces(me);
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Spaces"
        subtitle="Your own workflows for any team: HR, sales, events, IT, client requests… Each space has its own steps, columns and automations."
        actions={
          <>
            <ButtonLink href="/dashboards" variant="secondary">
              <BarChart3 className="size-4" /> Dashboards
            </ButtonLink>
            {canCreate && (
              <ButtonLink href="/spaces/new" variant="primary">
                <Plus className="size-4" strokeWidth={2.5} /> New space
              </ButtonLink>
            )}
          </>
        }
      />
      {!list.length ? (
        <Empty icon={Sparkles} title="No spaces yet" action={canCreate ? <ButtonLink href="/spaces/new" variant="primary">Build your first workflow</ButtonLink> : undefined}>
          {canCreate ? "Pick a ready template (marketing, hiring, sales, events…) or start simple. It takes a minute." : "When someone adds you to a space, it shows here."}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <Link key={s.id} href={`/spaces/${s.id}`} className="card group relative overflow-hidden p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
              <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} />
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[22px]" style={{ background: `color-mix(in srgb, ${s.color} 15%, white)` }}>
                  {s.icon || s.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-display text-[17px] font-bold text-ink group-hover:text-electric">
                    <span className="truncate">{s.name}</span>
                    {s.isPrivate && <Lock className="size-3.5 shrink-0 text-muted" aria-label="Private" />}
                  </div>
                  {s.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 text-[12.5px]">
                <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold text-ink-2">{s.open} open</span>
                {s.late > 0 && <span className="rounded-full bg-bad-soft px-2 py-0.5 font-semibold text-bad">{s.late} overdue</span>}
                {s.role && <span className="ml-auto text-muted">{s.role === "admin" ? "Admin" : s.role === "viewer" ? "Viewer" : "Member"}</span>}
              </div>
            </Link>
          ))}
          {canCreate && (
            <Link href="/spaces/new" className="grid min-h-[150px] place-items-center rounded-2xl border-2 border-dashed border-line text-[14px] font-medium text-muted transition-colors hover:border-electric hover:text-electric">
              <span className="inline-flex items-center gap-1.5">
                <Plus className="size-4" /> New space
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
