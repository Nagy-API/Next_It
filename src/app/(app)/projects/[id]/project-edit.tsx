"use client";

import { Pencil } from "lucide-react";
import { updateProjectAction } from "@/app/actions";
import { ActionForm, Popover, Submit } from "@/components/client";
import { btn } from "@/components/ui";

export function ProjectEdit({ id, name, notes }: { id: string; name: string; notes: string | null }) {
  return (
    <Popover align="right" width={340} triggerClassName={btn("ghost")} trigger={<><Pencil className="size-4" /> Edit</>}>
      {(close) => (
        <ActionForm action={updateProjectAction} onSuccess={close} className="space-y-3">
          <input type="hidden" name="projectId" value={id} />
          <div>
            <label className="label">Project name</label>
            <input name="name" defaultValue={name} required className="field" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea name="notes" defaultValue={notes ?? ""} rows={3} className="field resize-none" />
          </div>
          <Submit className="w-full">Save</Submit>
        </ActionForm>
      )}
    </Popover>
  );
}
