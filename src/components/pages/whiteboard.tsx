"use client";

/**
 * Whiteboard editor: sticky notes, shapes, areas and arrows on an endless board (like Miro, but simpler).
 *
 * How it is built:
 * - The board is plain HTML: every node is an absolutely positioned <div> inside one "world" layer that is moved
 *   and scaled with a CSS transform (pan / zoom never re-renders the nodes). Arrows are one SVG drawn in board units.
 * - Content lives in React state for rendering AND in `docRef` for event handlers and timers, so a handler never
 *   reads a stale copy between two renders. Pointer interactions (pan, move, resize, connect…) live in `actRef`.
 * - Undo / redo keep whole snapshots (the content is small and immutable, so a snapshot is just a reference).
 * - Every change autosaves (debounced) through `savePageContentAction`; the server cleans and size-checks it.
 * - Text is plain text rendered with `whitespace-pre-wrap` — never HTML.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import clsx from "clsx";
import {
  AArrowDown,
  AArrowUp,
  ArrowUpRight,
  BringToFront,
  Check,
  Circle,
  CloudOff,
  Copy,
  Diamond,
  Eye,
  Loader2,
  Lock,
  LockOpen,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  SendToBack,
  Slash,
  Square,
  SquareDashed,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { savePageContentAction, type SaveResult } from "@/app/page-actions";
import { LIMITS, SHAPE_COLORS, STICKY_COLORS, newId, type WbEdge, type WbNode, type WbNodeType, type WhiteboardContent } from "@/domain/pages";

/* ------------------------------- Constants ------------------------------- */

const MIN_Z = 0.2;
const MAX_Z = 3;
const HISTORY = 100;
const SAVE_DELAY = 900;
const RETRY_EVERY = 10_000;
const LINE = 1.35;
const STICKY_INK = "#1f2937";
const OFFLINE = "Couldn't save. Check your connection — your changes are kept on this screen.";

type Tool = "select" | "connect" | WbNodeType;
type View = { x: number; y: number; z: number };
type Rect = { x: number; y: number; w: number; h: number };
type Dir = "up" | "right" | "down" | "left";
type Editing = { kind: "node" | "edge"; id: string; fresh: boolean };
type SaveState = { state: "idle" | "saving" | "saved" | "error"; error?: string };

/** What the pointer is doing right now (kept in a ref: it changes on every move and nothing renders from it). */
type Act =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean; clear: boolean }
  | { kind: "move"; sx: number; sy: number; origin: Map<string, { x: number; y: number }>; before: WhiteboardContent; moved: boolean }
  | { kind: "resize"; id: string; handle: string; sx: number; sy: number; orig: Rect; before: WhiteboardContent; moved: boolean }
  | { kind: "connect"; from: string; sx: number; sy: number }
  | { kind: "band"; wx: number; wy: number; base: string[] }
  | { kind: "pinch"; d0: number; wx: number; wy: number; z0: number };

const TOOLS: { tool: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { tool: "select", label: "Select", key: "V", icon: MousePointer2 },
  { tool: "sticky", label: "Sticky note", key: "N", icon: StickyNote },
  { tool: "rect", label: "Box", key: "R", icon: Square },
  { tool: "ellipse", label: "Circle", key: "O", icon: Circle },
  { tool: "diamond", label: "Decision", key: "D", icon: Diamond },
  { tool: "text", label: "Text", key: "T", icon: Type },
  { tool: "zone", label: "Area", key: "A", icon: SquareDashed },
  { tool: "connect", label: "Arrow", key: "C", icon: ArrowUpRight },
];

const DEFAULTS: Record<WbNodeType, { w: number; h: number; fontSize: number; color: string }> = {
  sticky: { w: 180, h: 150, fontSize: 16, color: STICKY_COLORS[0] },
  rect: { w: 180, h: 90, fontSize: 15, color: SHAPE_COLORS[0] },
  ellipse: { w: 140, h: 140, fontSize: 15, color: SHAPE_COLORS[2] },
  diamond: { w: 160, h: 110, fontSize: 14, color: SHAPE_COLORS[3] },
  text: { w: 200, h: 40, fontSize: 18, color: SHAPE_COLORS[7] },
  zone: { w: 420, h: 300, fontSize: 18, color: SHAPE_COLORS[0] },
};

const HANDLES = [
  ["nw", 0, 0],
  ["n", 0.5, 0],
  ["ne", 1, 0],
  ["e", 1, 0.5],
  ["se", 1, 1],
  ["s", 0.5, 1],
  ["sw", 0, 1],
  ["w", 0, 0.5],
] as const;

const PLUS: { dir: Dir; fx: number; fy: number; dx: number; dy: number }[] = [
  { dir: "up", fx: 0.5, fy: 0, dx: 0, dy: -1 },
  { dir: "right", fx: 1, fy: 0.5, dx: 1, dy: 0 },
  { dir: "down", fx: 0.5, fy: 1, dx: 0, dy: 1 },
  { dir: "left", fx: 0, fy: 0.5, dx: -1, dy: 0 },
];

/* -------------------------------- Helpers -------------------------------- */

const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));
const clampPos = (n: number) => Math.round(Math.min(50_000, Math.max(-50_000, n)));
const mix = (c: string, pct: number, base = "transparent") => `color-mix(in srgb, ${c} ${pct}%, ${base})`;
const fontOf = (n: WbNode) => n.fontSize ?? DEFAULTS[n.type].fontSize;
const isCreate = (t: Tool): t is WbNodeType => t !== "select" && t !== "connect";
/** Which palette a node uses (text has none: it is always drawn in the ink colour). */
const family = (t: WbNodeType) => (t === "sticky" ? "sticky" : t === "text" ? null : "shape");
const center = (n: Rect) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
const attr = (el: Element, name: string) => el.closest(`[${name}]`)?.getAttribute(name) ?? null;
const intersects = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

