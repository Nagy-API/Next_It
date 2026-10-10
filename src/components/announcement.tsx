"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Megaphone, Pencil, X } from "lucide-react";
import { clearAnnouncementAction, postAnnouncementAction } from "@/app/actions";
import { ActionForm, Popover, Submit } from "./client";

export type Announcement = { id: string; text: string; emoji: string | null; color: string; by: string };

const EMOJIS = ["📣", "🎉", "🔥", "💪", "⭐", "☕", "🚀", "❤️", "⚠️", "🙏"];
const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#e0569b", "#0b1639"];

/** The message of the day: one line at the top of every page. Each person can hide it until the next one. */
export function AnnouncementStrip({ a, canPost }: { a: Announcement | null; canPost: boolean }) {
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(localStorage.getItem("motd-hidden"));
    } catch {}
  }, []);
  if (!a || hidden === a.id) return null;
  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6 lg:px-8">
      <div
        role="status"
        className="relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-white shadow-[0_10px_30px_-18px_rgb(11_22_57/0.6)]"
        style={{ background: `linear-gradient(110deg, ${a.color} 0%, color-mix(in srgb, ${a.color} 70%, #0b1639) 100%)` }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 size-32 rounded-full bg-white/10" />
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 text-[20px]">{a.emoji || "📣"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Message of the day · {a.by}</div>
          <p className="text-[14.5px] font-semibold leading-snug">{a.text}</p>
        </div>
        {canPost && <PostButton current={a} light />}
        <button
          type="button"
          onClick={() => {
            setHidden(a.id);
            try {
              localStorage.setItem("motd-hidden", a.id);
            } catch {}
          }}
          className="relative cursor-pointer rounded-lg p-1.5 text-white/70 hover:bg-white/15 hover:text-white"
          aria-label="Hide the message"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Post (or replace / clear) the message of the day. */
export function PostButton({ current, light }: { current?: Announcement | null; light?: boolean }) {
  const [emoji, setEmoji] = useState(current?.emoji ?? "📣");
  const [color, setColor] = useState(current?.color ?? COLORS[0]);
  return (
    <Popover
      label="Message of the day"
      width={340}
      align="right"
      triggerClassName={clsx("relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium", light ? "text-white/80 hover:bg-white/15 hover:text-white" : "border border-line bg-white text-ink-2 hover:border-electric hover:text-electric")}
      trigger={current ? <Pencil className="size-4" aria-label="Change the message" /> : <><Megaphone className="size-4" /> Message of the day</>}
    >
      {(close) => (
        <div className="space-y-3 p-3">
          <ActionForm action={postAnnouncementAction} onSuccess={close} className="space-y-3">
            <input type="hidden" name="emoji" value={emoji} />
            <input type="hidden" name="color" value={color} />
            <label className="label" htmlFor="motd-text">
              A line for the whole team
            </label>
            <textarea id="motd-text" name="text" required maxLength={280} rows={3} defaultValue={current?.text ?? ""} placeholder="e.g. Big shoot for Vanilla Roza today. Thank you all! 💙" className="field w-full" autoFocus />
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)} className={clsx("grid size-8 cursor-pointer place-items-center rounded-lg text-[16px]", emoji === e ? "bg-electric-soft ring-2 ring-electric/40" : "hover:bg-canvas")}>
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={clsx("size-6 cursor-pointer rounded-full", color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />
              ))}
              <select name="hours" defaultValue="24" className="field field-sm ml-auto h-8 w-auto" aria-label="How long">
                <option value="12">12 hours</option>
                <option value="24">Today (24 h)</option>
                <option value="72">3 days</option>
                <option value="168">A week</option>
                <option value="0">Until cleared</option>
              </select>
            </div>
            <Submit className="w-full">Post for everyone</Submit>
          </ActionForm>
          {current && (
            <ActionForm action={clearAnnouncementAction} onSuccess={close} inlineError={false}>
              <button type="submit" className="w-full cursor-pointer rounded-lg py-1.5 text-[13px] font-medium text-bad hover:bg-bad-soft">
                Clear the message
              </button>
            </ActionForm>
          )}
        </div>
      )}
    </Popover>
  );
}
