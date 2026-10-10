import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { can } from "@/domain/permissions";
import { ALL_SPACE_TEMPLATES } from "@/domain/space-templates-extra";
import { PAGE_KINDS, emptyContent, isPageKind, type DocContent, type PageContent, type PageKind, type SheetContent, type WhiteboardContent } from "@/domain/pages";
import { PAGE_TEMPLATES } from "@/domain/page-templates";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { getWorkspace } from "@/server/settings";
import { visibleSpaces } from "@/server/spaces";
import { Gallery, type GalleryItem } from "./gallery";

export const metadata = { title: "New · Template library" };

/** A small picture of a page's content for its card (computed on the server, sent as plain numbers / text). */
function thumbOf(kind: PageKind, c: PageContent): GalleryItem["thumb"] {
  if (kind === "doc") return { kind, lines: (c as DocContent).blocks.slice(0, 8).map((b) => ({ type: b.type, text: b.text.slice(0, 80) })) };
  if (kind === "sheet") {
    const s = c as SheetContent;
    return { kind, cols: s.cols.slice(0, 5).map((x) => x.name), rows: s.rows.slice(0, 5).map((r) => s.cols.slice(0, 5).map((x) => (r.cells[x.id] ?? "").slice(0, 24))) };
  }
  const w = c as WhiteboardContent;
  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const xs = w.nodes.flatMap((n) => [n.x, n.x + n.w]);
  const ys = w.nodes.flatMap((n) => [n.y, n.y + n.h]);
  const box: [number, number, number, number] = xs.length ? [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) - Math.min(...xs) + 40, Math.max(...ys) - Math.min(...ys) + 40] : [0, 0, 400, 240];
  return {
    kind,
    nodes: w.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h, type: n.type, color: n.color })),
    edges: w.edges.flatMap((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return a && b ? [[a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2] as [number, number, number, number]] : [];
    }),
    box,
  };
}

const BLANK: Record<PageKind, { name: string; icon: string; description: string }> = {
  doc: { name: "Blank doc", icon: "📄", description: "An empty page. Type / for headings, lists, to-dos and more." },
  whiteboard: { name: "Blank whiteboard", icon: "🧩", description: "An empty board for sticky notes, shapes and arrows." },
  sheet: { name: "Blank sheet", icon: "📊", description: "Five columns and twelve rows, ready for anything." },
};

export default async function NewPage({ searchParams }: PageProps<"/spaces/new">) {
  const me = await requireUser();
  const ws = await getWorkspace();
  if (!ws.modules.spaces) redirect("/my-work");
  const sp = await searchParams;
  const canCreateSpaces = can.createSpaces(me);
  const kind = isPageKind(sp.kind) ? sp.kind : canCreateSpaces ? "space" : "doc";
  const [people, brands, spaces] = await Promise.all([getActivePeople(), getAllBrands(), visibleSpaces(me)]);

  const items: GalleryItem[] = [
    ...ALL_SPACE_TEMPLATES.map((t) => ({
      key: t.key,
      kind: "space" as const,
      category: t.category ?? "Project management",
      name: t.name,
      icon: t.icon,
      color: t.color,
      description: t.description,
      thumb: { kind: "space" as const, statuses: t.statuses.map((s) => ({ name: s.name, color: s.color })), fields: t.fields.map((f) => f.name), automations: t.automations.length },
    })),
    ...(Object.keys(PAGE_KINDS) as PageKind[]).map((k) => ({ key: `blank-${k}`, kind: k, category: "Start blank", ...BLANK[k], thumb: thumbOf(k, emptyContent(k)) })),
    ...PAGE_TEMPLATES.map((t) => ({ key: t.key, kind: t.kind, category: t.category, name: t.name, icon: t.icon, description: t.description, thumb: thumbOf(t.kind, t.build()) })),
  ];

  return (
    <div className="mx-auto max-w-[1240px]">
      <PageHeader eyebrow="Template library" title="What do you want to make?" subtitle="Pick a ready template (or start blank), give it a name, done. Everything can be changed afterwards." />
      <Gallery
        kind={kind}
        items={items}
        canCreateSpaces={canCreateSpaces}
        spaces={spaces.filter((s) => s.access.work).map((s) => ({ id: s.id, name: s.name, icon: s.icon, color: s.color }))}
        spaceId={typeof sp.space === "string" ? sp.space : null}
        people={people.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }))}
        brands={ws.modules.content ? brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name })) : []}
      />
    </div>
  );
}