function boundsOf(nodes: Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Room around the text inside a node (a circle or a diamond has less usable space than a box). */
function textBox(n: WbNode) {
  switch (n.type) {
    case "sticky":
      return { px: 14, py: 14 };
    case "ellipse":
      return { px: n.w * 0.15, py: n.h * 0.15 };
    case "diamond":
      return { px: n.w * 0.22, py: n.h * 0.22 };
    case "text":
      return { px: 4, py: 4 };
    case "zone":
      return { px: 14, py: 10 };
    default:
      return { px: 12, py: 10 };
  }
}

/** A rough count of wrapped lines (average glyph ≈ 0.55 em) — good enough to size boxes and centre the editor. */
function countLines(text: string, width: number, fs: number) {
  const perLine = Math.max(1, Math.floor(width / (fs * 0.55)));
  return text.split("\n").reduce((s, l) => s + Math.max(1, Math.ceil(l.length / perLine)), 0);
}

/** After typing, grow a sticky / box so the words stay visible (never shrinks it); a text hugs its words. */
function fitHeight(n: WbNode): WbNode {
  if (n.type !== "sticky" && n.type !== "rect" && n.type !== "text") return n;
  const fs = fontOf(n);
  const { px, py } = textBox(n);
  const need = Math.ceil(countLines(n.text, n.w - 2 * px, fs) * fs * LINE + 2 * py);
  if (n.type === "text") return need === n.h ? n : { ...n, h: Math.max(24, need) };
  return need > n.h ? { ...n, h: need } : n;
}

/** Height of an area's label strip: double-clicking there edits the label, anywhere else adds a sticky. */
function labelStrip(z: WbNode) {
  const fs = fontOf(z);
  return Math.max(44, countLines(z.text, z.w - 28, fs) * fs * LINE + 20);
}

/** Where the line from the node's centre towards (tx, ty) leaves its outline, plus a small gap. */
function borderPoint(n: WbNode, tx: number, ty: number, gap: number) {
  const c = center(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (!dx && !dy) return c;
  const hw = n.w / 2;
  const hh = n.h / 2;
  let t: number;
  if (n.type === "ellipse") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (n.type === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const g = gap / Math.hypot(dx, dy);
  return { x: c.x + dx * (t + g), y: c.y + dy * (t + g) };
}

/** A new node of this type centred on (cx, cy); `like` copies size and look (for "+" handles and arrow drops). */
function makeNode(type: WbNodeType, cx: number, cy: number, like?: WbNode): WbNode {
  const d = DEFAULTS[type];
  const same = like && like.type === type;
  const w = same ? like.w : d.w;
  const h = same ? (type === "text" ? d.h : like.h) : d.h;
  const n: WbNode = { id: newId(), type, x: clampPos(cx - w / 2), y: clampPos(cy - h / 2), w, h, text: "", color: same ? like.color : d.color };
  if (same && like.fontSize !== undefined) n.fontSize = like.fontSize;
  return n;
}

/* --------------------------------- Nodes --------------------------------- */

const TEXT = "whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/** One node. Memoised: moving one sticky re-renders only that sticky, panning re-renders none. */
const NodeView = memo(function NodeView({ node: n, hideText }: { node: WbNode; hideText: boolean }) {
  const fs = fontOf(n);
  const box: CSSProperties = { left: n.x, top: n.y, width: n.w, height: n.h, fontSize: fs, lineHeight: LINE };
  const text = hideText ? null : n.text;
  // "safe center" keeps the start of a long text visible instead of clipping both ends.
  const centred: CSSProperties = { alignItems: "safe center", justifyContent: "safe center" };

  if (n.type === "zone")
    return (
      <div data-node={n.id} className="absolute rounded-2xl border-2" style={{ ...box, background: mix(n.color, 10), borderColor: mix(n.color, 40) }}>
        <div className={clsx(TEXT, "absolute overflow-hidden font-bold")} style={{ left: 14, top: 10, right: 14, maxHeight: n.h - 20, color: mix(n.color, 70, "var(--color-ink)") }}>
          {text}
        </div>
      </div>
    );
  if (n.type === "sticky")
    return (
      <div
        data-node={n.id}
        className="absolute flex overflow-hidden rounded-[4px] text-center"
        style={{ ...box, ...centred, padding: 14, background: n.color, color: STICKY_INK, boxShadow: "0 1px 2px rgb(0 0 0 / 0.12), 0 6px 14px -6px rgb(0 0 0 / 0.28)" }}
      >
        <div className={TEXT}>{text}</div>
      </div>
    );
  if (n.type === "diamond") {
    const { px, py } = textBox(n);
    return (
      <div data-node={n.id} className="absolute flex overflow-hidden text-center text-ink" style={{ ...box, ...centred, padding: `${py}px ${px}px` }}>
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" style={{ fill: mix(n.color, 14, "var(--color-surface)"), stroke: n.color, strokeWidth: 2, strokeLinejoin: "round" }} />
        </svg>
        <div className={clsx(TEXT, "relative")}>{text}</div>
      </div>
    );
  }
  if (n.type === "text")
    return (
      <div data-node={n.id} className={clsx(TEXT, "absolute overflow-hidden", n.text ? "text-ink" : "text-faint")} style={{ ...box, padding: 4 }}>
        {hideText ? null : n.text || "Text"}
      </div>
    );
  const { px, py } = textBox(n);
  return (
    <div
      data-node={n.id}
      className={clsx("absolute flex overflow-hidden border-2 text-center text-ink", n.type === "ellipse" ? "rounded-[50%]" : "rounded-lg")}
      style={{ ...box, ...centred, padding: `${py}px ${px}px`, background: mix(n.color, 14, "var(--color-surface)"), borderColor: n.color }}
    >
      <div className={TEXT}>{text}</div>
    </div>
  );
});

/* --------------------------------- Edges --------------------------------- */

type LiveLink = { x1: number; y1: number; x2: number; y2: number };

/** All arrows in one SVG (drawn in board units), plus their labels as HTML so they wrap like the rest. */
const EdgeLayer = memo(function EdgeLayer({
  nodes,
  edges,
  selEdge,
  hideLabel,
  live,
  markerId,
}: {
  nodes: WbNode[];
  edges: WbEdge[];
  selEdge: string | null;
  hideLabel: string | null;
  live: LiveLink | null;
  markerId: string;
}) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const lines = useMemo(
    () =>
      edges.flatMap((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return [];
        const ca = center(a);
        const cb = center(b);
        const p = borderPoint(a, cb.x, cb.y, 2);
        const q = borderPoint(b, ca.x, ca.y, e.style === "line" ? 2 : 3);
        // Overlapping nodes: the clipped line would point backwards, so don't draw it.
        if ((q.x - p.x) * (cb.x - ca.x) + (q.y - p.y) * (cb.y - ca.y) <= 0) return [];
        return [{ e, p, q }];
      }),
    [edges, byId],
  );
  if (!lines.length && !live) return null;

  // The SVG only covers the arrows (plus a margin): a huge SVG would cost memory once the board is scaled.
  const pts = lines.flatMap(({ p, q }) => [p, q]);
  if (live) pts.push({ x: live.x1, y: live.y1 }, { x: live.x2, y: live.y2 });
  const b = boundsOf(pts.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })));
  const m = 40;
  const vb = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };

  return (
    <>
      <svg className="pointer-events-none absolute overflow-visible" style={{ left: vb.x, top: vb.y, width: vb.w, height: vb.h }} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} aria-hidden>
        <defs>
          {(["n", "s"] as const).map((k) => (
            <marker key={k} id={`${markerId}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0.8 L10,5 L0,9.2 z" style={{ fill: k === "s" ? "var(--color-electric)" : "var(--color-ink-2)" }} />
            </marker>
          ))}
        </defs>
        {lines.map(({ e, p, q }) => {
          const sel = e.id === selEdge;
          return (
            <g key={e.id}>
              {/* A wide invisible stroke makes thin arrows easy to click (and to tap). */}
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} data-edge={e.id} style={{ stroke: "transparent", strokeWidth: 16, pointerEvents: "stroke", cursor: "pointer" }} />
              <line
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                markerEnd={e.style === "line" ? undefined : `url(#${markerId}-${sel ? "s" : "n"})`}
                style={{ stroke: sel ? "var(--color-electric)" : "var(--color-ink-2)", strokeWidth: sel ? 2.5 : 1.75, strokeLinecap: "round" }}
              />
            </g>
          );
        })}
        {live && (
          <line x1={live.x1} y1={live.y1} x2={live.x2} y2={live.y2} markerEnd={`url(#${markerId}-s)`} style={{ stroke: "var(--color-electric)", strokeWidth: 2, strokeDasharray: "6 5" }} />
        )}
      </svg>
      {lines.map(({ e, p, q }) =>
        e.label && e.id !== hideLabel ? (
          <div
            key={e.id}
            data-edge={e.id}
            className={clsx(
              TEXT,
              "absolute max-w-[220px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border bg-surface px-1.5 py-0.5 text-center text-[13px] leading-snug text-ink-2 shadow-card",
              e.id === selEdge ? "border-electric" : "border-line",
            )}
            style={{ left: (p.x + q.x) / 2, top: (p.y + q.y) / 2 }}
          >
            {e.label}
          </div>
        ) : null,
      )}
    </>
  );
});

