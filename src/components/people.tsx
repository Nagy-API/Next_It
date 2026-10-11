"use client";

import { useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import {
  Annoyed,
  BatteryLow,
  CalendarDays,
  Coffee,
  Flame,
  HandHeart,
  Heart,
  Laugh,
  Megaphone,
  Meh,
  PartyPopper,
  Pin,
  PinOff,
  Plus,
  Rocket,
  Smile,
  SmilePlus,
  Star,
  Thermometer,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { kudosAction, moodAction, pinUpdateAction, postUpdateAction, reactAction, removeKudosAction, removeUpdateAction } from "@/app/people-actions";
import { formatRelative } from "@/lib/dates";
import { ActionForm, Modal, Popover, Submit, useToast } from "./client";
import { Avatar, btn } from "./ui";

export const REACTION_SET = ["👍", "❤️", "🎉", "😂", "🔥", "👏", "🙏", "😮"];
export type ReactionView = { emoji: string; count: number; mine: boolean; names: string[] };

/* ------------------------------------------------------------------ */
/* Reactions (Big updates, kudos, chat)                                 */
/* ------------------------------------------------------------------ */

export function applyReaction(list: ReactionView[], emoji: string, me: string): ReactionView[] {
  const cur = list.find((r) => r.emoji === emoji);
  if (!cur) return [...list, { emoji, count: 1, mine: true, names: [me] }];
  if (cur.mine) return list.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false, names: r.names.filter((n) => n !== me) } : r)).filter((r) => r.count > 0);
  return list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true, names: [...r.names, me] } : r));
}

