import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { getPage } from "@/server/pages";
import { PAGE_KINDS, type DocContent, type SheetContent, type WhiteboardContent } from "@/domain/pages";
import { DocEditor } from "@/components/pages/doc-editor";
import { SheetEditor } from "@/components/pages/sheet-editor";
import { WhiteboardEditor } from "@/components/pages/whiteboard";
import { PageBar } from "./bar";

export async function generateMetadata({ params }: PageProps<"/spaces/[id]/p/[pageId]">) {
  const me = await requireUser();
  const r = await getPage(me, (await params).pageId).catch(() => null);
  return { title: r?.page.title ?? "Page" };
}

/** One doc, whiteboard or sheet: a slim header, then the editor filling the screen. */
export default async function SpacePageView({ params }: PageProps<"/spaces/[id]/p/[pageId]">) {
  const me = await requireUser();
  const { pageId } = await params;
  const r = await getPage(me, pageId).catch((e) => {
    if (e instanceof UserError) return null;
    throw e;
  });
  if (!r) notFound();
  const { page, space, access } = r;
  const canEdit = access.work;
  return (
    <div className={page.kind === "doc" ? "mx-auto max-w-[1100px]" : ""}>
      <PageBar
        page={{ id: page.id, title: page.title, icon: page.icon, kind: page.kind, kindLabel: PAGE_KINDS[page.kind].label, updatedAt: page.updatedAt.toISOString(), updatedBy: r.updatedByName }}
        space={{ id: space.id, name: space.name, icon: space.icon, color: space.color }}
        canEdit={canEdit}
        canDelete={access.manage || page.createdById === me.id}
      />
      {page.kind === "doc" ? (
        <div className="card mt-4 min-h-[60vh] px-4 py-8 sm:px-10">
          <DocEditor pageId={page.id} initial={page.content as DocContent} canEdit={canEdit} />
        </div>
      ) : page.kind === "whiteboard" ? (
        <div className="mt-3 h-[calc(100dvh-12.5rem)] min-h-[420px]">
          <WhiteboardEditor pageId={page.id} initial={page.content as WhiteboardContent} canEdit={canEdit} />
        </div>
      ) : (
        <div className="mt-3 h-[calc(100dvh-12.5rem)] min-h-[420px]">
          <SheetEditor pageId={page.id} initial={page.content as SheetContent} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}
