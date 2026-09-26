"use client";

import { Plus } from "lucide-react";
import { createProjectAction } from "@/app/actions";
import { ActionForm, Popover, Submit } from "@/components/client";
import { btn } from "@/components/ui";

export function NewProject({ clients, defaultClient }: { clients: string[]; defaultClient?: string }) {
  return (
    <Popover
      align="right"
      width={360}
      triggerClassName={btn(defaultClient ? "secondary" : "primary", defaultClient ? "sm" : "md")}
      trigger={
        <>
          <Plus className="size-4" /> {defaultClient ? "New project" : "New project"}
        </>
      }
    >
      {() => (
        <ActionForm action={createProjectAction} className="space-y-3">
          <div>
            <label className="label">Client</label>
            <input name="clientName" list="client-names" defaultValue={defaultClient} required placeholder="e.g. SINAI" className="field" />
            <datalist id="client-names">
              {clients.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="mt-1 text-[12px] text-muted">Existing clients are reused — returning clients keep all their history.</p>
          </div>
          <div>
            <label className="label">Project name</label>
            <input name="name" required placeholder="e.g. Summer Campaign" className="field" />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea name="notes" rows={2} className="field resize-none" placeholder="Scope, delivery format…" />
          </div>
          <Submit className="w-full">Create project</Submit>
        </ActionForm>
      )}
    </Popover>
  );
}