export function Reactions({ kind, id, initial, me, light, className }: { kind: "announcement" | "chat" | "kudos"; id: string; initial: ReactionView[]; me: string; light?: boolean; className?: string }) {
  const [list, setOptimistic] = useOptimistic(initial, (cur: ReactionView[], emoji: string) => applyReaction(cur, emoji, me));
  const [, start] = useTransition();
  const push = useToast();
  const react = (emoji: string) =>
    start(async () => {
      setOptimistic(emoji);
      const r = await reactAction(kind, id, emoji);
      if (r && !r.ok) push({ kind: "error", text: r.error });
    });
  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", className)}>
      {list.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => react(r.emoji)}
          title={r.names.join(", ")}
          aria-pressed={r.mine}
          className={clsx(
            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-[13px] font-semibold tabular-nums transition active:scale-95",
            light
              ? r.mine
                ? "border-white/60 bg-white/30 text-white"
                : "border-white/20 bg-white/10 text-white/90 hover:bg-white/20"
              : r.mine
                ? "border-electric/50 bg-electric-soft text-electric"
                : "border-line bg-surface text-ink-2 hover:border-line-strong",
          )}
        >
          <span className="text-[15px] leading-none">{r.emoji}</span>
          {r.count}
        </button>
      ))}
      <Popover
        label="Add a reaction"
        width={232}
        triggerClassName={clsx(
          "grid size-7 cursor-pointer place-items-center rounded-full border transition",
          light ? "border-white/20 bg-white/10 text-white/80 hover:bg-white/20" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
        )}
        trigger={<SmilePlus className="size-4" />}
      >
        {(close) => (
          <div className="grid grid-cols-4 gap-1">
            {REACTION_SET.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  close();
                  react(e);
                }}
                className="grid h-11 cursor-pointer place-items-center rounded-lg text-[22px] transition hover:scale-110 hover:bg-hover"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Big updates                                                          */
/* ------------------------------------------------------------------ */

export type UpdateView = { id: string; title: string | null; text: string; emoji: string | null; color: string; pinned: boolean; createdAt: string; by: string; reactions: ReactionView[] };

/** A Big update's icon (stored as a short key; older updates stored an emoji, mapped here too). */
const UPDATE_ICONS: { key: string; icon: LucideIcon; label: string; old: string }[] = [
  { key: "news", icon: Megaphone, label: "News", old: "📣" },
  { key: "meeting", icon: CalendarDays, label: "Meeting", old: "📅" },
  { key: "party", icon: PartyPopper, label: "Celebration", old: "🎉" },
  { key: "thanks", icon: HandHeart, label: "Thank you", old: "🙏" },
  { key: "love", icon: Heart, label: "Love", old: "❤️" },
  { key: "hot", icon: Flame, label: "Hot", old: "🔥" },
  { key: "star", icon: Star, label: "Star", old: "⭐" },
  { key: "coffee", icon: Coffee, label: "Break", old: "☕" },
  { key: "alert", icon: TriangleAlert, label: "Heads up", old: "⚠️" },
  { key: "strong", icon: ThumbsUp, label: "Well done", old: "💪" },
  { key: "launch", icon: Rocket, label: "Launch", old: "🚀" },
  { key: "win", icon: Trophy, label: "Win", old: "🏆" },
];
function updateIcon(v: string | null) {
  return UPDATE_ICONS.find((x) => x.key === v || x.old === v) ?? UPDATE_ICONS[0];
}
const UPDATE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#e0569b", "#ef4444", "#0b1639"];

export function UpdatesBoard({ updates, canPost, me }: { updates: UpdateView[]; canPost: boolean; me: string }) {
  if (!updates.length && !canPost) return null;
  const [first, ...rest] = updates;
  return (
    <section id="updates" className="scroll-mt-24">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[18px] font-bold">
          <Megaphone className="size-5 text-electric" /> Big updates
        </h2>
        {canPost && <PostUpdateButton />}
      </div>
      {!updates.length ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 p-6 text-center text-[14px] text-muted">
          Nothing posted. Use <b className="text-ink">Post an update</b> for a meeting today, a big thank you, or anything the whole team must see.
        </div>
      ) : (
        <div className="space-y-3">
          {first && <UpdateCard u={first} canPost={canPost} me={me} big />}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rest.map((u) => (
                <UpdateCard key={u.id} u={u} canPost={canPost} me={me} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function UpdateCard({ u, canPost, me, big }: { u: UpdateView; canPost: boolean; me: string; big?: boolean }) {
  return (
    <article
      className={clsx("relative overflow-hidden rounded-2xl text-white", big ? "p-5 sm:p-6" : "p-5")}
      style={{ background: `color-mix(in srgb, ${u.color} 88%, #0b1639)` }}
    >
      <div className="relative flex items-start gap-4">
        <UpdateIcon v={u.emoji} big={big} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">
            {u.pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 normal-case tracking-normal text-white">
                <Pin className="size-3" /> Pinned
              </span>
            )}
            <span>
              {u.by} · {formatRelative(new Date(u.createdAt))}
            </span>
          </div>
          {u.title && <h3 className={clsx("mt-1 font-display font-bold leading-tight [text-wrap:balance]", big ? "text-[24px] sm:text-[28px]" : "text-[18px]")}>{u.title}</h3>}
          <p className={clsx("mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-white/95", big ? "text-[16px]" : "text-[14.5px]", !u.title && "font-semibold")}>{u.text}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Reactions kind="announcement" id={u.id} initial={u.reactions} me={me} light />
            {canPost && (
              <div className="flex items-center gap-1">
                <ActionForm action={pinUpdateAction} toast={false}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="pinned" value={u.pinned ? "0" : "1"} />
                  <button className="grid size-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/15 hover:text-white" title={u.pinned ? "Unpin" : "Pin to the top"} aria-label={u.pinned ? "Unpin" : "Pin to the top"}>
                    {u.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  </button>
                </ActionForm>
                <ActionForm action={removeUpdateAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="grid size-8 cursor-pointer place-items-center rounded-lg text-white/75 hover:bg-white/15 hover:text-white" title="Remove" aria-label="Remove this update">
                    <Trash2 className="size-4" />
                  </button>
                </ActionForm>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function UpdateIcon({ v, big }: { v: string | null; big?: boolean }) {
  const u = updateIcon(v);
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-xl border border-white/25", big ? "size-12" : "size-10")}>
      <u.icon className={big ? "size-6" : "size-5"} strokeWidth={1.8} />
    </span>
  );
}

export function PostUpdateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("news");
  const [color, setColor] = useState(UPDATE_COLORS[0]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("primary", "md", className)}>
        <Plus className="size-4" strokeWidth={2.5} /> Post an update
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Post a Big update" width={540}>
        <ActionForm action={postUpdateAction} onSuccess={() => setOpen(false)} resetOnSuccess>
          <input type="hidden" name="emoji" value={emoji} />
          <input type="hidden" name="color" value={color} />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {UPDATE_ICONS.map(({ key, icon: Icon, label }) => (
              <button key={key} type="button" onClick={() => setEmoji(key)} aria-pressed={emoji === key} title={label} aria-label={label} className={clsx("grid size-10 cursor-pointer place-items-center rounded-xl border transition", emoji === key ? "border-electric bg-electric-soft text-electric" : "border-line text-ink-2 hover:bg-hover")}>
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </button>
            ))}
          </div>
          <label className="block text-[13px] font-medium text-ink-2">
            Headline <span className="font-normal text-muted">(optional)</span>
            <input name="title" maxLength={120} className="field mt-1 w-full" placeholder="e.g. Team meeting today at 4 pm" />
          </label>
          <label className="mt-3 block text-[13px] font-medium text-ink-2">
            Message
            <textarea name="text" required rows={4} maxLength={1500} className="field mt-1 w-full resize-y py-2" placeholder="What does everyone need to know?" />
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[13px] font-medium text-ink-2">Colour</div>
              <div className="mt-1 flex gap-1.5">
                {UPDATE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={clsx("size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-surface transition", color === c && "ring-2 ring-electric")} style={{ background: c }} />
                ))}
              </div>
            </div>
            <label className="text-[13px] font-medium text-ink-2">
              Show for
              <select name="days" defaultValue="3" className="field mt-1 block">
                <option value="1">Today only</option>
                <option value="3">3 days</option>
                <option value="7">A week</option>
                <option value="14">Two weeks</option>
                <option value="0">Until I remove it</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-[13.5px]">
              <input type="checkbox" name="pinned" className="size-4 accent-[var(--color-electric)]" /> Pin to the top
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl p-4 text-white" style={{ background: `color-mix(in srgb, ${color} 88%, #0b1639)` }}>
            <UpdateIcon v={emoji} /> <span className="text-[13px] text-white/85">This is how it looks on the Overview. Everyone gets a notification.</span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btn("secondary")}>
              Cancel
            </button>
            <Submit>Post for everyone</Submit>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mood                                                                 */
/* ------------------------------------------------------------------ */

/** Moods are stored as the same values as before (MOODS in fun.ts) and shown as drawn faces with a word. */
const MOOD: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  "🤩": { label: "Amazing", icon: Laugh, color: "#059669" },
  "😄": { label: "Happy", icon: Smile, color: "#10b981" },
  "🙂": { label: "Good", icon: ThumbsUp, color: "#3b82f6" },
  "😐": { label: "Okay", icon: Meh, color: "#64748b" },
  "😴": { label: "Tired", icon: BatteryLow, color: "#8b5cf6" },
  "🤯": { label: "Busy", icon: Annoyed, color: "#d97706" },
  "🤒": { label: "Not well", icon: Thermometer, color: "#e11d48" },
};
const MOOD_LABEL = Object.fromEntries(Object.entries(MOOD).map(([k, v]) => [k, v.label]));

export function MoodCheck({ mine, team }: { mine: string | null; team: { userId: string; emoji: string; name: string }[] }) {
  const [cur, setCur] = useOptimistic(mine, (_: string | null, next: string | null) => next);
  const [, start] = useTransition();
  return (
    <div className="card p-4">
      <div className="font-display text-[15px] font-bold">How are you today?</div>
      <div className="mt-0.5 text-[12.5px] text-muted">One tap. The team sees it for today only.</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.keys(MOOD).map((e) => {
          const M = MOOD[e];
          return (
          <button
            key={e}
            type="button"
            title={MOOD_LABEL[e]}
            aria-label={MOOD_LABEL[e]}
            aria-pressed={cur === e}
            onClick={() =>
              start(async () => {
                const next = cur === e ? null : e;
                setCur(next);
                await moodAction(next);
              })
            }
            className={clsx("flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition", cur === e ? "border-current" : "border-line bg-surface text-ink-2 hover:bg-hover")}
            style={cur === e ? { color: M.color, background: `color-mix(in srgb, ${M.color} 10%, transparent)` } : undefined}
          >
            <M.icon className="size-4" style={{ color: M.color }} strokeWidth={1.9} /> {M.label}
          </button>
          );
        })}
      </div>
      {team.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {team.map((m) => (
            <span key={m.userId} className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-0.5 pl-0.5 pr-2 text-[12.5px]" title={MOOD_LABEL[m.emoji]}>
              <Avatar name={m.name} size={20} /> {m.name.split(" ")[0]} <MoodMark v={m.emoji} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MoodMark({ v }: { v: string }) {
  const M = MOOD[v];
  if (!M) return null;
  return <M.icon className="size-3.5" style={{ color: M.color }} strokeWidth={2} aria-label={M.label} />;
}

/* ------------------------------------------------------------------ */
/* Kudos                                                                */
/* ------------------------------------------------------------------ */

export type KudosView = { id: string; emoji: string; text: string; createdAt: string; fromId: string; toId: string; from: string; to: string; reactions: ReactionView[] };

export function KudosWall({ kudos, people, meId, me, canModerate }: { kudos: KudosView[]; people: { id: string; name: string }[]; meId: string; me: string; canModerate: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div id="kudos" className="card scroll-mt-24 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-display text-[15px] font-bold">Kudos wall</div>
          <div className="text-[12.5px] text-muted">Say thank you where everyone can see it.</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={btn("secondary", "sm")}>
          <HandHeart className="size-4" /> Give kudos
        </button>
      </div>
      {kudos.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sunken p-4 text-center text-[13px] text-muted">No kudos yet this week. Be the first to thank someone.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {kudos.slice(0, 6).map((k) => (
            <li key={k.id} className="rounded-xl border border-line bg-subtle p-3">
              <div className="flex items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e0569b]/12 text-[#e0569b]">
                  <HandHeart className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">
                    <b>{k.from}</b> <span className="text-muted">thanked</span> <b>{k.to}</b> <span className="text-[12px] text-faint">· {formatRelative(new Date(k.createdAt))}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px]">{k.text}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Reactions kind="kudos" id={k.id} initial={k.reactions} me={me} />
                    {(k.fromId === meId || canModerate) && (
                      <ActionForm action={removeKudosAction} toast={false}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="cursor-pointer rounded p-1 text-faint hover:text-bad" aria-label="Remove">
                          <Trash2 className="size-3.5" />
                        </button>
                      </ActionForm>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Give kudos" width={460}>
        <ActionForm action={kudosAction} onSuccess={() => setOpen(false)} resetOnSuccess>
          <label className="block text-[13px] font-medium text-ink-2">
            To
            <select name="toId" required className="field mt-1 w-full" defaultValue="">
              <option value="" disabled>
                Pick a teammate
              </option>
              {people
                .filter((p) => p.id !== meId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="mt-3 block text-[13px] font-medium text-ink-2">
            For what?
            <textarea name="text" required rows={3} maxLength={280} className="field mt-1 w-full resize-y py-2" placeholder="Thank you for staying late on the Blissify reel!" />
          </label>
          <div className="mt-4 flex justify-end">
            <Submit>Send kudos</Submit>
          </div>
        </ActionForm>
      </Modal>
    </div>
  );
}
