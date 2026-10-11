import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleDot, Columns3, Info, ListTree, ShieldAlert, Users, Workflow } from "lucide-react";
import { ArchiveSpace, Automations, Columns, DetailsForm, ListsAndFolders, Members, Statuses } from "@/components/spaces/setup";
import type { Action, FieldConfig, FieldOption, Trigger } from "@/domain/spaces";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { UserError } from "@/server/errors";
import { getWorkspace } from "@/server/settings";
import { getSpacePage } from "@/server/spaces";

export const metadata = { title: "Set up space" };

export default async function SpaceSettings({ params }: PageProps<"/spaces/[id]/settings">) {
  const me = await requireUser();
  const { id } = await params;
  const page = await getSpacePage(me, id).catch((e) => {
    if (e instanceof UserError) return null;
    throw e;
  });
  if (!page) notFound();
  if (!page.access.manage) redirect(`/spaces/${id}`);
  const [people, brands, ws] = await Promise.all([getActivePeople(), getAllBrands(), getWorkspace()]);
  const counts = Object.fromEntries(page.statuses.map((s) => [s.id, page.tasks.filter((t) => t.statusId === s.id).length]));
  const statuses = page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }));
  const sections = [
    { id: "statuses", icon: CircleDot, title: "Statuses", hint: "The steps a task goes through. “What it means” tells the system when the clock runs and when work is finished." },
    { id: "automations", icon: Workflow, title: "Automations", hint: "When something happens, do something by itself. Saves clicks and nobody forgets." },
    { id: "columns", icon: Columns3, title: "Columns", hint: "Extra information on every task of this space." },
    { id: "lists", icon: ListTree, title: "Folders & lists", hint: "How tasks are organised: by month, client, campaign, sprint…" },
    { id: "members", icon: Users, title: "Members", hint: "Admins set the space up, members work on tasks, viewers only see." },
    { id: "details", icon: Info, title: "Details", hint: "Name, icon, colour and who can see it." },
  ];
  return (
    <div className="mx-auto max-w-[920px]">
      <Link href={`/spaces/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
        <ArrowLeft className="size-4" /> {page.space.name}
      </Link>
      <h1 className="mt-2 font-display text-[26px] font-bold">
        {page.space.icon} Set up {page.space.name}
      </h1>
      <nav className="sticky top-16 z-10 -mx-1 mt-3 flex gap-1 overflow-x-auto bg-canvas/90 px-1 py-2 backdrop-blur [scrollbar-width:none]">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-2 hover:border-electric hover:text-electric">
            <s.icon className="size-3.5" /> {s.title}
          </a>
        ))}
      </nav>
      <div className="mt-4 space-y-5">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="card scroll-mt-32 p-5">
            <h2 className="flex items-center gap-2 font-display text-[16px] font-bold">
              <span className="grid size-7 place-items-center rounded-lg bg-electric-soft text-electric">
                <s.icon className="size-4" />
              </span>
              {s.title}
            </h2>
            <p className="mb-4 mt-1 text-[12.5px] text-muted">{s.hint}</p>
            {s.id === "statuses" && <Statuses spaceId={id} statuses={statuses} counts={counts} />}
            {s.id === "automations" && (
              <Automations
                spaceId={id}
                automations={page.automations.map((a) => ({ id: a.id, name: a.name, trigger: a.trigger as Trigger, actions: a.actions as Action[], enabled: a.enabled, runs: a.runs, lastRunAt: a.lastRunAt }))}
                statuses={statuses}
                lists={page.lists.map((l) => ({ id: l.id, name: l.name }))}
                people={people.map((p) => ({ id: p.id, name: p.name }))}
              />
            )}
            {s.id === "columns" && (
              <Columns
                spaceId={id}
                fields={page.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options as FieldOption[], config: f.config as FieldConfig | null }))}
                statuses={page.statuses.map((x) => ({ id: x.id, name: x.name, color: x.color }))}
              />
            )}
            {s.id === "lists" && <ListsAndFolders spaceId={id} folders={page.folders.map((f) => ({ id: f.id, name: f.name }))} lists={page.lists.map((l) => ({ id: l.id, name: l.name, folderId: l.folderId }))} />}
            {s.id === "members" && <Members spaceId={id} members={page.members} people={people.map((p) => ({ id: p.id, name: p.name }))} />}
            {s.id === "details" && (
              <DetailsForm
                space={{ id, name: page.space.name, icon: page.space.icon, color: page.space.color, description: page.space.description, isPrivate: page.space.isPrivate, brandId: page.space.brandId }}
                brands={ws.modules.content ? brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name })) : []}
              />
            )}
          </section>
        ))}
        <section className="card flex flex-wrap items-center justify-between gap-3 border-bad/20 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-bad">
              <ShieldAlert className="size-4" /> Archive
            </h2>
            <p className="text-[12.5px] text-muted">Hides the space for everyone. Tasks and history are kept.</p>
          </div>
          <ArchiveSpace spaceId={id} name={page.space.name} />
        </section>
      </div>
    </div>
  );
}
