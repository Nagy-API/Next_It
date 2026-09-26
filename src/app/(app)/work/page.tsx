import { can } from "@/domain/permissions";
import { Inbox } from "lucide-react";
import { BulkList } from "@/components/bulk-list";
import { FilterBar } from "@/components/filter-bar";
import { Empty, PageHeader } from "@/components/ui";
import type { ContentType, StageKind } from "@/db/schema";
import { STAGE_META, TYPE_META } from "@/domain/workflow";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands, getOpenItems } from "@/server/cached";
import type { WorkItem } from "@/server/queries";

export const metadata = { title: "All open work" };

const STATUS: Record<string, { label: string; test: (i: WorkItem) => boolean }> = {
  late: { label: "Late", test: (i) => i.attention === "overdue" },
  returned: { label: "Sent back", test: (i) => i.attention === "returned" },
  at_risk: { label: "Posting soon, not ready", test: (i) => i.attention === "at_risk" },
  unassigned: { label: "No owner", test: (i) => !!i.current && !i.current.assignee },
  due_soon: { label: "Due in 2 days", test: (i) => i.current?.health === "due_today" || i.current?.health === "due_soon" },
  blocked: { label: "Has a stage waiting on a late previous stage", test: (i) => i.stages.some((s) => s.health === "blocked") },
};
const ORDER = { overdue: 0, returned: 1, at_risk: 2, unassigned: 3, due_soon: 4 } as const;

export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const me = await requireUser();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const [open, people, brands] = await Promise.all([getOpenItems(), getActivePeople(), getAllBrands()]);

  let items = open;
  if (get("stage")) items = items.filter((i) => i.current?.kind === get("stage"));
  if (get("person") === "none") items = items.filter((i) => i.current && !i.current.assignee);
  else if (get("person")) items = items.filter((i) => i.current?.assignee?.id === get("person"));
  if (get("brand") === "projects") items = items.filter((i) => i.context === "project");
  else if (get("brand")) items = items.filter((i) => i.brand?.slug === get("brand"));
  if (get("type")) items = items.filter((i) => i.type === get("type"));
  if (STATUS[get("status")]) items = items.filter(STATUS[get("status")].test);
  items = [...items].sort((a, b) => (a.attention ? ORDER[a.attention] : 9) - (b.attention ? ORDER[b.attention] : 9) || (a.postingDate ?? "9").localeCompare(b.postingDate ?? "9"));

  const title = get("stage") ? `${STAGE_META[get("stage") as StageKind]?.label ?? "Work"}` : "All open work";

  return (
    <div>
      <PageHeader title={title} subtitle={`${items.length} of ${open.length} open items`} />
      <div className="mb-4">
        <FilterBar
          filters={[
            { name: "stage", label: "Stage", options: (["content", "media", "design", "social", "delivery"] as StageKind[]).map((k) => ({ value: k, label: STAGE_META[k].label })) },
            { name: "person", label: "With", options: [{ value: "none", label: "No owner" }, ...people.map((p) => ({ value: p.id, label: p.name }))] },
            { name: "brand", label: "Brand", options: [...brands.filter((b) => b.isActive).map((b) => ({ value: b.slug, label: b.name })), { value: "projects", label: "One-off projects" }] },
            { name: "type", label: "Type", options: (Object.keys(TYPE_META) as ContentType[]).map((t) => ({ value: t, label: TYPE_META[t].plural })) },
            { name: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
          ]}
        />
      </div>
      {items.length ? (
        <BulkList items={items} people={people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))} selectable={can.editContent(me)} canDeadline={can.setDeadline(me)} showContext />
      ) : (
        <Empty icon={Inbox} title="Nothing matches">Try clearing a filter.</Empty>
      )}
    </div>
  );
}
