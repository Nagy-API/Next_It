import { can } from "@/domain/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageCheck, Plus } from "lucide-react";
import { BulkList } from "@/components/bulk-list";
import { ButtonLink, Empty, ProgressBar, Stat } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getProject, getWorkItems } from "@/server/queries";
import { ProjectEdit } from "./project-edit";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const p = await getProject((await params).id);
  return { title: p ? `${p.clientName} · ${p.name}` : "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [items, people] = await Promise.all([getWorkItems({ projectIds: [id], includeDone: true }), getActivePeople()]);
  const done = items.filter((i) => i.completedAt).length;
  const late = items.filter((i) => i.attention === "overdue").length;
  return (
    <div>
      <Link href={`/projects#${project.clientSlug}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
        <ArrowLeft className="size-4" /> {project.clientName}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.01em]">{project.name}</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-muted">{project.notes ?? "One-off project — delivered to the client, no publishing stage."}</p>
        </div>
        <div className="flex gap-2">
          {can.manageProjects(me) && (
            <>
              <ProjectEdit id={project.id} name={project.name} notes={project.notes} />
              <ButtonLink href={`/add?project=${project.id}`} variant="primary">
                <Plus className="size-4" /> Add deliverables
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="mt-6">
          <Empty icon={PackageCheck} title="No deliverables yet" action={<ButtonLink href={`/add?project=${project.id}`} variant="primary"><Plus className="size-4" /> Add deliverables</ButtonLink>}>
            Add the Reels or designs the client asked for. Each one goes Content → Production → Delivered.
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="card px-4 py-3.5">
              <div className="text-[12px] font-medium text-muted">Delivered</div>
              <div className="mt-1 font-display text-[28px] font-bold leading-none">
                {done}
                <span className="text-[16px] text-muted">/{items.length}</span>
              </div>
              <ProgressBar className="mt-3" segments={[{ value: done, color: "var(--color-ok)" }, { value: items.length - done, color: "#c3cde0" }]} />
            </div>
            <Stat label="In progress" value={items.length - done} />
            <Stat label="Late" value={late} tone={late ? "bad" : undefined} />
          </div>
          <div className="mt-6">
            <BulkList items={items} people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))} selectable={can.editContent(me)} canDeadline={can.setDeadline(me)} />
          </div>
        </>
      )}
    </div>
  );
}
