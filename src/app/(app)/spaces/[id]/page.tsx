import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Settings2, Zap } from "lucide-react";
import { SpaceView } from "@/components/spaces/space-view";
import { Faces } from "@/components/spaces/controls";
import { btn } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { UserError } from "@/server/errors";
import { getSpacePage } from "@/server/spaces";
import type { FieldOption, FieldType } from "@/domain/spaces";

export async function generateMetadata({ params }: PageProps<"/spaces/[id]">) {
  const me = await requireUser();
  const page = await getSpacePage(me, (await params).id).catch(() => null);
  return { title: page?.space.name ?? "Space" };
}

export default async function SpacePage({ params, searchParams }: PageProps<"/spaces/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const page = await getSpacePage(me, id).catch((e) => {
    if (e instanceof UserError) return null;
    throw e;
  });
  if (!page) notFound();
  const people = (await getActivePeople()).map((p) => ({ id: p.id, name: p.name }));
  const view = sp.view === "board" || sp.view === "calendar" ? sp.view : "list";
  const listId = typeof sp.list === "string" && page.lists.some((l) => l.id === sp.list) ? sp.list : null;
  const activeAutos = page.automations.filter((a) => a.enabled).length;
  return (
    <div className="mx-auto max-w-[1320px]">
      <Link href="/spaces" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
        <ArrowLeft className="size-4" /> Spaces
      </Link>
      <header className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-[24px]" style={{ background: `color-mix(in srgb, ${page.space.color} 18%, white)` }}>
          {page.space.icon || page.space.name.slice(0, 1)}
        </span>
        <div className="min-w-[180px] flex-1">
          <h1 className="flex items-center gap-2 font-display text-[22px] sm:text-[26px] font-bold leading-tight tracking-[-0.01em]">
            {page.space.name}
            {page.space.isPrivate && <Lock className="size-4 text-muted" aria-label="Private" />}
          </h1>
          {page.space.description && <p className="truncate text-[13.5px] text-muted">{page.space.description}</p>}
        </div>
        <Faces ids={page.members.map((m) => m.userId)} people={people} size={28} max={5} />
        {activeAutos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700" title="Automations running in this space">
            <Zap className="size-3.5" /> {activeAutos} automation{activeAutos > 1 ? "s" : ""}
          </span>
        )}
        {page.access.manage && (
          <Link href={`/spaces/${id}/settings`} className={btn("secondary")}>
            <Settings2 className="size-4" /> Set up
          </Link>
        )}
      </header>
      <SpaceView
        space={{ id: page.space.id, name: page.space.name, color: page.space.color, icon: page.space.icon }}
        access={{ work: page.access.work, manage: page.access.manage }}
        statuses={page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))}
        folders={page.folders.map((f) => ({ id: f.id, name: f.name }))}
        lists={page.lists.map((l) => ({ id: l.id, name: l.name, folderId: l.folderId, color: l.color }))}
        fields={page.fields.map((f) => ({ id: f.id, name: f.name, type: f.type as FieldType, options: f.options as FieldOption[] }))}
        people={page.space.isPrivate ? people.filter((x) => page.members.some((m) => m.userId === x.id)) : people}
        tasks={page.tasks}
        meId={me.id}
        view={view}
        listId={listId}
      />
    </div>
  );
}
