import { can } from "@/domain/permissions";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Empty, PageHeader, ProgressBar } from "@/components/ui";
import { formatDay, cairoDate } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getClientsWithProjects } from "@/server/queries";
import { getActivePeople } from "@/server/cached";
import { getWorkspace } from "@/server/settings";
import { Avatar } from "@/components/ui";
import { NewProject } from "./new-project";

export const metadata = { title: "One-off projects" };

export default async function ProjectsPage() {
  const me = await requireUser();
  const BRAND = await getWorkspace();
  const [clients, people] = await Promise.all([getClientsWithProjects(), getActivePeople()]);
  const creators = people.filter((p) => p.teams.includes("content")).map((p) => ({ id: p.id, name: p.name }));
  const canCreate = can.manageProjects(me);
  return (
    <div>
      <PageHeader
        title="One-off projects"
        subtitle={`Clients who hire ${BRAND.name} for a specific job. We produce and deliver the files — no publishing stage.`}
        actions={canCreate ? <NewProject clients={clients.map((c) => c.name)} creators={creators} /> : undefined}
      />
      {clients.length === 0 ? (
        <Empty icon={Briefcase} title="No one-off clients yet">
          When a client like SINAI asks for 5 Reels, create a project here. If they come back later, add a new project under the same client.
        </Empty>
      ) : (
        <div className="space-y-5">
          {clients.map((c) => (
            <section key={c.id} id={c.slug} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <div>
                  <h2 className="font-display text-[17px] font-bold">{c.name}</h2>
                  <div className="text-[12.5px] text-muted">
                    {c.projects.length} project{c.projects.length === 1 ? "" : "s"}
                  </div>
                </div>
                {canCreate && <NewProject clients={[c.name]} defaultClient={c.name} creators={creators} />}
              </div>
              <div className="divide-y divide-line">
                {c.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="grid items-center gap-4 px-5 py-3 hover:bg-hover md:grid-cols-[1fr_240px_120px]">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                        Started {formatDay(cairoDate(p.createdAt), { weekday: false })}
                        {p.ownerName && (
                          <>
                            {" · "}
                            <Avatar name={p.ownerName} size={16} badge={false} /> {p.ownerName}
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[12.5px] text-muted">
                        {p.total ? `${p.done}/${p.total} delivered` : "No deliverables yet"}
                      </div>
                      {p.total > 0 && <ProgressBar segments={[{ value: p.done, color: "var(--color-ok)" }, { value: p.total - p.done, color: "#c3cde0" }]} />}
                    </div>
                    <div className="text-right text-[13px] font-medium text-electric">Open →</div>
                  </Link>
                ))}
                {c.projects.length === 0 && <div className="px-5 py-4 text-[13px] text-muted">No projects yet.</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