/* ------------------------------- Selection ------------------------------- */

/** Rings, resize handles and "+" buttons, drawn in board units but sized by 1/zoom so they stay the same on screen. */
function SelectionOverlay({ nodes, z, handles, plus, hover }: { nodes: WbNode[]; z: number; handles: boolean; plus: boolean; hover: WbNode | null }) {
  const one = nodes.length === 1 ? nodes[0] : null;
  const s = 12 / z;
  const r = 11 / z;
  const off = 28 / z;
  const ring = (n: WbNode, dashed: boolean, key: string) => (
    <div
      key={key}
      className="pointer-events-none absolute"
      style={{
        left: n.x - 3 / z,
        top: n.y - 3 / z,
        width: n.w + 6 / z,
        height: n.h + 6 / z,
        border: `${2 / z}px ${dashed ? "dashed" : "solid"} var(--color-electric)`,
        borderRadius: n.type === "ellipse" ? "50%" : 8 / z,
      }}
    />
  );
  return (
    <>
      {nodes.map((n) => ring(n, !!n.locked, n.id))}
      {hover && ring(hover, true, "hover")}
      {one &&
        handles &&
        HANDLES.map(([h, fx, fy]) => (
          <div
            key={h}
            data-handle={h}
            data-hid={one.id}
            className="absolute rounded-[3px] bg-surface"
            style={{ left: one.x + fx * one.w - s / 2, top: one.y + fy * one.h - s / 2, width: s, height: s, border: `${1.5 / z}px solid var(--color-electric)`, cursor: `${h}-resize` }}
          />
        ))}
      {one &&
        plus &&
        PLUS.map((p) => (
          <div
            key={p.dir}
            data-plus={p.dir}
            title="Add a connected shape"
            className="absolute flex cursor-pointer items-center justify-center rounded-full bg-electric text-white opacity-70 shadow-pop transition-opacity hover:opacity-100"
            style={{ left: one.x + p.fx * one.w + p.dx * off - r, top: one.y + p.fy * one.h + p.dy * off - r, width: 2 * r, height: 2 * r }}
          >
            <Plus style={{ width: 14 / z, height: 14 / z }} strokeWidth={3} className="pointer-events-none" />
          </div>
        ))}
    </>
  );
}

/* --------------------------------- Chrome -------------------------------- */

function IconBtn({ label, onClick, disabled, active, children, danger }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background,color,transform] active:scale-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[17px]",
        active ? "bg-electric/15 text-electric" : danger ? "text-bad hover:bg-bad-soft" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const Sep = ({ vertical }: { vertical?: boolean }) => <span aria-hidden className={vertical ? "mx-1.5 my-1 h-px shrink-0 bg-line" : "mx-0.5 h-5 w-px shrink-0 bg-line"} />;

/* --------------------------------- Editor -------------------------------- */

