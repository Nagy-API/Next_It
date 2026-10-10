"use client";

/**
 * The Doc editor: blocks of PLAIN TEXT (one auto-growing <textarea> each), so it types like Word but nothing typed
 * is ever HTML. Keyboard and markdown shortcuts follow Notion; content autosaves through savePageContentAction.
 *
 * `blocksRef` is the source of truth for every handler (state mirrors it for rendering), so fast typing, quick
 * checkbox clicks and key repeats never read a stale copy.
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  Minus,
  Plus,
  Repeat2,
  TextQuote,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { savePageContentAction, type SaveResult } from "@/app/page-actions";
import { DOC_BLOCK_TYPES, LIMITS, newId, type DocBlock, type DocBlockType, type DocContent } from "@/domain/pages";

/* ------------------------------- Definitions ------------------------------- */

type Focus = { id: string; at: number | "end" };
type Slash = { id: string; start: number; query: string; active: number };
type SaveState = { kind: "saved" | "saving" | "error"; error?: string };
type NewBlock = Omit<DocBlock, "id">;

const EMOJIS = ["💡", "⚠️", "✅", "📌", "🔥", "❗"];
const isList = (t: DocBlockType) => t === "bullet" || t === "number" || t === "todo";

const MENU: { type: DocBlockType; icon: LucideIcon; hint: string; keys: string }[] = [
  { type: "p", icon: Type, hint: "Just start writing", keys: "text paragraph plain" },
  { type: "h1", icon: Heading1, hint: "Big section heading", keys: "heading h1 title" },
  { type: "h2", icon: Heading2, hint: "Medium heading", keys: "heading h2 subtitle" },
  { type: "h3", icon: Heading3, hint: "Small heading", keys: "heading h3" },
  { type: "bullet", icon: List, hint: "A simple list", keys: "bullet list unordered ul" },
  { type: "number", icon: ListOrdered, hint: "A list with numbers", keys: "numbered list ordered ol 1" },
  { type: "todo", icon: ListTodo, hint: "Track tasks with a checkbox", keys: "todo to-do checkbox task check" },
  { type: "quote", icon: TextQuote, hint: "Capture a quote", keys: "quote blockquote" },
  { type: "callout", icon: Lightbulb, hint: "Make something stand out", keys: "callout note tip warning box" },
  { type: "code", icon: Code, hint: "Monospace, keeps spacing", keys: "code snippet pre" },
  { type: "divider", icon: Minus, hint: "A line between sections", keys: "divider line separator hr" },
];

function filterMenu(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return MENU;
  return MENU.filter((m) => m.type.startsWith(q) || DOC_BLOCK_TYPES[m.type].toLowerCase().includes(q) || m.keys.includes(q));
}

const TEXT: Record<DocBlockType, string> = {
  h1: "font-display text-[30px] font-bold leading-[1.25] tracking-tight text-ink",
  h2: "font-display text-[23px] font-bold leading-[1.3] text-ink",
  h3: "font-display text-[18px] font-semibold leading-[1.4] text-ink",
  p: "text-[16px] leading-relaxed text-ink",
  bullet: "text-[16px] leading-relaxed text-ink",
  number: "text-[16px] leading-relaxed text-ink",
  todo: "text-[16px] leading-relaxed text-ink",
  quote: "text-[16px] leading-relaxed text-ink-2",
  callout: "text-[16px] leading-relaxed text-ink",
  code: "font-mono text-[14px] leading-[1.6] text-ink",
  divider: "",
};
const SPACE: Record<DocBlockType, string> = {
  h1: "mt-8 mb-1 first:mt-0",
  h2: "mt-6 mb-0.5 first:mt-0",
  h3: "mt-4 first:mt-0",
  p: "my-[3px]",
  bullet: "my-[2px]",
  number: "my-[2px]",
  todo: "my-[2px]",
  quote: "my-2",
  callout: "my-2",
  code: "my-2",
  divider: "my-1",
};
/** The hover handle sits on the block's first line. */
const HANDLE: Record<DocBlockType, string> = {
  h1: "top-[5px]",
  h2: "top-[3px]",
  h3: "top-0",
  p: "top-0",
  bullet: "top-0",
  number: "top-0",
  todo: "top-0",
  quote: "top-0",
  callout: "top-[12px]",
  code: "top-[11px]",
  divider: "top-[6px]",
};
const PLACEHOLDER: Partial<Record<DocBlockType, string>> = {
  p: "Type / for blocks, or just start writing…",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "List",
  number: "List",
  todo: "To-do",
  quote: "Quote",
  callout: "Write something worth noticing…",
  code: "Code (press Enter twice at the end to leave)",
};

