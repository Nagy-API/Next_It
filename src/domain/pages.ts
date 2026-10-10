/**
 * Pages inside a space: Docs (like Word), Whiteboards (sticky notes, shapes, arrows, matrices, mind maps) and
 * Sheets (rows and columns like Excel). Pure definitions — no database.
 *
 * Everything is plain JSON with plain text: never HTML, so nothing typed can run in someone else's browser.
 * `cleanContent` is the only way content gets in: it trims every string, checks every number and colour,
 * and caps sizes so one page can't grow without end.
 */

export const PAGE_KINDS = {
  doc: { label: "Doc", plural: "Docs", hint: "Write like Word: briefs, SOPs, meeting notes, scripts" },
  whiteboard: { label: "Whiteboard", plural: "Whiteboards", hint: "Sticky notes, shapes and arrows: brainstorms, matrices, flowcharts, mind maps" },
  sheet: { label: "Sheet", plural: "Sheets", hint: "Rows and columns like Excel, with simple formulas" },
} as const;
export type PageKind = keyof typeof PAGE_KINDS;
export const PAGE_KIND_LIST = Object.keys(PAGE_KINDS) as PageKind[];
export const isPageKind = (k: unknown): k is PageKind => typeof k === "string" && k in PAGE_KINDS;

/* --------------------------------- Doc --------------------------------- */

export const DOC_BLOCK_TYPES = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  p: "Text",
  bullet: "Bulleted list",
  number: "Numbered list",
  todo: "To-do",
  quote: "Quote",
  callout: "Callout",
  code: "Code",
  divider: "Divider",
} as const;
export type DocBlockType = keyof typeof DOC_BLOCK_TYPES;
/** One paragraph / heading / list item. `checked` for to-dos, `emoji` for callouts, `indent` 0–3 for lists. */
export type DocBlock = { id: string; type: DocBlockType; text: string; checked?: boolean; emoji?: string; indent?: number };
export type DocContent = { blocks: DocBlock[] };

/* ------------------------------ Whiteboard ------------------------------ */

export const WB_NODE_TYPES = {
  sticky: "Sticky note",
  rect: "Box",
  ellipse: "Circle",
  diamond: "Decision",
  text: "Text",
  /** A big labelled area (a quadrant of a matrix, a column of a journey, a frame). Drawn behind everything. */
  zone: "Area",
} as const;
export type WbNodeType = keyof typeof WB_NODE_TYPES;
/**
 * x / y / w / h in board units (1 unit = 1 px at 100% zoom). `color` is a #rrggbb fill.
 * `fontSize` 10–72. `locked` nodes can't be moved by accident (template backgrounds).
 */
export type WbNode = { id: string; type: WbNodeType; x: number; y: number; w: number; h: number; text: string; color: string; fontSize?: number; locked?: boolean };
/** An arrow (or a plain line) from one node to another, with an optional label. */
export type WbEdge = { id: string; from: string; to: string; label?: string; style?: "arrow" | "line" };
export type WhiteboardContent = { nodes: WbNode[]; edges: WbEdge[] };

/** Sticky note colours (soft, readable with dark text in both themes). */
export const STICKY_COLORS = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fed7aa", "#e2e8f0"];
/** Shape / zone colours. */
export const SHAPE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#e0569b", "#14b8a6", "#64748b", "#0b1639"];

/* --------------------------------- Sheet -------------------------------- */

export const SHEET_COL_TYPES = { text: "Text", number: "Number", money: "Money", date: "Date", check: "Checkbox" } as const;
export type SheetColType = keyof typeof SHEET_COL_TYPES;
export type SheetCol = { id: string; name: string; width?: number; type?: SheetColType };
/** `cells` maps a column id to what was typed. A value starting with "=" is a formula (see src/lib/formula.ts). */
export type SheetRow = { id: string; cells: Record<string, string> };
export type SheetContent = { cols: SheetCol[]; rows: SheetRow[] };

export type PageContent = DocContent | WhiteboardContent | SheetContent;

/* ------------------------------ Limits & helpers ------------------------------ */

export const LIMITS = {
  title: 120,
  text: 5000,
  blocks: 2000,
  nodes: 800,
  edges: 1200,
  cols: 52,
  rows: 3000,
  cell: 2000,
  /** The whole page, as JSON. */
  bytes: 1_500_000,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** A short random id for blocks, nodes, rows… (works in the browser and on the server). */
export function newId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : dflt;
};
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : newId());
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function emptyContent(kind: PageKind): PageContent {
  if (kind === "doc") return { blocks: [{ id: newId(), type: "p", text: "" }] };
  if (kind === "whiteboard") return { nodes: [], edges: [] };
  const cols: SheetCol[] = ["A", "B", "C", "D", "E"].map((n) => ({ id: newId(), name: n, width: 140, type: "text" }));
  return { cols, rows: Array.from({ length: 12 }, () => ({ id: newId(), cells: {} })) };
}

