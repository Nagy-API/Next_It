"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AtSign, MessagesSquare, SendHorizontal, Trash2 } from "lucide-react";
import { chatDeleteAction, chatPostAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/client";

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
type P = { id: string; name: string; title: string | null };

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });

/** Highlight @mentions and turn links into links. */
function Body({ text, people, meName }: { text: string; people: P[]; meName: string }) {
  const names = [...people.map((p) => p.name), ...people.map((p) => p.name.split(" ")[0]), "everyone"].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(@(?:${escaped.join("|")})\\b|https?://\\S+)`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("@")) {
          const mine = p.slice(1).toLowerCase() === meName.toLowerCase() || p.slice(1).toLowerCase() === meName.split(" ")[0].toLowerCase() || p.toLowerCase() === "@everyone";
          return (
            <span key={i} className={clsx("rounded px-1 font-semibold", mine ? "bg-[#fff1c2] text-[#8a5a00]" : "bg-electric-soft text-[#1d5fd1]")}>
              {p}
            </span>
          );
        }
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-electric underline">
              {p}
            </a>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function ChatRoom({ me, initial, people }: { me: { id: string; name: string; manager: boolean }; initial: Msg[]; people: P[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const toast = useToast();

  const poll = useCallback(async () => {
    const last = msgs.at(-1)?.createdAt;
    try {
      const r = await fetch(`/api/chat${last ? `?after=${encodeURIComponent(last)}` : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const { messages } = (await r.json()) as { messages: Msg[] };
      if (messages.length) setMsgs((m) => [...m, ...messages.filter((x) => !m.some((y) => y.id === x.id))]);
    } catch {}
  }, [msgs]);

  useEffect(() => {
    const t = setInterval(poll, 4000);
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
  }, [msgs]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.q.toLowerCase();
    const list = [{ id: "everyone", name: "everyone", title: "Everyone in the team" }, ...people.filter((p) => p.id !== me.id)];
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people, me.id]);

  const onChange = (v: string, caret: number) => {
    setText(v);
    const upto = v.slice(0, caret);
    const m = upto.match(/(^|\s)@([\p{L}\p{N}]*)$/u);
    setMention(m ? { q: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
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

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-[900px] flex-col">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-[26px] font-bold tracking-[-0.01em]">
            <MessagesSquare className="size-6 text-electric" /> Team chat
          </h1>
          <p className="text-[13.5px] text-muted">
            Everyone at NEXORA. Type <b className="text-ink-2">@</b> to mention someone — they get a notification.
          </p>
        </div>
        <div className="hidden -space-x-2 sm:flex">
          {people.slice(0, 8).map((p) => (
            <Avatar key={p.id} name={p.name} size={30} ring badge={false} />
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="card flex-1 overflow-y-auto px-3 py-4 sm:px-5"
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
          return (
            <div key={m.id} id={`m-${m.id}`}>
              {showDay && (
                <div className="my-3 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
                  <span className="h-px flex-1 bg-line" /> {day} <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className={clsx("group flex gap-3 rounded-lg px-2 py-1 hover:bg-canvas", forMe && "bg-[#fffaeb] hover:bg-[#fff6d6]", !grouped && "mt-2")}>
                <div className="w-9 shrink-0">{!grouped && <Avatar name={m.authorName} size={36} />}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-semibold">{m.authorName}</span>
                      <span className="text-[11.5px] text-faint">{timeFmt.format(d)}</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink">
                    <Body text={m.body} people={people} meName={me.name} />
                  </div>
                  {m.itemId && m.itemTitle && (
                    <Link href={`/items/${m.itemId}`} className="mt-1 inline-flex rounded-md bg-canvas px-2 py-0.5 text-[12.5px] font-medium text-electric hover:underline">
                      {m.itemTitle} →
                    </Link>
                  )}
                </div>
                {(mine || me.manager) && (
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    className="invisible h-7 shrink-0 rounded-md px-1.5 text-faint hover:bg-bad-soft hover:text-bad group-hover:visible"
                    aria-label="Delete message"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-3">
        {mention && candidates.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-[280px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop">
            {candidates.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p.name);
                }}
                className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px]", i === active ? "bg-electric-soft" : "hover:bg-canvas")}
              >
                {p.id === "everyone" ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-navy-900 text-white">
                    <AtSign className="size-3.5" />
                  </span>
                ) : (
                  <Avatar name={p.name} size={24} badge={false} />
                )}
                <span className="font-medium">{p.name}</span>
                <span className="truncate text-[12px] text-muted">{p.title}</span>
              </button>
            ))}
          </div>
        )}
        <div className="card flex items-end gap-2 p-2">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            aria-label="Message"
            placeholder="Write a message… (@ to mention, Enter to send, Shift+Enter for a new line)"
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
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-lg border-0 bg-transparent px-2 py-2.5 text-[14.5px] outline-none placeholder:text-faint"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-electric text-white transition-colors hover:bg-[#2f74e6] disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