// `field-sizing: content` grows the textarea with its text; older browsers get the JS fallback in `fit`.
const GROW = { fieldSizing: "content" } as unknown as CSSProperties;
let sizingSupported: boolean | null = null;
function fit(el: HTMLTextAreaElement) {
  if (sizingSupported === null) sizingSupported = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
  if (sizingSupported) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

function makeBlock(type: DocBlockType, text = "", indent?: number): DocBlock {
  const b: DocBlock = { id: newId(), type, text: type === "divider" ? "" : text.slice(0, LIMITS.text) };
  if (type === "todo") b.checked = false;
  if (type === "callout") b.emoji = EMOJIS[0];
  if (isList(type) && indent) b.indent = indent;
  return b;
}

/** Same block, new type: keeps id and text, adds/removes the fields that type needs. */
function convert(b: DocBlock, type: DocBlockType, text = b.text): DocBlock {
  const out: DocBlock = { id: b.id, type, text: type === "divider" ? "" : text };
  if (type === "todo") out.checked = b.type === "todo" ? !!b.checked : false;
  if (type === "callout") out.emoji = b.emoji || EMOJIS[0];
  if (isList(type) && b.indent) out.indent = b.indent;
  return out;
}

function normalize(c: DocContent): DocBlock[] {
  const seen = new Set<string>();
  const out = (c?.blocks ?? []).map((b) => {
    const id = seen.has(b.id) ? newId() : b.id;
    seen.add(id);
    return { ...b, id };
  });
  return out.length ? out : [makeBlock("p")];
}

/** What a typed prefix (before the space) turns a paragraph into. */
function shortcutFor(prefix: string): { type: DocBlockType; checked?: boolean } | null {
  if (prefix === "#") return { type: "h1" };
  if (prefix === "##") return { type: "h2" };
  if (prefix === "###") return { type: "h3" };
  if (prefix === "-" || prefix === "*") return { type: "bullet" };
  if (/^\d+\.$/.test(prefix)) return { type: "number" };
  if (prefix === "[]" || prefix === "[ ]") return { type: "todo" };
  if (/^\[x\]$/i.test(prefix)) return { type: "todo", checked: true };
  if (prefix === ">") return { type: "quote" };
  if (prefix === "```") return { type: "code" };
  if (prefix === "---") return { type: "divider" };
  if (prefix === "!") return { type: "callout" };
  return null;
}

/** One pasted line → a block (leading spaces / tabs nest list items). */
function parseLine(raw: string): NewBlock {
  const lead = /^[\t ]*/.exec(raw)?.[0] ?? "";
  const indent = Math.min(3, Math.floor(lead.replace(/\t/g, "  ").length / 2));
  const line = raw.slice(lead.length).trimEnd();
  const list = (type: DocBlockType, text: string, checked?: boolean): NewBlock => {
    const b: NewBlock = { type, text };
    if (type === "todo") b.checked = !!checked;
    if (indent) b.indent = indent;
    return b;
  };
  let m: RegExpExecArray | null;
  if ((m = /^(?:[-*•]\s+)?\[( |x|X)?\]\s+(.*)$/.exec(line))) return list("todo", m[2], /x/i.test(m[1] ?? ""));
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return { type: "divider", text: "" };
  if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) return { type: (["h1", "h2", "h3"] as const)[m[1].length - 1], text: m[2] };
  if ((m = /^[-*•]\s+(.*)$/.exec(line))) return list("bullet", m[1]);
  if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) return list("number", m[1]);
  if ((m = /^>\s?(.*)$/.exec(line))) return { type: "quote", text: m[1] };
  if ((m = /^!\s+(.*)$/.exec(line))) return { type: "callout", text: m[1], emoji: EMOJIS[0] };
  return { type: "p", text: line };
}

/** Pasted plain text → blocks. ``` fences keep their lines together as one code block; blank lines are dropped. */
function parsePaste(text: string): NewBlock[] {
  const out: NewBlock[] = [];
  let code: string[] | null = null;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      if (code) {
        out.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code = [];
      continue;
    }
    if (code) code.push(line);
    else if (line.trim()) out.push(parseLine(line));
  }
  if (code) out.push({ type: "code", text: code.join("\n") });
  return out.map((b) => ({ ...b, text: b.text.slice(0, LIMITS.text) }));
}

/** Is the caret on the first / last visual line? A hidden mirror div lays the text out exactly like the textarea. */
const MIRROR = ["boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "wordSpacing", "tabSize", "textIndent"] as const;
function caretEdge(el: HTMLTextAreaElement): { first: boolean; last: boolean } {
  const pos = el.selectionStart;
  if (pos !== el.selectionEnd) return { first: false, last: false };
  if (!el.value) return { first: true, last: true };
  const cs = getComputedStyle(el);
  const div = document.createElement("div");
  const style = div.style as unknown as Record<string, string>;
  for (const p of MIRROR) style[p] = (cs as unknown as Record<string, string>)[p];
  Object.assign(div.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px", whiteSpace: "pre-wrap", overflowWrap: "break-word", height: "auto" });
  div.textContent = el.value.slice(0, pos);
  const mark = document.createElement("span");
  mark.textContent = el.value.slice(pos) || ".";
  div.appendChild(mark);
  document.body.appendChild(div);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const content = div.clientHeight - padTop - (parseFloat(cs.paddingBottom) || 0);
  const top = mark.offsetTop - padTop;
  div.remove();
  return { first: top < lh / 2, last: top + lh * 1.5 > content };
}

const LETTERS = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(97 + ((x - 1) % 26)) + s;
  return s;
};
const ROMAN = (n: number) => {
  const map: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = "";
  let x = n;
  for (const [v, r] of map) {
    while (x >= v) {
      s += r;
      x -= v;
    }
  }
  return s;
};
const numberLabel = (n: number, indent: number) => (indent % 3 === 1 ? LETTERS(n) : indent % 3 === 2 ? ROMAN(n) : String(n));
const BULLETS = ["•", "◦", "▪", "•"];

const countWords = (bs: DocBlock[]) => bs.reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);

