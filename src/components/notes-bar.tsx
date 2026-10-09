"use client";

import { useState } from "react";
import clsx from "clsx";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { noteAction, removeNoteAction } from "@/app/actions";
import { ActionForm, Modal, Submit } from "./client";
import { Avatar } from "./avatar";
import { btn } from "./ui";

type Note = { id: string; userId: string; name: string; text: string; color: string; createdAt: string; expiresAt: string };

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#f43f5e", "#0b1639"];
const QUICK = ["🔥", "☕", "🎬", "✨", "😂", "❤️", "👏", "🎉", "🙏", "😴", "💪", "🤯"];
const MAX = 80;

function left(expiresAt: string, now: number) {
  const h = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 3_600_000));
  return h <= 0 ? "ending" : `${h}h left`;
}

/** Instagram-style notes at the top of the Overview: a short line on a colour for 12 hours. */
export function NotesBar({ notes, meId, meName, now }: { notes: Note[]; meId: string; meName: string; now: number }) {
  const mine = notes.find((n) => n.userId === meId) ?? null;
  const others = notes.filter((n) => n.userId !== meId);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<Note | null>(null);

  return (
    <section aria-label="Team notes" className="-mx-1 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none]">
      <div className="flex min-w-max items-end gap-3.5">
        <NoteBubble
          name="Your note"
          person={meName}
          note={mine}
          onClick={() => setComposing(true)}
          empty={
            <span className="flex items-center gap-1 text-[12px] font-medium text-muted">
              <Plus className="size-3.5" /> What&rsquo;s up?
            </span>
          }
          now={now}
        />
        {others.map((n) => (
          <NoteBubble key={n.id} name={n.name} person={n.name} note={n} onClick={() => setViewing(n)} now={now} />
        ))}
        {others.length === 0 && <p className="max-w-[260px] self-center pb-5 text-[12.5px] leading-snug text-faint">Share a quick note with the team. It stays for 12 hours, then disappears.</p>}
      </div>

      <Modal open={composing} onClose={() => setComposing(false)} title={mine ? "Your note" : "Share a note"} width={420}>
        <Composer mine={mine} onDone={() => setComposing(false)} />
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ""} width={380}>
        {viewing && (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-fit max-w-full rounded-3xl px-5 py-4 text-[17px] font-semibold leading-snug text-white shadow-pop" style={{ background: viewing.color }}>
              {viewing.text}
            </div>
            <div className="flex items-center justify-center gap-2 text-[12.5px] text-muted">
              <Avatar name={viewing.name} size={22} badge={false} /> {viewing.name} · {left(viewing.expiresAt, now)}
            </div>
            <Link href="/chat" className={btn("secondary", "sm")} onClick={() => setViewing(null)}>
              <MessagesSquare className="size-3.5" /> Say something in team chat
            </Link>
          </div>
        )}
      </Modal>
    </section>
  );
}

function NoteBubble({ name, person, note, onClick, empty, now }: { name: string; person: string; note: Note | null; onClick: () => void; empty?: React.ReactNode; now: number }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-[88px] shrink-0 cursor-pointer flex-col items-center gap-1.5 text-center" title={note?.text}>
      <span
        className={clsx(
          "relative mb-1 flex min-h-[38px] w-full items-center justify-center rounded-2xl px-2 py-1.5 text-[12px] font-semibold leading-tight shadow-card transition-transform duration-150 group-hover:-translate-y-0.5",
          note ? "text-white" : "border border-dashed border-line-strong bg-white",
        )}
        style={note ? { background: note.color } : undefined}
      >
        <span className="line-clamp-2 break-words">{note ? note.text : empty}</span>
        <span aria-hidden className="absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px]" style={note ? { background: note.color } : { background: "white", borderRight: "1px dashed var(--color-line-strong)", borderBottom: "1px dashed var(--color-line-strong)" }} />
      </span>
      <span className="rounded-full p-[2.5px]" style={{ background: note ? `linear-gradient(135deg, ${note.color}, ${note.color}88)` : "var(--color-line)" }}>
        <span className="block rounded-full bg-white p-[2px]">
          <Avatar name={person} size={46} badge={false} />
        </span>
      </span>
      <span className="w-full truncate text-[12px] font-medium text-ink-2">{name}</span>
      {note && <span className="-mt-1.5 text-[10.5px] text-faint">{left(note.expiresAt, now)}</span>}
    </button>
  );
}

function Composer({ mine, onDone }: { mine: Note | null; onDone: () => void }) {
  const [text, setText] = useState(mine?.text ?? "");
  const [color, setColor] = useState(mine?.color ?? COLORS[0]);
  const count = [...text].length;
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="w-full max-w-[300px] rounded-3xl px-4 py-4 text-center text-[17px] font-semibold leading-snug text-white shadow-pop transition-colors" style={{ background: color }}>
          {text || <span className="opacity-60">Your note…</span>}
        </div>
      </div>
      <ActionForm action={noteAction} onSuccess={onDone} className="space-y-3">
        <input type="hidden" name="color" value={color} />
        <div>
          <textarea
            name="text"
            value={text}
            onChange={(e) => setText([...e.target.value].slice(0, MAX).join(""))}
            rows={2}
            autoFocus
            placeholder="e.g. Shooting all day 🎬 ping me after 5"
            aria-label="Your note"
            className="field resize-none text-[15px]"
          />
          <div className="mt-1 flex justify-between text-[11.5px] text-faint">
            <span>Visible to the team for 12 hours</span>
            <span className={clsx(count >= MAX && "text-bad")}>
              {count}/{MAX}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK.map((e) => (
            <button key={e} type="button" onClick={() => setText((t) => [...`${t}${e}`].slice(0, MAX).join(""))} className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-[19px] transition-transform hover:scale-110 hover:bg-canvas" aria-label={`Add ${e}`}>
              {e}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label="Colour"
              aria-pressed={color === c}
              className={clsx("size-7 cursor-pointer rounded-full ring-offset-2 transition-transform hover:scale-110", color === c && "ring-2 ring-ink")}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          {mine ? (
            <ActionFormRemove id={mine.id} onDone={onDone} />
          ) : (
            <span />
          )}
          <Submit disabled={!text.trim()}>{mine ? "Update note" : "Share"}</Submit>
        </div>
      </ActionForm>
    </div>
  );
}

/** Remove my note (a button outside the share form's submit). */
function ActionFormRemove({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const fd = new FormData();
        fd.set("noteId", id);
        await removeNoteAction(null, fd);
        setBusy(false);
        onDone();
      }}
      className={btn("ghost", "sm", "text-bad")}
    >
      <Trash2 className="size-3.5" /> Remove
    </button>
  );
}