export function WhiteboardEditor({ pageId, initial, canEdit }: { pageId: string; initial: WhiteboardContent; canEdit: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const markerId = "wb" + useId().replace(/[^A-Za-z0-9_-]/g, "");

  const [doc, setDocState] = useState<WhiteboardContent>(initial);
  const docRef = useRef<WhiteboardContent>(initial);
  const [view, setViewState] = useState<View>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef<View>({ x: 0, y: 0, z: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });

  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [link, setLink] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null);
  const [band, setBand] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const actRef = useRef<Act | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lastTapRef = useRef<{ t: number; x: number; y: number; target: string } | null>(null);

  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const pastRef = useRef<WhiteboardContent[]>([]);
  const futureRef = useRef<WhiteboardContent[]>([]);

  // Autosave: every change bumps `version`; a save that succeeds records the version it sent.
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const versionRef = useRef(0);
  const savedRef = useRef(0);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageIdRef = useRef(pageId);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    pageIdRef.current = pageId;
    canEditRef.current = canEdit;
  }, [pageId, canEdit]);

  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);
  const zones = useMemo(() => doc.nodes.filter((n) => n.type === "zone"), [doc.nodes]);
  const items = useMemo(() => doc.nodes.filter((n) => n.type !== "zone"), [doc.nodes]);

  /* ----------------------------- Saving ----------------------------- */

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // A save already on its way loops below and picks up whatever changed meanwhile.
    if (!canEditRef.current || savingRef.current) return;
    savingRef.current = true;
    try {
      while (versionRef.current !== savedRef.current) {
        const v = versionRef.current;
        setSave({ state: "saving" });
        let r: SaveResult;
        try {
          r = await savePageContentAction(pageIdRef.current, docRef.current);
        } catch {
          r = { ok: false, error: OFFLINE };
        }
        if (!r.ok) {
          setSave({ state: "error", error: r.error });
          return;
        }
        savedRef.current = v;
      }
      setSave({ state: "saved" });
    } finally {
      savingRef.current = false;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    versionRef.current += 1;
    if (!canEditRef.current) return;
    setSave((s) => (s.state === "error" ? s : { state: "saving" }));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveNow(), SAVE_DELAY);
  }, [saveNow]);

  // While a save keeps failing, try again every few seconds (a new change also retries straight away).
  useEffect(() => {
    if (save.state !== "error") return;
    const t = setInterval(() => void saveNow(), RETRY_EVERY);
    return () => clearInterval(t);
  }, [save.state, saveNow]);

  // Leaving the tab (or closing it) saves at once; closing with unsaved work asks first.
  useEffect(() => {
    const dirty = () => canEditRef.current && versionRef.current !== savedRef.current;
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty()) void saveNow();
    };
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty()) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBefore);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBefore);
      if (dirty()) void saveNow();
    };
  }, [saveNow]);

  /* ---------------------------- Content ---------------------------- */

  const setDoc = useCallback((next: WhiteboardContent) => {
    docRef.current = next;
    setDocState(next);
  }, []);

  const syncHist = () => setHist({ undo: pastRef.current.length, redo: futureRef.current.length });

  /** A change people can undo. `before` defaults to the content right now (the drag code passes the pre-drag one). */
  const commit = (next: WhiteboardContent, before: WhiteboardContent = docRef.current) => {
    if (next === before) return;
    pastRef.current = [...pastRef.current.slice(-(HISTORY - 1)), before];
    futureRef.current = [];
    setDoc(next);
    syncHist();
    scheduleSave();
  };

  const prune = (c: WhiteboardContent) => {
    const ids = new Set(c.nodes.map((n) => n.id));
    setSelected((s) => s.filter((id) => ids.has(id)));
    setSelEdge((e) => (e && c.edges.some((x) => x.id === e) ? e : null));
  };

  const undo = () => {
    const prev = pastRef.current.at(-1);
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, docRef.current];
    setDoc(prev);
    syncHist();
    scheduleSave();
    prune(prev);
  };

  const redo = () => {
    const next = futureRef.current.at(-1);
    if (!next) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, docRef.current];
    setDoc(next);
    syncHist();
    scheduleSave();
    prune(next);
  };

  const showNotice = (text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  const roomFor = (nodes: number, edges = 0) => {
    const d = docRef.current;
    if (d.nodes.length + nodes > LIMITS.nodes || d.edges.length + edges > LIMITS.edges) {
      showNotice(`This board is full (${LIMITS.nodes} items). Start another whiteboard.`);
      return false;
    }
    return true;
  };

  /* ----------------------------- View ----------------------------- */

  const applyView = useCallback((v: View) => {
    const next = { x: v.x, y: v.y, z: clampZ(v.z) };
    viewRef.current = next;
    setViewState(next);
  }, []);

  /** Zoom keeping the board point under (sx, sy) — the cursor or the pinch centre — where it is. */
  const zoomAt = useCallback(
    (sx: number, sy: number, z: number) => {
      const v = viewRef.current;
      const nz = clampZ(z);
      const wx = (sx - v.x) / v.z;
      const wy = (sy - v.y) / v.z;
      applyView({ x: sx - wx * nz, y: sy - wy * nz, z: nz });
    },
    [applyView],
  );

  const fitView = useCallback(
    (W: number, H: number) => {
      const nodes = docRef.current.nodes;
      if (!nodes.length) return applyView({ x: W / 2, y: H / 2, z: 1 });
      const b = boundsOf(nodes);
      const pad = 64;
      // Never zoom in past 100% just to fill the screen: a lonely sticky shouldn't look huge.
      const z = clampZ(Math.min(1, (W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h)));
      applyView({ x: W / 2 - (b.x + b.w / 2) * z, y: H / 2 - (b.y + b.h / 2) * z, z });
    },
    [applyView],
  );

  const fit = () => fitView(boxRef.current?.clientWidth ?? size.w, boxRef.current?.clientHeight ?? size.h);
  const zoomCenter = (factor: number) => {
    const el = boxRef.current;
    if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, viewRef.current.z * factor);
  };

  // Track the canvas size; its first measurement (before the first paint) fits the content into view.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      if (first && w > 0 && h > 0) {
        first = false;
        fitView(w, h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitView]);

  // Wheel and Safari trackpad gestures need a non-passive native listener so the page itself doesn't scroll/zoom.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element;
      if (t.closest("[data-chrome], textarea")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      const v = viewRef.current;
      // Trackpad pinch arrives as ctrl + wheel in Chrome, Edge and Firefox.
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, v.z * Math.exp(-e.deltaY * k * 0.0025));
      else applyView({ ...v, x: v.x - e.deltaX * k, y: v.y - e.deltaY * k });
    };
    let gz = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gz = viewRef.current.z;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      const r = el.getBoundingClientRect();
      zoomAt((g.clientX ?? r.left + r.width / 2) - r.left, (g.clientY ?? r.top + r.height / 2) - r.top, gz * (g.scale ?? 1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, [applyView, zoomAt]);

  /* --------------------------- Text editing --------------------------- */

  const startEdit = (kind: "node" | "edge", id: string, fresh = false) => {
    const d = docRef.current;
    const text = kind === "node" ? (d.nodes.find((n) => n.id === id)?.text ?? "") : (d.edges.find((e) => e.id === id)?.label ?? "");
    const ed = { kind, id, fresh };
    editingRef.current = ed;
    setEditing(ed);
    draftRef.current = text;
    setDraft(text);
  };

  /** Ends editing and keeps the text. Safe to call twice (blur + click both end up here). */
  const commitEdit = (refocus: boolean) => {
    const ed = editingRef.current;
    if (!ed) return;
    editingRef.current = null;
    setEditing(null);
    const text = draftRef.current;
    const d = docRef.current;
    if (ed.kind === "edge") {
      const e = d.edges.find((x) => x.id === ed.id);
      const label = text.trim().slice(0, 200);
      if (e && (e.label ?? "") !== label) {
        const ne: WbEdge = { ...e, label };
        if (!label) delete ne.label;
        commit({ ...d, edges: d.edges.map((x) => (x.id === e.id ? ne : x)) });
      }
    } else {
      const n = d.nodes.find((x) => x.id === ed.id);
      if (n && n.type === "text" && !text.trim()) {
        // An empty text is invisible: remove it. A brand-new one vanishes without leaving an undo step.
        const next = { nodes: d.nodes.filter((x) => x.id !== n.id), edges: d.edges.filter((x) => x.from !== n.id && x.to !== n.id) };
        if (ed.fresh) {
          pastRef.current = pastRef.current.slice(0, -1);
          setDoc(next);
          syncHist();
          scheduleSave();
        } else commit(next);
        setSelected([]);
      } else if (n && text !== n.text) {
        const nn = fitHeight({ ...n, text: text.slice(0, LIMITS.text) });
        const next = { ...d, nodes: d.nodes.map((x) => (x.id === n.id ? nn : x)) };
        // Typing into a node that was just created belongs to the same undo step as creating it.
        if (ed.fresh) {
          setDoc(next);
          scheduleSave();
        } else commit(next);
      }
    }
    if (refocus) boxRef.current?.focus({ preventScroll: true });
  };

  /* ---------------------------- Actions ---------------------------- */

  const createAt = (type: WbNodeType, wx: number, wy: number) => {
    if (!roomFor(1)) return;
    const n = makeNode(type, wx, wy);
    commit({ ...docRef.current, nodes: [...docRef.current.nodes, n] });
    setSelected([n.id]);
    setSelEdge(null);
    setTool("select");
    startEdit("node", n.id, true);
  };

  /** "+" handle: a twin of the node 80 px away, already connected — mind maps and flowcharts in a few clicks. */
  const addConnected = (dir: Dir) => {
    const d = docRef.current;
    const src = selected.length === 1 ? d.nodes.find((n) => n.id === selected[0]) : undefined;
    if (!src || src.type === "zone" || !roomFor(1, 1)) return;
    const p = PLUS.find((x) => x.dir === dir)!;
    const gap = 80;
    const n = makeNode(src.type, 0, 0, src);
    const x0 = p.dx > 0 ? src.x + src.w + gap : p.dx < 0 ? src.x - gap - n.w : src.x + (src.w - n.w) / 2;
    const y0 = p.dy > 0 ? src.y + src.h + gap : p.dy < 0 ? src.y - gap - n.h : src.y + (src.h - n.h) / 2;
    n.x = clampPos(x0);
    n.y = clampPos(y0);
    // Siblings shouldn't land on top of each other: slide sideways (alternating) until there's room.
    const others = d.nodes.filter((o) => o.type !== "zone");
    for (let k = 1; k < 16 && others.some((o) => intersects(n, o, 12)); k++) {
      const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      if (p.dx) n.y = clampPos(y0 + step * (n.h + 30));
      else n.x = clampPos(x0 + step * (n.w + 30));
    }
    const edge: WbEdge = { id: newId(), from: src.id, to: n.id };
    commit({ nodes: [...d.nodes, n], edges: [...d.edges, edge] });
    setSelected([n.id]);
    startEdit("node", n.id, true);
  };

  const removeSelection = () => {
    const d = docRef.current;
    if (selEdge) {
      commit({ ...d, edges: d.edges.filter((e) => e.id !== selEdge) });
      setSelEdge(null);
      return;
    }
    const gone = new Set(selected.filter((id) => byId.get(id) && !byId.get(id)!.locked));
    if (!gone.size) {
      if (selected.length) showNotice("Locked — unlock it first to delete it.");
      return;
    }
    commit({ nodes: d.nodes.filter((n) => !gone.has(n.id)), edges: d.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)) });
    setSelected(selected.filter((id) => !gone.has(id)));
  };

  const duplicate = () => {
    const d = docRef.current;
    const src = d.nodes.filter((n) => selected.includes(n.id));
    if (!src.length || !roomFor(src.length)) return;
    const ids = new Map<string, string>();
    const copies = src.map((n) => {
      const c: WbNode = { ...n, id: newId(), x: clampPos(n.x + 24), y: clampPos(n.y + 24) };
      delete c.locked;
      ids.set(n.id, c.id);
      return c;
    });
    // Arrows between copied nodes are copied too, so a duplicated flow stays connected.
    const edges = d.edges.flatMap((e) => (ids.has(e.from) && ids.has(e.to) ? [{ ...e, id: newId(), from: ids.get(e.from)!, to: ids.get(e.to)! }] : []));
    if (d.edges.length + edges.length > LIMITS.edges) return showNotice("This board has too many arrows to copy these.");
    commit({ nodes: [...d.nodes, ...copies], edges: [...d.edges, ...edges] });
    setSelected(copies.map((c) => c.id));
  };

  const updateSelected = (fn: (n: WbNode) => WbNode) => {
    const d = docRef.current;
    const set = new Set(selected);
    let changed = false;
    const nodes = d.nodes.map((n) => {
      if (!set.has(n.id)) return n;
      const nn = fn(n);
      if (nn !== n) changed = true;
      return nn;
    });
    if (changed) commit({ ...d, nodes });
  };

  const nudge = (dx: number, dy: number) => updateSelected((n) => (n.locked ? n : { ...n, x: clampPos(n.x + dx), y: clampPos(n.y + dy) }));

  const reorder = (front: boolean) => {
    const d = docRef.current;
    const set = new Set(selected);
    const picked = d.nodes.filter((n) => set.has(n.id));
    const rest = d.nodes.filter((n) => !set.has(n.id));
    commit({ ...d, nodes: front ? [...rest, ...picked] : [...picked, ...rest] });
  };

  /* ---------------------------- Pointer ---------------------------- */

  const startMove = (ids: string[], sx: number, sy: number) => {
    const d = docRef.current;
    const moving = new Set(ids.filter((id) => byId.get(id) && !byId.get(id)!.locked));
    // An area carries what sits inside it, like a frame.
    for (const z of d.nodes)
      if (z.type === "zone" && moving.has(z.id))
        for (const n of d.nodes) {
          const c = center(n);
          if (n.type !== "zone" && !n.locked && c.x >= z.x && c.x <= z.x + z.w && c.y >= z.y && c.y <= z.y + z.h) moving.add(n.id);
        }
    const origin = new Map(d.nodes.filter((n) => moving.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    actRef.current = { kind: "move", sx, sy, origin, before: d, moved: false };
  };

  const startPinch = () => {
    const act = actRef.current;
    if (act && (act.kind === "move" || act.kind === "resize") && act.moved) {
      setDragging(false);
      commit(docRef.current, act.before);
    }
    setLink(null);
    setBand(null);
    const [a, b] = [...pointersRef.current.values()];
    const v = viewRef.current;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    actRef.current = { kind: "pinch", d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), wx: (mx - v.x) / v.z, wy: (my - v.y) / v.z, z0: v.z };
  };

  const nodeAt = (cx: number, cy: number) => {
    const el = document.elementFromPoint(cx, cy);
    return el ? attr(el, "data-node") : null;
  };

  const onDouble = (nodeId: string | null, edgeId: string | null, wx: number, wy: number) => {
    if (!canEdit) return;
    if (edgeId) {
      setSelEdge(edgeId);
      setSelected([]);
      startEdit("edge", edgeId);
      return;
    }
    const n = nodeId ? docRef.current.nodes.find((x) => x.id === nodeId) : undefined;
    if (n && (n.type !== "zone" || wy - n.y < labelStrip(n))) {
      setSelected([n.id]);
      startEdit("node", n.id);
      return;
    }
    createAt("sticky", wx, wy);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const box = boxRef.current;
    if (!box || e.button === 2 || target.closest("[data-chrome], textarea")) return;
    commitEdit(false);
    box.focus({ preventScroll: true });
    const r = box.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x: sx, y: sy });
    try {
      box.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    if (pts.size === 2) return startPinch();
    if (pts.size > 2) return;

    const v = viewRef.current;
    const wx = (sx - v.x) / v.z;
    const wy = (sy - v.y) / v.z;
    const pan = (clear: boolean) => {
      actRef.current = { kind: "pan", sx, sy, vx: v.x, vy: v.y, moved: false, clear };
    };
    if (e.button === 1 || spaceRef.current || !canEdit) return pan(false);

    const plus = attr(target, "data-plus");
    if (plus) return addConnected(plus as Dir);
    const handle = attr(target, "data-handle");
    if (handle) {
      const n = docRef.current.nodes.find((x) => x.id === attr(target, "data-hid"));
      if (n && !n.locked) actRef.current = { kind: "resize", id: n.id, handle, sx, sy, orig: { x: n.x, y: n.y, w: n.w, h: n.h }, before: docRef.current, moved: false };
      return;
    }
    const nodeId = attr(target, "data-node");
    const edgeId = nodeId ? null : attr(target, "data-edge");

    // Our own double-click / double-tap detection: it works the same for mouse, finger and pen.
    const tapTarget = nodeId ?? (edgeId ? `e:${edgeId}` : "bg");
    const last = lastTapRef.current;
    if (last && e.timeStamp - last.t < 350 && Math.hypot(sx - last.x, sy - last.y) < 10 && last.target === tapTarget) {
      lastTapRef.current = null;
      actRef.current = null;
      return onDouble(nodeId, edgeId, wx, wy);
    }
    lastTapRef.current = { t: e.timeStamp, x: sx, y: sy, target: tapTarget };

    if (isCreate(tool)) return createAt(tool, wx, wy);
    if (tool === "connect") {
      if (!nodeId) return pan(true);
      actRef.current = { kind: "connect", from: nodeId, sx, sy };
      setLink({ from: nodeId, x: wx, y: wy, over: null });
      setSelected([]);
      setSelEdge(null);
      return;
    }
    if (edgeId) {
      setSelEdge(edgeId);
      setSelected([]);
      return pan(false);
    }
    if (nodeId) {
      const n = byId.get(nodeId);
      if (!n) return;
      setSelEdge(null);
      let ids = selected;
      if (e.shiftKey) ids = selected.includes(nodeId) ? selected.filter((i) => i !== nodeId) : [...selected, nodeId];
      else if (!selected.includes(nodeId)) ids = [nodeId];
      setSelected(ids);
      // A locked node (a template background) can be selected, but dragging it pans the board instead.
      if (n.locked || !ids.includes(nodeId)) return pan(false);
      return startMove(ids, sx, sy);
    }
    setSelEdge(null);
    if (e.shiftKey) {
      actRef.current = { kind: "band", wx, wy, base: selected };
      setBand({ x: wx, y: wy, w: 0, h: 0 });
      return;
    }
    pan(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const pts = pointersRef.current;
    if (!box || !pts.has(e.pointerId)) return;
    const r = box.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    pts.set(e.pointerId, { x: sx, y: sy });
    const act = actRef.current;
    if (!act) return;
    const v = viewRef.current;
    const wx = (sx - v.x) / v.z;
    const wy = (sy - v.y) / v.z;

    if (act.kind === "pinch") {
      const [a, b] = [...pts.values()];
      if (!a || !b) return;
      const z = clampZ((act.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / act.d0);
      applyView({ x: (a.x + b.x) / 2 - act.wx * z, y: (a.y + b.y) / 2 - act.wy * z, z });
    } else if (act.kind === "pan") {
      if (!act.moved && Math.hypot(sx - act.sx, sy - act.sy) < 4) return;
      act.moved = true;
      applyView({ ...v, x: act.vx + sx - act.sx, y: act.vy + sy - act.sy });
    } else if (act.kind === "move") {
      if (!act.moved) {
        if (Math.hypot(sx - act.sx, sy - act.sy) < 3) return;
        act.moved = true;
        setDragging(true);
      }
      const dx = (sx - act.sx) / v.z;
      const dy = (sy - act.sy) / v.z;
      const d = docRef.current;
      setDoc({
        ...d,
        nodes: d.nodes.map((n) => {
          const o = act.origin.get(n.id);
          if (!o) return n;
          const x = clampPos(o.x + dx);
          const y = clampPos(o.y + dy);
          // Same object when nothing changed, so memoised nodes skip rendering.
          return x === n.x && y === n.y ? n : { ...n, x, y };
        }),
      });
    } else if (act.kind === "resize") {
      if (!act.moved) {
        act.moved = true;
        setDragging(true);
      }
      const { x, y, w, h } = act.orig;
      const dx = (sx - act.sx) / v.z;
      const dy = (sy - act.sy) / v.z;
      const min = 24;
      let nw = w;
      let nh = h;
      if (act.handle.includes("e")) nw = Math.max(min, w + dx);
      if (act.handle.includes("w")) nw = Math.max(min, w - dx);
      if (act.handle.includes("s")) nh = Math.max(min, h + dy);
      if (act.handle.includes("n")) nh = Math.max(min, h - dy);
      // Shift on a corner keeps the proportions (a circle stays round).
      if (e.shiftKey && act.handle.length === 2) {
        const k = Math.max(nw / w, nh / h);
        nw = Math.max(min, w * k);
        nh = Math.max(min, h * k);
      }
      const nx = act.handle.includes("w") ? x + w - nw : x;
      const ny = act.handle.includes("n") ? y + h - nh : y;
      const d = docRef.current;
      setDoc({ ...d, nodes: d.nodes.map((n) => (n.id === act.id ? { ...n, x: clampPos(nx), y: clampPos(ny), w: Math.round(Math.min(6000, nw)), h: Math.round(Math.min(6000, nh)) } : n)) });
    } else if (act.kind === "connect") {
      const over = nodeAt(e.clientX, e.clientY);
      setLink({ from: act.from, x: wx, y: wy, over: over !== act.from ? over : null });
    } else if (act.kind === "band") {
      const rect = { x: Math.min(act.wx, wx), y: Math.min(act.wy, wy), w: Math.abs(wx - act.wx), h: Math.abs(wy - act.wy) };
      setBand(rect);
      // Areas only when fully inside the band, so starting a band on top of an area doesn't grab it.
      const hits = docRef.current.nodes.filter((n) => !n.locked && (n.type === "zone" ? contains(rect, n) : intersects(rect, n))).map((n) => n.id);
      setSelected([...new Set([...act.base, ...hits])]);
    }
  };

  const finishConnect = (from: string, sx0: number, sy0: number, e: ReactPointerEvent<HTMLDivElement>) => {
    setLink(null);
    const box = boxRef.current;
    const d = docRef.current;
    const src = d.nodes.find((n) => n.id === from);
    if (!box || !src) return;
    const r = box.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (Math.hypot(sx - sx0, sy - sy0) < 12) return; // a click, not a drag
    const overId = nodeAt(e.clientX, e.clientY);
    const over = overId ? d.nodes.find((n) => n.id === overId) : undefined;
    if (over?.id === src.id) return;
    // Dropping inside an area means "here", not "connect to the area".
    if (over && !(over.type === "zone" && src.type !== "zone")) {
      setTool("select");
      if (d.edges.some((x) => x.from === src.id && x.to === over.id) || !roomFor(0, 1)) return;
      const edge: WbEdge = { id: newId(), from: src.id, to: over.id };
      commit({ ...d, edges: [...d.edges, edge] });
      setSelEdge(edge.id);
      setSelected([]);
      return;
    }
    // Dropped on empty board: make the next shape right there, already connected.
    if (!roomFor(1, 1)) return;
    const v = viewRef.current;
    const n = makeNode(src.type === "zone" ? "sticky" : src.type, (sx - v.x) / v.z, (sy - v.y) / v.z, src);
    commit({ nodes: [...d.nodes, n], edges: [...d.edges, { id: newId(), from: src.id, to: n.id }] });
    setTool("select");
    setSelected([n.id]);
    setSelEdge(null);
    startEdit("node", n.id, true);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pts = pointersRef.current;
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    const box = boxRef.current;
    if (box?.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
    const act = actRef.current;
    if (!act) return;
    if (act.kind === "pinch") {
      if (pts.size < 2) actRef.current = null;
      return;
    }
    actRef.current = null;
    const cancelled = e.type === "pointercancel";
    if (act.kind === "pan") {
      if (!act.moved && act.clear && !cancelled) {
        setSelected([]);
        setSelEdge(null);
      }
    } else if (act.kind === "move" || act.kind === "resize") {
      setDragging(false);
      if (act.moved) commit(docRef.current, act.before);
    } else if (act.kind === "connect") {
      if (cancelled) setLink(null);
      else finishConnect(act.from, act.sx, act.sy, e);
    } else if (act.kind === "band") setBand(null);
  };

  /* ---------------------------- Keyboard ---------------------------- */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("textarea, input, select, [contenteditable='true']")) return;
    // A focused toolbar button handles its own Enter / Space.
    if (t !== e.currentTarget && (e.key === "Enter" || e.key === " ")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === " ") {
      e.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
      return;
    }
    if (!mod && (e.key === "+" || e.key === "=")) return zoomCenter(1.2);
    if (!mod && (e.key === "-" || e.key === "_")) return zoomCenter(1 / 1.2);
    if (!mod && e.shiftKey && (e.key === "!" || e.code === "Digit1")) return fit();
    if (!canEdit) return;
    if (mod && k === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && k === "y") {
      e.preventDefault();
      return redo();
    }
    if (mod && k === "d") {
      e.preventDefault();
      return duplicate();
    }
    if (mod && k === "a") {
      e.preventDefault();
      setSelEdge(null);
      return setSelected(docRef.current.nodes.filter((n) => !n.locked).map((n) => n.id));
    }
    if (mod || e.altKey && !e.key.startsWith("Arrow")) return;
    if (e.key === "Escape") {
      setSelected([]);
      setSelEdge(null);
      setTool("select");
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return removeSelection();
    }
    if (e.key === "Enter") {
      // preventDefault: otherwise the Enter would also land in the textarea that opens now.
      e.preventDefault();
      if (selected.length === 1) startEdit("node", selected[0]);
      else if (selEdge) startEdit("edge", selEdge);
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && selected.length) {
      e.preventDefault();
      const step = e.altKey ? 1 : 10;
      return nudge(arrows[e.key][0] * step, arrows[e.key][1] * step);
    }
    const tl = !e.shiftKey && TOOLS.find((x) => x.key.toLowerCase() === k);
    if (tl) {
      setTool(tl.tool);
      setLink(null);
    }
  };

  const releaseSpace = () => {
    if (!spaceRef.current) return;
    spaceRef.current = false;
    setSpaceHeld(false);
  };

  /* ----------------------------- Render ----------------------------- */

  const selNodes = selected.map((id) => byId.get(id)).filter((n): n is WbNode => !!n);
  const editNode = editing?.kind === "node" ? byId.get(editing.id) : undefined;
  const editEdge = editing?.kind === "edge" ? doc.edges.find((x) => x.id === editing.id) : undefined;
  const hideId = editing?.kind === "node" ? editing.id : null;
  const single = selNodes.length === 1 ? selNodes[0] : null;
  const showHandles = canEdit && tool === "select" && !!single && !single.locked;
  const showPlus = showHandles && !dragging && !editing && single!.type !== "zone";

  // The live arrow while connecting, clipped at the source node's outline.
  const linkFrom = link ? byId.get(link.from) : undefined;
  const live: LiveLink | null = link && linkFrom ? (({ x, y }) => ({ x1: x, y1: y, x2: link.x, y2: link.y }))(borderPoint(linkFrom, link.x, link.y, 2)) : null;

  const edgeMid = (e: WbEdge | undefined) => {
    const a = e && byId.get(e.from);
    const b = e && byId.get(e.to);
    return a && b ? { x: (center(a).x + center(b).x) / 2, y: (center(a).y + center(b).y) / 2 } : null;
  };

  // Dotted grid that pans and zooms with the board (spacing doubles/halves so it never gets too dense).
  let grid = 24 * view.z;
  while (grid < 12) grid *= 2;
  while (grid > 48) grid /= 2;

  // Selection bar: above the selection (or below it near the top edge), kept inside the canvas.
  const fam = selNodes.some((n) => family(n.type) === "shape") ? "shape" : selNodes.some((n) => n.type === "sticky") ? "sticky" : null;
  const palette = fam === "shape" ? SHAPE_COLORS : fam === "sticky" ? STICKY_COLORS : null;
  const curColor = selNodes.find((n) => family(n.type) === fam)?.color;
  const allLocked = selNodes.length > 0 && selNodes.every((n) => n.locked);
  const fontNow = selNodes.length ? fontOf(selNodes[0]) : 0;
  const barPos = (wr: Rect | null, wide: boolean, plusRoom: boolean) => {
    if (!wr || !size.w) return null;
    const half = Math.min(size.w / 2 - 8, wide ? 250 : 130);
    const cx = view.x + (wr.x + wr.w / 2) * view.z;
    const topY = view.y + wr.y * view.z - (plusRoom ? 44 : 12) - 44;
    const bottomY = view.y + (wr.y + wr.h) * view.z + (plusRoom ? 44 : 12);
    const top = topY >= 52 ? topY : Math.min(bottomY, size.h - 110);
    return { left: Math.min(size.w - half - 8, Math.max(half + 8, cx)), top: Math.max(8, top) };
  };
  const nodeBar = canEdit && selNodes.length > 0 && !dragging && !band && tool === "select" ? barPos(boundsOf(selNodes), !!palette, showPlus) : null;
  const selEdgeObj = selEdge ? doc.edges.find((x) => x.id === selEdge) : undefined;
  const mid = edgeMid(selEdgeObj);
  const edgeBar = canEdit && selEdgeObj && mid && !editEdge && !dragging ? barPos({ x: mid.x, y: mid.y - 14, w: 0, h: 28 }, false, false) : null;

  const textareaKeys = (e: ReactKeyboardEvent<HTMLTextAreaElement>, singleLine: boolean) => {
    if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey || singleLine) && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      commitEdit(true);
    }
  };
  const onDraft = (v: string) => {
    draftRef.current = v;
    setDraft(v);
  };

  let editor: ReactNode = null;
  if (editNode) {
    const n = editNode;
    const fs = fontOf(n);
    const { px, py } = textBox(n);
    const lh = fs * LINE;
    const leftAligned = n.type === "text" || n.type === "zone";
    const innerW = Math.max(20, n.w - 2 * px);
    const lines = countLines(draft, innerW, fs);
    const innerH = leftAligned ? lines * lh + 4 : Math.max(n.h - 2 * py, lines * lh);
    editor = (
      <textarea
        aria-label="Edit text"
        autoFocus
        value={draft}
        maxLength={LIMITS.text}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={() => commitEdit(false)}
        onKeyDown={(e) => textareaKeys(e, false)}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        className={clsx(TEXT, "absolute z-10 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none")}
        style={{
          left: n.x + px,
          top: n.y + py,
          width: innerW,
          height: innerH,
          fontSize: fs,
          lineHeight: LINE,
          // Shapes show their text vertically centred; pad the editor so the words don't jump when editing starts.
          paddingTop: leftAligned ? 0 : Math.max(0, (innerH - lines * lh) / 2),
          textAlign: leftAligned ? "left" : "center",
          fontWeight: n.type === "zone" ? 700 : undefined,
          color: n.type === "sticky" ? STICKY_INK : n.type === "zone" ? mix(n.color, 70, "var(--color-ink)") : "var(--color-ink)",
          caretColor: n.type === "sticky" ? STICKY_INK : "var(--color-electric)",
        }}
      />
    );
  } else if (editEdge) {
    const m = edgeMid(editEdge);
    if (m)
      editor = (
        <textarea
          aria-label="Arrow label"
          autoFocus
          rows={2}
          value={draft}
          maxLength={200}
          placeholder="Label"
          onChange={(e) => onDraft(e.target.value)}
          onBlur={() => commitEdit(false)}
          onKeyDown={(e) => textareaKeys(e, true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-10 w-[180px] -translate-x-1/2 -translate-y-1/2 resize-none rounded-md border-2 border-electric bg-surface px-1.5 py-1 text-center text-[13px] leading-snug text-ink shadow-pop outline-none"
          style={{ left: m.x, top: m.y }}
        />
      );
  }

  const cursor = spaceHeld ? "grab" : canEdit && (isCreate(tool) || tool === "connect") ? "crosshair" : undefined;

  return (
    <div
      ref={boxRef}
      role="application"
      aria-label="Whiteboard"
      tabIndex={0}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-subtle outline-none focus-visible:ring-2 focus-visible:ring-electric/40"
      style={{
        cursor,
        backgroundImage: "radial-gradient(circle, var(--color-line-strong) 1px, transparent 1.3px)",
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      // No browser focus / text selection on press: we manage focus ourselves (a new node's editor must keep it).
      onMouseDown={(e) => {
        if (!(e.target as Element).closest("[data-chrome], textarea")) e.preventDefault();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === " " && releaseSpace()}
      onBlur={(e) => e.target === e.currentTarget && releaseSpace()}
    >
      {/* The world: board units, moved and scaled as one layer. Areas first, so they're always behind. */}
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {zones.map((n) => (
          <NodeView key={n.id} node={n} hideText={n.id === hideId} />
        ))}
        <EdgeLayer nodes={doc.nodes} edges={doc.edges} selEdge={selEdge} hideLabel={editEdge?.id ?? null} live={live} markerId={markerId} />
        {items.map((n) => (
          <NodeView key={n.id} node={n} hideText={n.id === hideId} />
        ))}
        {canEdit && <SelectionOverlay nodes={selNodes} z={view.z} handles={showHandles} plus={showPlus} hover={link?.over ? (byId.get(link.over) ?? null) : null} />}
        {band && (
          <div
            className="pointer-events-none absolute rounded-sm bg-electric/10"
            style={{ left: band.x, top: band.y, width: band.w, height: band.h, border: `${1 / view.z}px solid var(--color-electric)` }}
          />
        )}
        {editor}
      </div>

      {doc.nodes.length === 0 && !editing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-xl border border-dashed border-line-strong bg-surface/85 px-5 py-4 text-center text-[14px] leading-relaxed text-muted shadow-card">
            <StickyNote className="mx-auto mb-2 size-6 text-faint" aria-hidden />
            {canEdit ? "Double-click anywhere to add a sticky note · pick a shape on the left" : "This whiteboard is empty."}
          </div>
        </div>
      )}

      {canEdit && (
        <div
          data-chrome
          role="toolbar"
          aria-label="Whiteboard tools"
          aria-orientation="vertical"
          className="absolute left-3 top-1/2 z-20 flex max-h-[calc(100%-1.5rem)] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop [&_button]:size-9"
        >
          {TOOLS.map((t) => (
            <IconBtn
              key={t.tool}
              label={`${t.label} (${t.key})`}
              active={tool === t.tool}
              onClick={() => {
                setTool(t.tool);
                setLink(null);
              }}
            >
              <t.icon />
            </IconBtn>
          ))}
          <Sep vertical />
          <IconBtn label="Undo (Ctrl+Z)" onClick={undo} disabled={!hist.undo}>
            <Undo2 />
          </IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!hist.redo}>
            <Redo2 />
          </IconBtn>
        </div>
      )}

      {nodeBar && (
        <div
          data-chrome
          role="toolbar"
          aria-label="Selection"
          className="absolute z-30 flex max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-pop"
          style={nodeBar}
        >
          {palette && (
            <>
              <div className="flex flex-wrap items-center gap-1 px-1">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    title="Colour"
                    onClick={() => updateSelected((n) => (family(n.type) === fam && n.color !== c ? { ...n, color: c } : n))}
                    className={clsx(
                      "size-6 shrink-0 rounded-full border border-black/10 transition-transform hover:scale-110 active:scale-95",
                      curColor === c && "ring-2 ring-electric ring-offset-2 ring-offset-surface",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <Sep />
            </>
          )}
          <IconBtn label="Smaller text" onClick={() => updateSelected((n) => fitHeight({ ...n, fontSize: Math.max(10, fontOf(n) - 2) }))} disabled={fontNow <= 10}>
            <AArrowDown />
          </IconBtn>
          <span className="min-w-6 text-center text-[12px] font-semibold tabular-nums text-muted" title="Text size">
            {fontNow}
          </span>
          <IconBtn label="Bigger text" onClick={() => updateSelected((n) => fitHeight({ ...n, fontSize: Math.min(72, fontOf(n) + 2) }))} disabled={fontNow >= 72}>
            <AArrowUp />
          </IconBtn>
          <Sep />
          <IconBtn
            label={allLocked ? "Unlock" : "Lock (can't be moved by accident)"}
            active={allLocked}
            onClick={() =>
              updateSelected((n) => {
                if (allLocked) {
                  const u = { ...n };
                  delete u.locked;
                  return u;
                }
                return n.locked ? n : { ...n, locked: true };
              })
            }
          >
            {allLocked ? <Lock /> : <LockOpen />}
          </IconBtn>
          <IconBtn label="Duplicate (Ctrl+D)" onClick={duplicate}>
            <Copy />
          </IconBtn>
          <IconBtn label="Bring to front" onClick={() => reorder(true)}>
            <BringToFront />
          </IconBtn>
          <IconBtn label="Send to back" onClick={() => reorder(false)}>
            <SendToBack />
          </IconBtn>
          <IconBtn label="Delete (Del)" onClick={removeSelection} disabled={allLocked} danger>
            <Trash2 />
          </IconBtn>
        </div>
      )}

      {edgeBar && selEdgeObj && (
        <div data-chrome role="toolbar" aria-label="Arrow" className="absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-pop" style={edgeBar}>
          <IconBtn label="Edit label (Enter)" onClick={() => startEdit("edge", selEdgeObj.id)}>
            <Pencil />
          </IconBtn>
          <IconBtn label="Arrow" active={selEdgeObj.style !== "line"} onClick={() => commit({ ...doc, edges: doc.edges.map((x) => (x.id === selEdgeObj.id ? { id: x.id, from: x.from, to: x.to, ...(x.label ? { label: x.label } : {}) } : x)) })}>
            <ArrowUpRight />
          </IconBtn>
          <IconBtn label="Plain line" active={selEdgeObj.style === "line"} onClick={() => commit({ ...doc, edges: doc.edges.map((x) => (x.id === selEdgeObj.id ? { ...x, style: "line" } : x)) })}>
            <Slash />
          </IconBtn>
          <Sep />
          <IconBtn label="Delete (Del)" onClick={removeSelection} danger>
            <Trash2 />
          </IconBtn>
        </div>
      )}

      <div data-chrome className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-pop">
        <IconBtn label="Zoom out (−)" onClick={() => zoomCenter(1 / 1.2)} disabled={view.z <= MIN_Z}>
          <Minus />
        </IconBtn>
        <button
          type="button"
          title="Back to 100%"
          aria-label={`Zoom ${Math.round(view.z * 100)}%, back to 100%`}
          onClick={() => {
            const el = boxRef.current;
            if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1);
          }}
          className="h-8 min-w-12 rounded-lg px-1.5 text-[12.5px] font-semibold tabular-nums text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {Math.round(view.z * 100)}%
        </button>
        <IconBtn label="Zoom in (+)" onClick={() => zoomCenter(1.2)} disabled={view.z >= MAX_Z}>
          <Plus />
        </IconBtn>
        <Sep />
        <button
          type="button"
          title="Fit everything in view (Shift+1)"
          onClick={fit}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          <Maximize className="size-4" aria-hidden />
          Fit
        </button>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[min(360px,70%)] flex-col items-end gap-1.5" aria-live="polite">
        {!canEdit && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-muted shadow-card">
            <Eye className="size-3.5" aria-hidden /> View only
          </span>
        )}
        {canEdit && save.state === "saving" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-muted shadow-card">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
          </span>
        )}
        {canEdit && save.state === "saved" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-muted shadow-card">
            <Check className="size-3.5 text-ok" aria-hidden /> Saved
          </span>
        )}
        {canEdit && save.state === "error" && (
          <span className="inline-flex items-start gap-1.5 rounded-xl border border-bad/30 bg-surface px-2.5 py-1 text-[12px] font-medium text-bad shadow-card">
            <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {save.error}
          </span>
        )}
      </div>

      {notice && (
        <div role="status" className="pointer-events-none absolute bottom-16 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-xl bg-strong px-4 py-2 text-center text-[13px] font-medium text-white shadow-pop">
          {notice}
        </div>
      )}
    </div>
  );
}
