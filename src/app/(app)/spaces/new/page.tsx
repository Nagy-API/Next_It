import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { can } from "@/domain/permissions";
import { SPACE_TEMPLATES } from "@/domain/spaces";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands } from "@/server/cached";
import { getWorkspace } from "@/server/settings";
import { NewSpaceForm } from "./form";

export const metadata = { title: "New space" };

export default async function NewSpacePage() {
  const me = await requireUser();
  if (!can.createSpaces(me)) redirect("/spaces");
  const [people, brands, ws] = await Promise.all([getActivePeople(), getAllBrands(), getWorkspace()]);
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader eyebrow="Spaces" title="Build a workflow" subtitle="Pick a starting point. Everything (statuses, columns, lists, automations) can be changed later." />
      <NewSpaceForm
        templates={SPACE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, icon: t.icon, color: t.color, description: t.description, statuses: t.statuses, fields: t.fields.map((f) => f.name), automations: t.automations.map((a) => a.name) }))}
        people={people.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }))}
        brands={ws.modules.content ? brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name })) : []}
      />
    </div>
  );
}
