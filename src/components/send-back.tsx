"use client";

import { useState } from "react";
import clsx from "clsx";
import { CornerUpLeft } from "lucide-react";
import { commentAction, returnAction } from "@/app/actions";
import type { StageKind } from "@/db/schema";
import { STAGE_COLOR, STAGE_META } from "@/domain/workflow";
import { ActionForm, Modal, Submit } from "./client";
import { btn } from "./ui";

import type { BackTarget } from "@/domain/back-targets";
type P = { id: string; name: string; teams: string[] };

/**
 * "Send back" on every step that has an earlier one: pick the step, who fixes it (whoever did it, someone else
 * in that team, or "I'll fix it"), and what to change. They see "Changes requested" with the note.
 */
export function SendBack({
  itemId,
  targets,
  people,
  meId,
  manager,
  label = "Send back",
  size = "md",
  giver,
}: {
  itemId: string;
  targets: BackTarget[];
  people: P[];
  meId: string;
  manager?: boolean;
  label?: string;
  size?: "sm" | "md";
  /** Who gave this work (extra tasks): on its first step there's no earlier step, so it goes back to them with a note. */
  giver?: { id: string; name: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StageKind | undefined>(targets[targets.length - 1]?.kind);
  const [who, setWho] = useState("");
  if ((!targets.length || !target) && giver && giver.id !== meId) return <BackToGiver itemId={itemId} giver={giver} size={size} />;
  if (!targets.length || !target) return null;
  const t = targets.find((x) => x.kind === target)!;
  const team = STAGE_META[target].team;
  const teamPeople = people.filter((p) => p.id !== meId && p.id !== t.owner?.id && (manager || (team && p.teams.includes(team))));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("secondary", size, "cursor-pointer")}>
        <CornerUpLeft className="size-4 text-back" /> {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Send it back for changes">
        <ActionForm action={returnAction} onSuccess={() => setOpen(false)} className="space-y-3.5">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="target" value={target} />
          <div>
            <div className="label">Which step needs to fix it?</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {targets.map((x) => {
                const on = target === x.kind;
                const c = STAGE_COLOR[x.kind];
                return (
                  <button
                    key={x.kind}
                    type="button"
                    onClick={() => {
                      setTarget(x.kind);
                      setWho("");
                    }}
                    aria-pressed={on}
                    className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-[14px] transition-colors", on ? "border-back bg-back-soft" : "border-line hover:border-line-strong")}
                  >
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.fg }} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-tight">{STAGE_META[x.kind].label}</span>
                      <span className="block truncate text-[12px] text-muted">{x.owner?.name ?? "the team"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`sb-who-${itemId}`}>
              Who fixes it?
            </label>
            <select id={`sb-who-${itemId}`} name="assigneeId" value={who} onChange={(e) => setWho(e.target.value)} className="field">
              <option value="">{t.owner ? `${t.owner.name} (did this step)` : `Anyone in ${STAGE_META[target].label}`}</option>
              {t.owner?.id !== meId && <option value="me">Me, I&rsquo;ll fix it</option>}
              {teamPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`note-${itemId}`}>
              What needs to change?
            </label>
            <textarea id={`note-${itemId}`} name="note" rows={3} placeholder="e.g. The hook needs to be stronger" className="field resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
              Cancel
            </button>
            <Submit variant="primary" className="!bg-back hover:!bg-[#c9560c]">
              <CornerUpLeft className="size-4" /> Send back to {STAGE_META[target].label}
            </Submit>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/** First step of work someone gave: "Send back" asks them, with a note; they get a notification and the comment waits for their reply. */
function BackToGiver({ itemId, giver, size }: { itemId: string; giver: { id: string; name: string }; size: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("secondary", size, "cursor-pointer")}>
        <CornerUpLeft className="size-4 text-back" /> Send back
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Send back to ${giver.name}`}>
        <ActionForm action={commentAction} onSuccess={() => setOpen(false)} className="space-y-3.5">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="mentionUserId" value={giver.id} />
          <p className="text-[13px] text-muted">This is the first step, so it goes back to {giver.name}, who gave it. Say what you need; they get a notification and reply here.</p>
          <textarea name="body" required rows={3} autoFocus className="field resize-y" placeholder="e.g. I need the client's brief before I can start" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
              Cancel
            </button>
            <Submit>
              <CornerUpLeft className="size-4" /> Send back
            </Submit>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
