"use client";

import { useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { deleteProjectAction, updateProjectAction } from "@/app/actions";
import { ActionForm, Modal, Popover, Submit } from "@/components/client";
import { btn } from "@/components/ui";

export function ProjectEdit({
  id,
  name,
  notes,
  ownerId,
  creators,
}: {
  id: string;
  name: string;
  notes: string | null;
  ownerId: string | null;
  creators: { id: string; name: string }[];
}) {
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
            <label className="label" htmlFor={`po-${id}`}>
              Assigned to (content)
            </label>
            <select id={`po-${id}`} name="ownerId" defaultValue={ownerId ?? ""} className="field">
              <option value="">Nobody yet</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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

export function ProjectDelete({ id, name, deleted }: { id: string; name: string; deleted: boolean }) {
  const [open, setOpen] = useState(false);
  if (deleted)
    return (
      <ActionForm action={deleteProjectAction}>
        <input type="hidden" name="projectId" value={id} />
        <input type="hidden" name="deleted" value="0" />
        <Submit variant="secondary">
          <RotateCcw className="size-4" /> Restore project
        </Submit>
      </ActionForm>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("ghost", "md", "text-bad hover:bg-bad-soft")}>
        <Trash2 className="size-4" /> Delete
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Delete “${name}”?`}>
        <p className="text-[14px] text-ink-2">The project and its deliverables disappear from lists and task pages. The history is kept and an admin can restore it.</p>
        <ActionForm action={deleteProjectAction} className="mt-4 flex justify-end gap-2">
          <input type="hidden" name="projectId" value={id} />
          <input type="hidden" name="deleted" value="1" />
          <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
            Keep it
          </button>
          <Submit variant="primary" className="!bg-bad hover:!bg-[#b92f2f]">
            <Trash2 className="size-4" /> Delete project
          </Submit>
        </ActionForm>
      </Modal>
    </>
  );
}