/* --------------------------------- Editor --------------------------------- */

type Ops = ReturnType<typeof useOps>;

export function DocEditor({ pageId, initial, canEdit }: { pageId: string; initial: DocContent; canEdit: boolean }) {
  const [blocks, setBlocks] = useState(() => normalize(initial));
  const [slash, setSlash] = useState<Slash | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const blocksRef = useRef(blocks);
  const saver = useRef<{ touch: () => void } | null>(null);
  const ops = useOps(blocksRef, setBlocks, setSlash, setMenu, setDrop, saver);

  // Autosave: 800 ms after the last change, one request at a time; while failing, retry every 10 s.
  useEffect(() => {
    if (!canEdit) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let dirty = false;
    let rev = 0;
    const flush = async () => {
      clearTimeout(timer);
      timer = undefined;
      if (!dirty || inFlight) return; // a request in flight re-checks `rev` when it ends
      inFlight = true;
      const sent = rev;
      setSave({ kind: "saving" });
      let res: SaveResult;
      try {
        res = await savePageContentAction(pageId, { blocks: blocksRef.current });
      } catch {
        res = { ok: false, error: "Couldn't save. Check your connection — your changes are kept on this screen." };
      }
      inFlight = false;
      clearTimeout(retry);
      if (res.ok) {
        if (rev === sent) {
          dirty = false;
          setSave({ kind: "saved" });
        } else if (!timer) void flush();
      } else {
        setSave({ kind: "error", error: res.error });
        retry = setTimeout(() => void flush(), 10_000);
      }
    };
    saver.current = {
      touch: () => {
        dirty = true;
        rev++;
        setSave({ kind: "saving" });
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), 800);
      },
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty) void flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      saver.current = null;
      clearTimeout(retry);
      if (dirty) void flush(); // leaving the page inside the app: don't drop the last keystrokes
      clearTimeout(timer);
    };
  }, [pageId, canEdit]);

  // After every render: put the caret where the last action asked, and size textareas in older browsers.
  useLayoutEffect(() => ops.afterRender());

  // Block menu: close on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-block-menu]")) setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  // Numbered lists count consecutive numbered items at the same indent; deeper items don't break the count.
  const numbers = useMemo(() => {
    const out = new Map<string, number>();
    const run: (number | null)[] = [null, null, null, null];
    for (const b of blocks) {
      if (!isList(b.type)) {
        run.fill(null);
        continue;
      }
      const lvl = b.indent ?? 0;
      for (let l = lvl + 1; l < run.length; l++) run[l] = null;
      if (b.type === "number") {
        run[lvl] = (run[lvl] ?? 0) + 1;
        out.set(b.id, run[lvl]!);
      } else run[lvl] = null;
    }
    return out;
  }, [blocks]);
  const words = useMemo(() => countWords(blocks), [blocks]);

  return (
    <div className={clsx("relative mx-auto w-full max-w-[780px] pb-6", canEdit ? "pl-12 pr-3 sm:px-14" : "px-3 sm:px-14")}>
      <div>
        {blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            block={b}
            index={i}
            num={numbers.get(b.id) ?? 0}
            canEdit={canEdit}
            ops={ops}
            slash={slash?.id === b.id ? slash : null}
            menuOpen={menu === b.id}
            dropEdge={drop?.id === b.id ? (drop.after ? "after" : "before") : null}
            isFirst={i === 0}
            isLast={i === blocks.length - 1}
          />
        ))}
      </div>
      {canEdit && (
        // Clicking under the last block keeps writing there (Notion-like), instead of doing nothing.
        <div className="min-h-[24vh] cursor-text" onMouseDown={(e) => {
            e.preventDefault();
            ops.focusEnd();
          }}
          aria-hidden
        />
      )}
      <div className="pointer-events-none sticky bottom-20 z-10 mt-4 flex justify-end lg:bottom-5">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-muted shadow-card">
          <span className="tabular-nums">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
          {canEdit && (
            <>
              <span className="text-faint">·</span>
              {save.kind === "saving" ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </span>
              ) : save.kind === "saved" ? (
                <span className="flex items-center gap-1 text-ok">
                  <Check className="size-3" /> Saved
                </span>
              ) : (
                <span className="flex max-w-[60vw] items-center gap-1 text-bad" title={save.error}>
                  <CircleAlert className="size-3 flex-none" />
                  <span className="truncate">{save.error || "Couldn't save"}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Operations ------------------------------ */

/** Every edit, as stable functions (so memoised rows don't re-render on each keystroke elsewhere). */
function useOps(
  blocksRef: React.RefObject<DocBlock[]>,
  setBlocks: (b: DocBlock[]) => void,
  setSlashState: (s: Slash | null) => void,
  setMenu: React.Dispatch<React.SetStateAction<string | null>>,
  setDrop: (d: { id: string; after: boolean } | null) => void,
  saver: React.RefObject<{ touch: () => void } | null>,
) {
  const els = useRef(new Map<string, HTMLTextAreaElement>());
  const fitted = useRef(new Map<string, string>());
  const focusRef = useRef<Focus | null>(null);
  const slashRef = useRef<Slash | null>(null);
  const dragRef = useRef<string | null>(null);
  const dropRef = useRef<{ id: string; after: boolean } | null>(null);

  return useMemo(() => {
    const all = () => blocksRef.current;
    const at = (id: string) => all().findIndex((b) => b.id === id);
    const commit = (next: DocBlock[], focus?: Focus) => {
      const list = next.length ? next.slice(0, LIMITS.blocks) : [makeBlock("p")];
      blocksRef.current = list;
      if (focus) focusRef.current = focus;
      setBlocks(list);
      saver.current?.touch();
    };
    const replace = (i: number, b: DocBlock) => all().map((x, j) => (j === i ? b : x));
    const setSlash = (s: Slash | null) => {
      slashRef.current = s;
      setSlashState(s);
    };
    const focusBlock = (id: string, pos: number | "end") => {
      const el = els.current.get(id);
      if (!el) return false;
      el.focus();
      const p = pos === "end" ? el.value.length : Math.min(pos, el.value.length);
      el.setSelectionRange(p, p);
      return true;
    };
    /** The nearest text block before (dir -1) or after (dir 1), skipping dividers. */
    const neighbour = (i: number, dir: 1 | -1) => {
      const bs = all();
      for (let j = i + dir; j >= 0 && j < bs.length; j += dir) if (bs[j].type !== "divider") return bs[j];
      return null;
    };

    const turnInto = (id: string, type: DocBlockType, text?: string, caret?: number) => {
      const i = at(id);
      if (i < 0) return;
      const b = all()[i];
      const t = text ?? b.text;
      if (type === "divider") {
        const p = makeBlock("p");
        const bs = all();
        const head = t ? [{ ...b, text: t }] : [];
        commit([...bs.slice(0, i), ...head, { ...makeBlock("divider"), id: t ? newId() : b.id }, p, ...bs.slice(i + 1)], { id: p.id, at: 0 });
        return;
      }
      commit(replace(i, convert(b, type, t)), { id, at: caret ?? "end" });
    };

    const insertAfter = (i: number, nb: DocBlock, focus = true) => {
      const bs = all();
      commit([...bs.slice(0, i + 1), nb, ...bs.slice(i + 1)], focus ? { id: nb.id, at: 0 } : undefined);
    };

    const chooseSlash = (type: DocBlockType) => {
      const s = slashRef.current;
      if (!s) return;
      setSlash(null);
      const b = all()[at(s.id)];
      if (!b) return;
      const text = b.text.slice(0, s.start) + b.text.slice(s.start + 1 + s.query.length);
      turnInto(s.id, type, text, s.start);
    };

    const remove = (id: string) => {
      const i = at(id);
      if (i < 0) return;
      const prev = neighbour(i, -1) ?? neighbour(i, 1);
      commit(all().filter((b) => b.id !== id), prev ? { id: prev.id, at: "end" } : undefined);
    };

    const move = (id: string, delta: 1 | -1) => {
      const bs = all().slice();
      const i = at(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= bs.length) return;
      [bs[i], bs[j]] = [bs[j], bs[i]];
      commit(bs, { id, at: els.current.get(id)?.selectionStart ?? "end" });
    };

    const indent = (id: string, d: 1 | -1) => {
      const i = at(id);
      const b = all()[i];
      if (!b || !isList(b.type)) return;
      const n = Math.max(0, Math.min(3, (b.indent ?? 0) + d));
      const nb = { ...b };
      if (n) nb.indent = n;
      else delete nb.indent;
      commit(replace(i, nb));
    };

    const toggle = (id: string) => {
      const i = at(id);
      const b = all()[i];
      if (b?.type === "todo") commit(replace(i, { ...b, checked: !b.checked }));
    };

    const input = (id: string, el: HTMLTextAreaElement) => {
      const i = at(id);
      if (i < 0) return;
      const b = all()[i];
      const value = el.value.slice(0, LIMITS.text);
      const caret = el.selectionStart;
      fit(el);
      // Markdown shortcut: "# " etc. typed at the start of a paragraph.
      if (b.type === "p" && caret > 1 && value[caret - 1] === " ") {
        const prefix = value.slice(0, caret - 1);
        const sc = prefix === "[ ]" || !/\s/.test(prefix) ? shortcutFor(prefix) : null;
        if (sc) {
          setSlash(null);
          const rest = value.slice(caret);
          if (sc.type === "divider") return turnInto(id, "divider", rest);
          const nb = convert(b, sc.type, rest);
          if (sc.checked) nb.checked = true;
          return commit(replace(i, nb), { id, at: 0 });
        }
      }
      commit(replace(i, { ...b, text: value }));
      // Slash menu: open on "/" at the start or after a space; the text after it filters.
      const s = slashRef.current;
      if (s && s.id === id) {
        const q = value.slice(s.start + 1, caret);
        if (caret <= s.start || value[s.start] !== "/" || /\s/.test(q) || q.length > 24) setSlash(null);
        else if (q !== s.query) setSlash({ ...s, query: q, active: 0 });
      } else if (b.type !== "code" && value[caret - 1] === "/" && (caret === 1 || /\s/.test(value[caret - 2]))) {
        setSlash({ id, start: caret - 1, query: "", active: 0 });
      }
    };

    const key = (id: string, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      const el = e.currentTarget;
      const i = at(id);
      if (i < 0) return;
      const bs = all();
      const b = bs[i];
      const s = el.selectionStart;
      const end = el.selectionEnd;
      const mod = e.metaKey || e.ctrlKey;

      const sl = slashRef.current;
      if (sl && sl.id === id) {
        const items = filterMenu(sl.query);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (items.length) setSlash({ ...sl, active: (sl.active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length });
          return;
        }
        if ((e.key === "Enter" || e.key === "Tab") && items.length) {
          e.preventDefault();
          return chooseSlash(items[Math.min(sl.active, items.length - 1)].type);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          return setSlash(null);
        }
      }

      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        return move(id, e.key === "ArrowUp" ? -1 : 1);
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (mod) {
          e.preventDefault();
          return b.type === "todo" ? toggle(id) : insertAfter(i, makeBlock("p"));
        }
        if (b.type === "code") {
          // Enter on an empty last line leaves the code block; otherwise it's a normal new line.
          if (s === end && s === b.text.length && b.text.endsWith("\n")) {
            e.preventDefault();
            const p = makeBlock("p");
            commit([...bs.slice(0, i), { ...b, text: b.text.slice(0, -1) }, p, ...bs.slice(i + 1)], { id: p.id, at: 0 });
          }
          return;
        }
        e.preventDefault();
        if (isList(b.type) && !b.text) {
          if (b.indent) return indent(id, -1);
          return commit(replace(i, convert(b, "p")), { id, at: 0 });
        }
        const nextType: DocBlockType = isList(b.type) ? b.type : "p";
        if (s === 0 && end === 0 && b.text) {
          // Enter at the very start pushes the block down and keeps the caret in it.
          const nb = makeBlock(nextType, "", b.indent);
          return commit([...bs.slice(0, i), nb, ...bs.slice(i)], { id, at: 0 });
        }
        const nb = makeBlock(nextType, b.text.slice(end), isList(b.type) ? b.indent : undefined);
        return commit([...bs.slice(0, i), { ...b, text: b.text.slice(0, s) }, nb, ...bs.slice(i + 1)], { id: nb.id, at: 0 });
      }

      if (e.key === "Backspace" && s === 0 && end === 0) {
        if (b.type !== "p") {
          e.preventDefault();
          if (isList(b.type) && b.indent) return indent(id, -1);
          return commit(replace(i, convert(b, "p")), { id, at: 0 });
        }
        if (i === 0) return;
        e.preventDefault();
        const prev = bs[i - 1];
        if (prev.type === "divider") return commit(bs.filter((_, j) => j !== i - 1), { id, at: 0 });
        const merged = { ...prev, text: (prev.text + b.text).slice(0, LIMITS.text) };
        return commit(bs.flatMap((x, j) => (j === i ? [] : j === i - 1 ? [merged] : [x])), { id: prev.id, at: prev.text.length });
      }

      if (e.key === "Delete" && s === end && s === b.text.length && i < bs.length - 1) {
        e.preventDefault();
        const next = bs[i + 1];
        if (next.type === "divider") return commit(bs.filter((_, j) => j !== i + 1), { id, at: s });
        const merged = { ...b, text: (b.text + next.text).slice(0, LIMITS.text) };
        return commit(bs.flatMap((x, j) => (j === i + 1 ? [] : j === i ? [merged] : [x])), { id, at: s });
      }

      if (e.key === "Tab") {
        e.preventDefault(); // stay in the document, like Word
        if (isList(b.type)) return indent(id, e.shiftKey ? -1 : 1);
        if (b.type === "code" && !e.shiftKey) return commit(replace(i, { ...b, text: b.text.slice(0, s) + "  " + b.text.slice(end) }), { id, at: s + 2 });
        return;
      }

      if (e.shiftKey || e.altKey || mod) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const up = e.key === "ArrowUp";
        const edge = caretEdge(el);
        if (up ? !edge.first : !edge.last) return;
        const target = neighbour(i, up ? -1 : 1);
        if (target && focusBlock(target.id, up ? "end" : 0)) e.preventDefault();
        return;
      }
      if (e.key === "ArrowLeft" && s === 0 && end === 0) {
        const target = neighbour(i, -1);
        if (target && focusBlock(target.id, "end")) e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight" && s === end && s === b.text.length) {
        const target = neighbour(i, 1);
        if (target && focusBlock(target.id, 0)) e.preventDefault();
      }
      if (e.key === "Escape") el.blur();
    };

    const paste = (id: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const i = at(id);
      const b = all()[i];
      const raw = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
      // One line, or into a code block: the textarea's own plain-text paste is right (and keeps native undo).
      if (!b || !raw.includes("\n") || b.type === "code") return;
      e.preventDefault();
      const parsed = parsePaste(raw);
      if (!parsed.length) return;
      const el = e.currentTarget;
      const before = b.text.slice(0, el.selectionStart);
      const after = b.text.slice(el.selectionEnd);
      const [first, ...rest] = parsed;
      // An empty paragraph takes the first pasted line's type; otherwise the first line joins the current block.
      const head: DocBlock = b.type === "p" && !before ? { ...first, id: b.id } : { ...b, text: (before + first.text).slice(0, LIMITS.text) };
      const out: DocBlock[] = [head, ...rest.map((x) => ({ ...x, id: newId() }))];
      let last = out[out.length - 1];
      let caret = last.text.length;
      if (after) {
        if (last.type === "divider") {
          last = makeBlock("p", after);
          out.push(last);
          caret = 0;
        } else out[out.length - 1] = last = { ...last, text: (last.text + after).slice(0, LIMITS.text) };
      }
      setSlash(null);
      const bs = all();
      commit([...bs.slice(0, i), ...out, ...bs.slice(i + 1)], last.type === "divider" ? undefined : { id: last.id, at: caret });
    };

    return {
      register(id: string, el: HTMLTextAreaElement | null) {
        if (el) {
          els.current.set(id, el);
          fit(el);
          fitted.current.set(id, el.value);
        } else {
          els.current.delete(id);
          fitted.current.delete(id);
        }
      },
      afterRender() {
        for (const [id, el] of els.current) {
          if (fitted.current.get(id) !== el.value) {
            fit(el);
            fitted.current.set(id, el.value);
          }
        }
        const f = focusRef.current;
        if (f && els.current.has(f.id)) {
          focusRef.current = null;
          focusBlock(f.id, f.at);
        }
      },
      input,
      key,
      paste,
      toggle,
      turnInto,
      chooseSlash,
      remove,
      move,
      blur(id: string) {
        if (slashRef.current?.id === id) setSlash(null);
      },
      hoverSlash(active: number) {
        const s = slashRef.current;
        if (s && s.active !== active) setSlash({ ...s, active });
      },
      cycleEmoji(id: string) {
        const i = at(id);
        const b = all()[i];
        if (!b) return;
        const n = (EMOJIS.indexOf(b.emoji ?? "") + 1) % EMOJIS.length;
        commit(replace(i, { ...b, emoji: EMOJIS[n] }));
      },
      addBelow(id: string) {
        const i = at(id);
        if (i >= 0) insertAfter(i, makeBlock("p"));
      },
      duplicate(id: string) {
        const i = at(id);
        if (i >= 0) insertAfter(i, { ...all()[i], id: newId() }, false);
      },
      dividerKey(id: string, e: React.KeyboardEvent<HTMLElement>) {
        const i = at(id);
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          remove(id);
        } else if (e.key === "Enter") {
          e.preventDefault();
          insertAfter(i, makeBlock("p"));
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const t = neighbour(i, e.key === "ArrowUp" ? -1 : 1);
          if (t && focusBlock(t.id, e.key === "ArrowUp" ? "end" : 0)) e.preventDefault();
        }
      },
      focusEnd() {
        const bs = all();
        const last = bs[bs.length - 1];
        if (last && last.type === "p" && !last.text) focusBlock(last.id, 0);
        else insertAfter(bs.length - 1, makeBlock("p"));
      },
      toggleMenu(id: string) {
        setMenu((m) => (m === id ? null : id));
      },
      closeMenu() {
        setMenu(null);
      },
      dragStart(id: string, e: React.DragEvent<HTMLElement>) {
        dragRef.current = id;
        setMenu(null);
        e.dataTransfer.effectAllowed = "move";
        // A custom type (not text/plain) so dropping on a textarea never pastes the block's text.
        e.dataTransfer.setData("application/x-nexora-block", id);
        const row = (e.currentTarget as HTMLElement).closest("[data-block-row]");
        if (row) e.dataTransfer.setDragImage(row, 16, 12);
      },
      dragOver(id: string, e: React.DragEvent<HTMLElement>) {
        if (!dragRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        // dragover fires many times a second: only re-render when the drop line actually moves.
        if (dropRef.current?.id !== id || dropRef.current.after !== after) {
          dropRef.current = { id, after };
          setDrop(dropRef.current);
        }
      },
      drop(id: string, e: React.DragEvent<HTMLElement>) {
        const from = dragRef.current;
        if (!from) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        dragRef.current = null;
        dropRef.current = null;
        setDrop(null);
        if (from === id) return;
        const moving = all().find((b) => b.id === from);
        if (!moving) return;
        const rest = all().filter((b) => b.id !== from);
        const t = rest.findIndex((b) => b.id === id);
        if (t < 0) return;
        const pos = after ? t + 1 : t;
        commit([...rest.slice(0, pos), moving, ...rest.slice(pos)]);
      },
      dragEnd() {
        dragRef.current = null;
        dropRef.current = null;
        setDrop(null);
      },
    };
    // Every dependency is a ref or a state setter: stable for the editor's lifetime.
  }, [blocksRef, setBlocks, setSlashState, setMenu, setDrop, saver]);
}

/* --------------------------------- Rows --------------------------------- */

const BlockRow = memo(function BlockRow({
  block: b,
  index,
  num,
  canEdit,
  ops,
  slash,
  menuOpen,
  dropEdge,
  isFirst,
  isLast,
}: {
  block: DocBlock;
  index: number;
  num: number;
  canEdit: boolean;
  ops: Ops;
  slash: Slash | null;
  menuOpen: boolean;
  dropEdge: "before" | "after" | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  const indentPx = isList(b.type) ? (b.indent ?? 0) * 26 : 0;
  const done = b.type === "todo" && b.checked;

  const text = canEdit ? (
    <textarea
      ref={(el) => {
        ops.register(b.id, el);
        return () => ops.register(b.id, null);
      }}
      value={b.text}
      rows={1}
      spellCheck
      aria-label={DOC_BLOCK_TYPES[b.type]}
      placeholder={PLACEHOLDER[b.type]}
      onChange={(e) => ops.input(b.id, e.currentTarget)}
      onKeyDown={(e) => ops.key(b.id, e)}
      onPaste={(e) => ops.paste(b.id, e)}
      onBlur={() => ops.blur(b.id)}
      style={GROW}
      className={clsx(
        "block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none focus-visible:outline-none",
        "placeholder:text-faint placeholder:opacity-0 focus:placeholder:opacity-100",
        TEXT[b.type],
        b.type === "code" && "whitespace-pre",
        done && "text-muted line-through",
      )}
    />
  ) : (
    <div className={clsx("min-h-[1lh] min-w-0 whitespace-pre-wrap break-words", TEXT[b.type], done && "text-muted line-through")}>{b.text}</div>
  );

  let body: React.ReactNode;
  if (b.type === "divider") {
    body = (
      <div
        tabIndex={canEdit ? 0 : undefined}
        role="separator"
        onKeyDown={canEdit ? (e) => ops.dividerKey(b.id, e) : undefined}
        className="rounded py-2.5 outline-none focus-visible:bg-electric/10"
      >
        <hr className="border-0 border-t border-line-strong" />
      </div>
    );
  } else if (b.type === "quote") {
    body = <div className="border-l-[3px] border-ink-2 pl-4">{text}</div>;
  } else if (b.type === "callout") {
    body = (
      <div className="flex gap-3 rounded-xl border border-line bg-[color-mix(in_srgb,var(--color-electric)_7%,var(--color-surface))] px-4 py-3">
        {canEdit ? (
          <button
            type="button"
            title="Change the icon"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => ops.cycleEmoji(b.id)}
            className="-ml-1 flex h-[26px] w-7 flex-none items-center justify-center rounded-md text-[18px] hover:bg-hover"
          >
            {b.emoji || EMOJIS[0]}
          </button>
        ) : (
          <span className="flex h-[26px] w-6 flex-none items-center justify-center text-[18px]">{b.emoji || EMOJIS[0]}</span>
        )}
        <div className="min-w-0 flex-1">{text}</div>
      </div>
    );
  } else if (b.type === "code") {
    body = <div className="overflow-x-auto rounded-lg bg-sunken px-4 py-3">{text}</div>;
  } else if (b.type === "bullet" || b.type === "number" || b.type === "todo") {
    body = (
      <div className="flex items-start gap-1.5">
        {b.type === "todo" ? (
          <span className="flex h-[26px] w-6 flex-none items-center justify-center">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!b.checked}
              aria-label={b.checked ? "Mark as not done" : "Mark as done"}
              disabled={!canEdit}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ops.toggle(b.id)}
              className={clsx(
                "flex size-[17px] items-center justify-center rounded-[5px] border transition-colors",
                b.checked ? "border-electric bg-electric text-white" : "border-line-strong bg-surface hover:bg-hover",
                !canEdit && "cursor-default",
              )}
            >
              {b.checked && <Check className="size-3" strokeWidth={3} />}
            </button>
          </span>
        ) : (
          <span className={clsx("flex h-[26px] w-6 flex-none select-none items-center text-[16px] text-ink-2", b.type === "number" ? "justify-end pr-0.5 tabular-nums" : "justify-center")}>
            {b.type === "number" ? `${numberLabel(num || 1, b.indent ?? 0)}.` : BULLETS[b.indent ?? 0]}
          </span>
        )}
        <div className="min-w-0 flex-1">{text}</div>
      </div>
    );
  } else body = text;

  return (
    <div
      data-block-row={b.id}
      className={clsx("group/row relative", SPACE[b.type])}
      onDragOver={canEdit ? (e) => ops.dragOver(b.id, e) : undefined}
      onDrop={canEdit ? (e) => ops.drop(b.id, e) : undefined}
    >
      {dropEdge && <div className={clsx("pointer-events-none absolute inset-x-0 z-10 h-[3px] rounded-full bg-electric", dropEdge === "before" ? "-top-[3px]" : "-bottom-[3px]")} />}
      {canEdit && (
        <div
          data-block-menu
          className={clsx(
            "absolute -left-12 flex items-center gap-0.5 transition-opacity",
            HANDLE[b.type],
            menuOpen ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-60",
          )}
          style={{ marginLeft: indentPx }}
        >
          <button
            type="button"
            title="Add a block below"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => ops.addBelow(b.id)}
            className="flex size-[22px] items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink-2"
          >
            <Plus className="size-4" />
          </button>
          {/* A div, not a <button>: Firefox won't start a drag from a button. */}
          <div
            role="button"
            tabIndex={0}
            draggable
            title="Drag to move · click for options"
            aria-label="Block options"
            aria-expanded={menuOpen}
            onDragStart={(e) => ops.dragStart(b.id, e)}
            onDragEnd={() => ops.dragEnd()}
            onClick={() => ops.toggleMenu(b.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                ops.toggleMenu(b.id);
              }
            }}
            className="flex h-[22px] w-[18px] cursor-grab items-center justify-center rounded-md text-faint outline-none hover:bg-hover hover:text-ink-2 focus-visible:bg-hover active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </div>
          {menuOpen && <BlockMenu block={b} index={index} ops={ops} isFirst={isFirst} isLast={isLast} />}
        </div>
      )}
      <div style={indentPx ? { paddingLeft: indentPx } : undefined}>{body}</div>
      {slash && <SlashMenu slash={slash} ops={ops} left={indentPx} />}
    </div>
  );
});

