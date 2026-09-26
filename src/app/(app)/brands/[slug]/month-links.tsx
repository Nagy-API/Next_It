"use client";

import { useState } from "react";
import { ExternalLink, FolderOpen, Palette, Pencil } from "lucide-react";
import { planLinksAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "@/components/client";
import { btn } from "@/components/ui";

/** The month's Canva presentation and Drive folder: set once, used by every item that month. */
export function MonthLinks({
  brandId,
  year,
  month,
  canvaUrl,
  driveFolderUrl,
  canEdit,
  monthLabel,
}: {
  brandId: string;
  year: number;
  month: number;
  canvaUrl: string | null;
  driveFolderUrl: string | null;
  canEdit: boolean;
  monthLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !canvaUrl && !driveFolderUrl) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canvaUrl ? (
        <a href={canvaUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
          <Palette className="size-3.5 text-[#7d2ae8]" /> {monthLabel} Canva <ExternalLink className="size-3 text-faint" />
        </a>
      ) : null}
      {driveFolderUrl ? (
        <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
          <FolderOpen className="size-3.5 text-[#1a73e8]" /> Drive folder <ExternalLink className="size-3 text-faint" />
        </a>
      ) : null}
      {canEdit && (
        <button type="button" onClick={() => setOpen(true)} className={btn(canvaUrl && driveFolderUrl ? "ghost" : "primary", "sm", "cursor-pointer")}>
          <Pencil className="size-3.5" /> {canvaUrl || driveFolderUrl ? "Edit month links" : "Add the month's Canva & Drive links"}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`${monthLabel} links`}>
        <ActionForm action={planLinksAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="label" htmlFor="m-canva">
              Canva presentation for the whole month
            </label>
            <input id="m-canva" name="canvaUrl" defaultValue={canvaUrl ?? ""} placeholder="https://www.canva.com/design/…" className="field" />
            <p className="mt-1 text-[12px] text-muted">Every item opens this presentation at its own slide number — no link per slide needed.</p>
          </div>
          <div>
            <label className="label" htmlFor="m-drive">
              Google Drive folder for final files
            </label>
            <input id="m-drive" name="driveFolderUrl" defaultValue={driveFolderUrl ?? ""} placeholder="https://drive.google.com/drive/folders/…" className="field" />
            <p className="mt-1 text-[12px] text-muted">Media and Design see an &ldquo;Upload folder&rdquo; button on their tasks.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
              Cancel
            </button>
            <Submit>Save links</Submit>
          </div>
        </ActionForm>
      </Modal>
    </div>
  );
}
