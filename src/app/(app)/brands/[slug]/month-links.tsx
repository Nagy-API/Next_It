"use client";

import { useState } from "react";
import { ExternalLink, FolderOpen, Palette, Pencil } from "lucide-react";
import { planLinksAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "@/components/client";
import { btn } from "@/components/ui";
import { Attachments, type AttachmentItem } from "@/components/attachments";

/** The month's Canva presentation and Drive folder: set once, used by every item that month. */
export function MonthLinks({
  brandId,
  year,
  month,
  canvaUrl,
  driveFolderUrl,
  canEdit,
  monthLabel,
  planId,
  files,
  meId,
  manager,
}: {
  brandId: string;
  year: number;
  month: number;
  canvaUrl: string | null;
  driveFolderUrl: string | null;
  canEdit: boolean;
  monthLabel: string;
  /** The month plan (null until the month has items or links). */
  planId: string | null;
  files: AttachmentItem[];
  meId: string;
  manager: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !canvaUrl && !driveFolderUrl && !files.length) return null;
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
      {files.length > 0 && <Attachments items={files} meId={meId} manager={manager} canAdd={false} compact />}
      {canEdit && (
        <button type="button" onClick={() => setOpen(true)} className={btn(canvaUrl || driveFolderUrl || files.length ? "ghost" : "primary", "sm", "cursor-pointer")}>
          <Pencil className="size-3.5" /> {canvaUrl || driveFolderUrl || files.length ? "Month links & files" : "Add the month's Canva, Drive, links & files"}
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
        <div className="mt-5 border-t border-line pt-4">
          <div className="label">More links and files for {monthLabel}</div>
          <p className="mb-2 text-[12px] text-muted">A second Canva, the brief, a PDF, a moodboard… everyone working on this month sees them here.</p>
          {planId ? (
            <Attachments items={files} planId={planId} meId={meId} manager={manager} />
          ) : (
            <p className="rounded-lg bg-sunken px-3 py-2 text-[12.5px] text-muted">Save the month&rsquo;s links (or add the first item) first, then add more links and files here.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