function SlashMenu({ slash, ops, left }: { slash: Slash; ops: Ops; left: number }) {
  const items = filterMenu(slash.query);
  const list = useRef<HTMLDivElement>(null);
  const active = Math.min(slash.active, items.length - 1);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={list}
      role="listbox"
      aria-label="Block types"
      onMouseDown={(e) => e.preventDefault()} // keep the caret in the block
      className="absolute top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop"
      style={{ left }}
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Blocks</div>
      {items.length ? (
        items.map((m, i) => (
          <button
            key={m.type}
            type="button"
            role="option"
            aria-selected={i === active}
            data-i={i}
            onMouseEnter={() => ops.hoverSlash(i)}
            onClick={() => ops.chooseSlash(m.type)}
            className={clsx("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left", i === active ? "bg-hover" : "hover:bg-hover")}
          >
            <span className="flex size-9 flex-none items-center justify-center rounded-lg border border-line bg-surface text-ink-2">
              <m.icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">{DOC_BLOCK_TYPES[m.type]}</span>
              <span className="block truncate text-[12px] text-muted">{m.hint}</span>
            </span>
          </button>
        ))
      ) : (
        <div className="px-2 py-2 text-[13px] text-muted">No matching blocks</div>
      )}
    </div>
  );
}

function BlockMenu({ block: b, index, ops, isFirst, isLast }: { block: DocBlock; index: number; ops: Ops; isFirst: boolean; isLast: boolean }) {
  const [turn, setTurn] = useState(false);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  const run = (f: () => void) => () => {
    ops.closeMenu();
    f();
  };
  return (
    <div
      role="menu"
      aria-label={`Block ${index + 1} options`}
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
      className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-pop"
    >
      <button type="button" className={item} onClick={() => setTurn((t) => !t)} aria-expanded={turn}>
        <Repeat2 className="size-4" /> Turn into
        <ChevronRight className={clsx("ml-auto size-4 transition-transform", turn && "rotate-90")} />
      </button>
      {turn && (
        <div className="mb-1 max-h-60 overflow-y-auto border-b border-line pb-1 pl-2">
          {MENU.map((m) => (
            <button key={m.type} type="button" className={clsx(item, m.type === b.type && "text-electric")} onClick={run(() => ops.turnInto(b.id, m.type))}>
              <m.icon className="size-4" /> {DOC_BLOCK_TYPES[m.type]}
              {m.type === b.type && <Check className="ml-auto size-3.5" />}
            </button>
          ))}
        </div>
      )}
      <button type="button" className={item} onClick={run(() => ops.duplicate(b.id))}>
        <Copy className="size-4" /> Duplicate
      </button>
      <button type="button" className={item} disabled={isFirst} onClick={run(() => ops.move(b.id, -1))}>
        <ArrowUp className="size-4" /> Move up
      </button>
      <button type="button" className={item} disabled={isLast} onClick={run(() => ops.move(b.id, 1))}>
        <ArrowDown className="size-4" /> Move down
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={clsx(item, "text-bad hover:text-bad")} onClick={run(() => ops.remove(b.id))}>
        <Trash2 className="size-4" /> Delete
      </button>
    </div>
  );
}
