"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AtSign, MessagesSquare, SendHorizontal, Smile, SmilePlus, Trash2 } from "lucide-react";
import { chatDeleteAction, chatPostAction } from "@/app/actions";
import { reactAction } from "@/app/people-actions";
import { Avatar } from "@/components/avatar";
import { Popover, useToast } from "@/components/client";
import { REACTION_SET, applyReaction, type ReactionView } from "@/components/people";

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  mentions: string[];
  itemId: string | null;
  itemTitle: string | null;
};
type P = { id: string; name: string; title: string | null; seenAt: string | null };

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });

/** The emoji button: the faces and signs a team actually uses, in a few groups. */
const EMOJI_GROUPS: { label: string; list: string[] }[] = [
  { label: "Faces", list: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😇", "🙂", "😉", "😅", "😬", "🤔", "🤨", "😐", "😴", "😮", "😱", "😭", "😢", "😡", "🤯", "🤒", "🫡", "🤗", "🙈"] },
  { label: "Hands", list: ["👍", "👎", "👏", "🙌", "🙏", "💪", "👌", "✌️", "🤞", "👋", "🤝", "✋", "👀", "🫶"] },
  { label: "Hearts", list: ["❤️", "💙", "💜", "💚", "💛", "🧡", "🖤", "🤍", "💔", "💯"] },
  { label: "Work", list: ["🔥", "⭐", "✨", "🎉", "🎊", "🚀", "✅", "❌", "⚠️", "⏰", "📅", "📌", "📣", "💡", "🎬", "📸", "🎨", "✍️", "📱", "☕", "🍕", "🏆", "🎯", "💰"] },
];

function seenText(iso: string | null) {
  if (!iso) return "not seen yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `seen ${Math.max(mins, 1)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `seen ${h} h ago`;
  const d = Math.round(h / 24);
  return `seen ${d} day${d > 1 ? "s" : ""} ago`;
}

/** Highlight @mentions and turn links into links. */
function Body({ text, people, meName, mine }: { text: string; people: P[]; meName: string; mine: boolean }) {
  const names = [...people.map((p) => p.name), ...people.map((p) => p.name.split(" ")[0]), "everyone"].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(@(?:${escaped.join("|")})\\b|https?://\\S+)`, "gi");
  const parts = text.split(re);
  // A message that's only emoji shows them big.
  const onlyEmoji = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u.test(text) && !/\d/.test(text);
  if (onlyEmoji) return <span className="text-[34px] leading-tight">{text}</span>;
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("@")) {
          const forMe = p.slice(1).toLowerCase() === meName.toLowerCase() || p.slice(1).toLowerCase() === meName.split(" ")[0].toLowerCase() || p.toLowerCase() === "@everyone";
          return (
            <span key={i} className={clsx("rounded px-1 font-semibold", mine ? "bg-white/20 text-white" : forMe ? "bg-[#fff1c2] text-[#8a5a00]" : "bg-electric-soft text-[#1d5fd1]")}>
              {p}
            </span>
          );
        }
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={clsx("break-all underline", mine ? "text-white" : "text-electric")}>
              {p}
            </a>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function ChatRoom({
  me,
  initial,
  initialReactions,
  initialOnline,
  people,
  company,
}: {
  me: { id: string; name: string; manager: boolean };
  initial: Msg[];
  initialReactions: Record<string, ReactionView[]>;
  initialOnline: string[];
  people: P[];
  company: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [reactions, setReactions] = useState<Record<string, ReactionView[]>>(initialReactions);
  const [online, setOnline] = useState<string[]>(initialOnline);
  const [typing, setTyping] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const pending = useRef(new Set<string>());
  const toast = useToast();

  const poll = useCallback(async () => {
    const last = msgs.at(-1)?.createdAt;
    try {
      const r = await fetch(`/api/chat${last ? `?after=${encodeURIComponent(last)}` : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { messages: Msg[]; online: string[]; typing: string[]; reactions: Record<string, ReactionView[]> };
      if (data.messages.length) setMsgs((m) => [...m, ...data.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      setOnline(data.online);
      setTyping(data.typing);
      // Don't overwrite a reaction I just tapped while the server is still saving it.
      setReactions((cur) => {
        const next = { ...data.reactions };
        for (const id of pending.current) next[id] = cur[id] ?? [];
        return next;
      });
    } catch {}
  }, [msgs]);

  useEffect(() => {
    const t = setInterval(poll, 3000);
    const f = () => poll();
    window.addEventListener("focus", f);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", f);
    };
  }, [poll]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, typing.length]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.q.toLowerCase();
    const list = [{ id: "everyone", name: "everyone", title: "Everyone in the team", seenAt: null }, ...people.filter((p) => p.id !== me.id)];
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people, me.id]);

  const sayTyping = () => {
    const now = Date.now();
    if (now - lastTyping.current < 3000) return;
    lastTyping.current = now;
    fetch("/api/chat/typing", { method: "POST" }).catch(() => {});
  };

  const onChange = (v: string, caret: number) => {
    setText(v);
    if (v.trim()) sayTyping();
    const upto = v.slice(0, caret);
    const m = upto.match(/(^|\s)@([\p{L}\p{N}]*)$/u);
    setMention(m ? { q: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  };

  const insert = (s: string) => {
    const el = inputRef.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + s + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + s.length, a + s.length);
    });
  };

  const pick = (name: string) => {
    if (!mention) return;
    const first = name === "everyone" ? "everyone" : name;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.q.length);
    const next = `${before}@${first} ${after.replace(/^\s+/, "")}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = before.length + first.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const fd = new FormData();
    fd.set("body", body);
    const r = await chatPostAction(null, fd);
    setSending(false);
    if (r && !r.ok) return toast({ kind: "error", text: r.error });
    setText("");
    lastTyping.current = 0;
    stick.current = true;
    poll();
  };

  const remove = async (id: string) => {
    const fd = new FormData();
    fd.set("messageId", id);
    const r = await chatDeleteAction(null, fd);
    if (r && !r.ok) return toast({ kind: "error", text: r.error });
    setMsgs((m) => m.filter((x) => x.id !== id));
  };

  const react = async (id: string, emoji: string) => {
    pending.current.add(id);
    setReactions((all) => ({ ...all, [id]: applyReaction(all[id] ?? [], emoji, me.name) }));
    const r = await reactAction("chat", id, emoji);
    pending.current.delete(id);
    if (r && !r.ok) toast({ kind: "error", text: r.error });
  };

  const onlineSet = new Set(online);
  const sortedPeople = [...people].sort((a, b) => Number(onlineSet.has(b.id)) - Number(onlineSet.has(a.id)) || a.name.localeCompare(b.name));
  const onlineCount = people.filter((p) => onlineSet.has(p.id)).length;

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-[1180px] gap-4 max-lg:h-[calc(100dvh-12rem)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-[24px] font-bold tracking-[-0.01em] sm:text-[26px]">
              <MessagesSquare className="size-6 text-electric" /> Team chat
            </h1>
            <p className="text-[13.5px] text-muted">
              Everyone at {company}. Type <b className="text-ink-2">@</b> to mention someone. They get a notification.
            </p>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex -space-x-2">
              {sortedPeople
                .filter((p) => onlineSet.has(p.id))
                .slice(0, 5)
                .map((p) => (
                  <span key={p.id} className="relative">
                    <Avatar name={p.name} size={28} ring badge={false} />
                    <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-canvas" />
                  </span>
                ))}
            </div>
            <span className="text-[12.5px] font-medium text-ok">{onlineCount} online</span>
          </div>
        </div>

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="card chat-wall flex-1 overflow-y-auto px-3 py-4 sm:px-5"
        >
          {msgs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted">
              <MessagesSquare className="mb-2 size-8 text-electric" />
              <div className="font-display text-[16px] font-bold text-ink">Say hi to the team 👋</div>
              <div className="text-[13px]">Messages here are seen by everyone.</div>
            </div>
          )}
          {msgs.map((m, idx) => {
            const d = new Date(m.createdAt);
            const day = dayFmt.format(d);
            const prev = idx > 0 ? msgs[idx - 1] : null;
            const prevAt = prev ? new Date(prev.createdAt) : null;
            const showDay = !prevAt || dayFmt.format(prevAt) !== day;
            const grouped = !showDay && prev?.authorId === m.authorId && d.getTime() - prevAt!.getTime() < 5 * 60_000;
            const mine = m.authorId === me.id;
            const forMe = m.mentions.includes(me.id);
            const rs = reactions[m.id] ?? [];
            return (
              <div key={m.id} id={`m-${m.id}`} className="scroll-mt-4">
                {showDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-semibold text-muted shadow-card">{day}</span>
                  </div>
                )}
                <div className={clsx("group flex items-end gap-2", mine && "flex-row-reverse", grouped ? "mt-0.5" : "mt-3")}>
                  <div className="w-8 shrink-0">
                    {!grouped && !mine && (
                      <span className="relative block">
                        <Avatar name={m.authorName} size={32} />
                        {onlineSet.has(m.authorId) && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-surface" />}
                      </span>
                    )}
                  </div>
                  <div className={clsx("flex min-w-0 max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                    {!grouped && (
                      <div className={clsx("mb-0.5 flex items-baseline gap-2 px-1", mine && "flex-row-reverse")}>
                        {!mine && <span className="text-[13px] font-semibold">{m.authorName}</span>}
                        <span className="text-[11px] text-faint">{timeFmt.format(d)}</span>
                      </div>
                    )}
                    <div className={clsx("relative flex items-center gap-1", mine && "flex-row-reverse")}>
                      <div
                        title={grouped ? timeFmt.format(d) : undefined}
                        className={clsx(
                          "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px] leading-relaxed shadow-[0_1px_2px_rgb(11_22_57/0.08)]",
                          mine ? "rounded-br-md bg-electric text-white" : "rounded-bl-md border border-line bg-surface text-ink",
                          forMe && !mine && "border-[#f5c84c] bg-[#fffaeb] ring-1 ring-[#f5c84c]/40",
                        )}
                      >
                        <Body text={m.body} people={people} meName={me.name} mine={mine} />
                        {m.itemId && m.itemTitle && (
                          <Link href={`/items/${m.itemId}`} className={clsx("mt-1 block text-[12.5px] font-semibold underline-offset-2 hover:underline", mine ? "text-white/90" : "text-electric")}>
                            {m.itemTitle} →
                          </Link>
                        )}
                      </div>
                      <div className={clsx("flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100", mine && "flex-row-reverse")}>
                        <Popover
                          label="React"
                          width={236}
                          align={mine ? "right" : "left"}
                          triggerClassName="grid size-7 cursor-pointer place-items-center rounded-full text-faint hover:bg-sunken hover:text-ink"
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
                                    react(m.id, e);
                                  }}
                                  className="grid h-11 cursor-pointer place-items-center rounded-lg text-[22px] transition hover:scale-110 hover:bg-hover"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </Popover>
                        {(mine || me.manager) && (
                          <button type="button" onClick={() => remove(m.id)} className="grid size-7 cursor-pointer place-items-center rounded-full text-faint hover:bg-bad-soft hover:text-bad" aria-label="Delete message" title="Delete">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {rs.length > 0 && (
                      <div className={clsx("-mt-1 flex flex-wrap gap-1 px-1", mine && "justify-end")}>
                        {rs.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => react(m.id, r.emoji)}
                            title={r.names.join(", ")}
                            aria-pressed={r.mine}
                            className={clsx(
                              "relative inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-1.5 text-[12px] font-semibold tabular-nums shadow-card transition active:scale-95",
                              r.mine ? "border-electric/50 bg-electric-soft text-electric" : "border-line bg-surface text-ink-2",
                            )}
                          >
                            <span className="text-[13px] leading-none">{r.emoji}</span>
                            {r.count > 1 && r.count}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {typing.length > 0 && (
            <div className="mt-3 flex items-center gap-2 pl-10 text-[12.5px] text-muted" aria-live="polite">
              <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-2.5">
                <span className="typing-dot" />
                <span className="typing-dot [animation-delay:150ms]" />
                <span className="typing-dot [animation-delay:300ms]" />
              </span>
              {typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : "Several people are typing…"}
            </div>
          )}
        </div>

        <div className="relative mt-3">
          {mention && candidates.length > 0 && (
            <div role="group" aria-label="People to mention" className="absolute bottom-full left-0 z-10 mb-2 w-[280px] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
              {candidates.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p.name);
                  }}
                  className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px]", i === active ? "bg-electric-soft" : "hover:bg-hover")}
                >
                  {p.id === "everyone" ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-strong text-white">
                      <AtSign className="size-3.5" />
                    </span>
                  ) : (
                    <Avatar name={p.name} size={24} badge={false} />
                  )}
                  <span className="font-medium">{p.name}</span>
                  {p.id !== "everyone" && onlineSet.has(p.id) && <span className="size-2 rounded-full bg-ok" />}
                  <span className="truncate text-[12px] text-muted">{p.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className="card flex items-end gap-1.5 p-2 focus-within:border-electric/50 focus-within:ring-3 focus-within:ring-electric/10">
            <Popover
              label="Emoji"
              width={320}
              triggerClassName="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
              trigger={<Smile className="size-[22px]" />}
            >
              {() => (
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {EMOJI_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.label}</div>
                      <div className="grid grid-cols-8 gap-0.5">
                        {g.list.map((e) => (
                          <button key={e} type="button" onClick={() => insert(e)} className="grid size-9 cursor-pointer place-items-center rounded-lg text-[20px] transition hover:scale-110 hover:bg-hover">
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Popover>
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              aria-label="Message"
              placeholder="Write a message… (@ to mention, Enter to send)"
              onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
              onKeyDown={(e) => {
                if (mention && candidates.length) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => (a + 1) % candidates.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => (a - 1 + candidates.length) % candidates.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pick(candidates[active].name);
                    return;
                  }
                  if (e.key === "Escape") return setMention(null);
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-lg border-0 bg-transparent px-1 py-2.5 text-[14.5px] text-ink outline-none placeholder:text-faint"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || sending}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-electric text-white shadow-[0_6px_16px_-8px_rgb(59_130_246/0.9)] transition hover:bg-[#2f74e6] active:scale-95 disabled:opacity-40 disabled:shadow-none"
              aria-label="Send"
            >
              <SendHorizontal className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Who's here */}
      <aside className="card hidden w-[250px] shrink-0 flex-col overflow-hidden lg:flex">
        <div className="border-b border-line px-4 py-3">
          <div className="font-display text-[14.5px] font-bold">The team</div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className="size-2 rounded-full bg-ok" /> {onlineCount} online now
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {sortedPeople.map((p) => {
            const on = onlineSet.has(p.id) || p.id === me.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => insert(`@${p.name} `)}
                  title={`Mention ${p.name}`}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
                >
                  <span className="relative">
                    <Avatar name={p.name} size={30} badge={false} />
                    <span className={clsx("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface", on ? "bg-ok" : "bg-line-strong")} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {p.name}
                      {p.id === me.id && <span className="text-muted"> (you)</span>}
                    </span>
                    <span className={clsx("block truncate text-[11.5px]", on ? "font-medium text-ok" : "text-faint")}>{on ? (typing.includes(p.name) ? "typing…" : "Online") : seenText(p.seenAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
