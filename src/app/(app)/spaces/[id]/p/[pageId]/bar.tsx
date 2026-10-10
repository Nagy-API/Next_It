"use client";

import Link from "next/link";
import { ChevronRight, Copy, FileSpreadsheet, FileText, MoreHorizontal, Presentation, Trash2 } from "lucide-react";
import { archivePageAction, duplicatePageAction, renamePageAction } from "@/app/page-actions";
import { ActionForm, Popover } from "@/components/client";
import { InlineTitle } from "@/components/inline-edit";
import { formatRelative } from "@/lib/dates";

const ICONS = ["📄", "📝", "📋", "📌", "🎬", "📸", "🎨", "💡", "🧠", "🗺️", "📊", "💰", "🗓️", "✅", "🚀", "🎯", "🤝", "⭐", "🔥", "❤️"];
const KIND_ICON = { doc: FileText, whiteboard: Presentation, sheet: FileSpreadsheet } as const;

/** The slim header of a page: where it lives, its icon and name (click to change), who changed it last, and a menu. */
export function PageBar({
  page,
  space,
  canEdit,
  canDelete,
}: {
  page: { id: string; title: string; icon: string | null; kind: "doc" | "whiteboard" | "sheet"; kindLabel: string; updatedAt: string; updatedBy: string | null };
  space: { id: string; name: string; icon: string | null; color: string };
  canEdit: boolean;
  canDelete: boolean;
}) {
  const KindIcon = KIND_ICON[page.kind];
  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 text-[13px] text-muted" aria-label="Where this page is">
        <Link href={`/spaces/${space.id}`} className="inline-flex items-center gap-1.5 hover:text-electric">
          <span className="grid size-5 place-items-center rounded-md text-[11px] text-white" style={{ background: space.color }}>
            {space.icon || space.name.slice(0, 1)}
          </span>
          {space.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="inline-flex items-center gap-1">
          <KindIcon className="size-3.5" /> {page.kindLabel}
        </span>
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Popover
            label="Change the icon"
            width={264}
            triggerClassName="grid size-11 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-[24px] transition hover:border-line-strong"
            trigger={page.icon || <KindIcon className="size-5 text-muted" />}
          >
            {(close) => (
              <div className="grid grid-cols-5 gap-1">
                {ICONS.map((e) => (
                  <ActionForm key={e} action={renamePageAction} toast={false} onSuccess={close}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="icon" value={e} />
                    <button className="grid size-11 cursor-pointer place-items-center rounded-lg text-[22px] hover:bg-hover">{e}</button>
                  </ActionForm>
                ))}
              </div>
            )}
          </Popover>
        ) : (
          <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-[24px]">{page.icon || <KindIcon className="size-5 text-muted" />}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] sm:text-[26px]">
            {canEdit ? (
              <InlineTitle value={page.title} fields={{ pageId: page.id }} action={renamePageAction} label="Rename" inputClassName="!h-10 !text-[20px] font-bold">
                <span className="truncate">{page.title}</span>
              </InlineTitle>
            ) : (
              page.title
            )}
          </h1>
          <div className="text-[12.5px] text-muted">
            Edited {formatRelative(new Date(page.updatedAt))}
            {page.updatedBy ? ` by ${page.updatedBy}` : ""}
            {!canEdit && " · view only"}
          </div>
        </div>
        {canEdit && (
          <Popover label="More" width={220} align="right" triggerClassName="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-ink-2 hover:border-line-strong" trigger={<MoreHorizontal className="size-5" />}>
            {(close) => (
              <div className="-m-1.5 space-y-0.5">
                <ActionForm action={duplicatePageAction} onSuccess={close}>
                  <input type="hidden" name="pageId" value={page.id} />
                  <button className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-hover">
                    <Copy className="size-4 text-muted" /> Make a copy
                  </button>
                </ActionForm>
                {canDelete && (
                  <ActionForm action={archivePageAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <button
                      onClick={(e) => !confirm(`Delete “${page.title}”? It disappears for everyone.`) && e.preventDefault()}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-bad hover:bg-bad-soft"
                    >
                      <Trash2 className="size-4" /> Delete
                    </button>
                  </ActionForm>
                )}
              </div>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
}