/** Makes any input a safe, bounded page of this kind. Throws only when the page is too big. */
export function cleanContent(kind: PageKind, raw: unknown): PageContent {
  const o = obj(raw);
  if (kind === "doc") {
    const blocks: DocBlock[] = arr(o.blocks)
      .slice(0, LIMITS.blocks)
      .map((b) => {
        const x = obj(b);
        const type = (typeof x.type === "string" && x.type in DOC_BLOCK_TYPES ? x.type : "p") as DocBlockType;
        const out: DocBlock = { id: id(x.id), type, text: type === "divider" ? "" : str(x.text, LIMITS.text) };
        if (type === "todo") out.checked = x.checked === true;
        if (type === "callout") out.emoji = str(x.emoji, 8) || "💡";
        if ((type === "bullet" || type === "number" || type === "todo") && x.indent) out.indent = num(x.indent, 0, 3, 0);
        return out;
      });
    return { blocks: blocks.length ? blocks : [{ id: newId(), type: "p", text: "" }] };
  }
  if (kind === "whiteboard") {
    const nodes: WbNode[] = arr(o.nodes)
      .slice(0, LIMITS.nodes)
      .map((n) => {
        const x = obj(n);
        const type = (typeof x.type === "string" && x.type in WB_NODE_TYPES ? x.type : "sticky") as WbNodeType;
        const node: WbNode = {
          id: id(x.id),
          type,
          x: num(x.x, -50_000, 50_000, 0),
          y: num(x.y, -50_000, 50_000, 0),
          w: num(x.w, 20, 6000, 180),
          h: num(x.h, 20, 6000, 120),
          text: str(x.text, LIMITS.text),
          color: typeof x.color === "string" && HEX.test(x.color) ? x.color.toLowerCase() : type === "sticky" ? STICKY_COLORS[0] : SHAPE_COLORS[0],
        };
        if (x.fontSize !== undefined) node.fontSize = num(x.fontSize, 10, 72, 15);
        if (x.locked === true) node.locked = true;
        return node;
      });
    const ids = new Set(nodes.map((n) => n.id));
    const edges: WbEdge[] = arr(o.edges)
      .slice(0, LIMITS.edges)
      .map((e) => {
        const x = obj(e);
        const edge: WbEdge = { id: id(x.id), from: str(x.from, 40), to: str(x.to, 40) };
        if (x.label) edge.label = str(x.label, 200);
        if (x.style === "line") edge.style = "line";
        return edge;
      })
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
    return { nodes, edges };
  }
  const cols: SheetCol[] = arr(o.cols)
    .slice(0, LIMITS.cols)
    .map((c) => {
      const x = obj(c);
      const type = (typeof x.type === "string" && x.type in SHEET_COL_TYPES ? x.type : "text") as SheetColType;
      return { id: id(x.id), name: str(x.name, 60) || "Column", width: num(x.width, 60, 600, 140), type };
    });
  const colIds = new Set(cols.map((c) => c.id));
  const rows: SheetRow[] = arr(o.rows)
    .slice(0, LIMITS.rows)
    .map((r) => {
      const x = obj(r);
      const cells: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj(x.cells))) if (colIds.has(k) && typeof v === "string" && v !== "") cells[k] = v.slice(0, LIMITS.cell);
      return { id: id(x.id), cells };
    });
  return { cols: cols.length ? cols : (emptyContent("sheet") as SheetContent).cols, rows };
}

/** Bytes of the JSON (to refuse giant pages before they reach the database). */
export function contentSize(c: PageContent) {
  return JSON.stringify(c).length;
}

/* ------------------------------- Templates ------------------------------- */

/** The template library's shelves (spaces, docs, whiteboards and sheets all use them). */
export const TEMPLATE_CATEGORIES = [
  "Marketing",
  "Creative",
  "Project management",
  "Operations",
  "HR",
  "Sales & CRM",
  "Finance",
  "IT & Engineering",
  "Support",
  "Professional services",
  "Strategy",
  "Personal",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** A ready page. `build` returns fresh content (new ids every time) that passes `cleanContent`. */
export type PageTemplate = {
  key: string;
  kind: PageKind;
  category: TemplateCategory;
  name: string;
  icon: string;
  description: string;
  build: () => PageContent;
};
