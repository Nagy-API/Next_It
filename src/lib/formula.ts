/**
 * Sheet formulas, like Excel's simple ones: =A1+B2*3, =SUM(B2:B20), =IF(C2>100,"Big","Small"), ="EGP "&D4.
 * Pure and SAFE: a tiny tokenizer + parser + evaluator — never eval / Function — so a typed formula can only do maths.
 *
 * A1 = column 0, row 0. A cell that is itself a formula is evaluated too (cycle-checked, max 50 deep).
 * Cells that look like numbers count as numbers: "1,250", "EGP 1,250", "$40", "15%" (= 0.15).
 * Errors come back as short codes the grid shows in the cell: #ERR (can't read it), #REF (bad cell / range),
 * #DIV/0, #VALUE (text where a number is needed), #NAME (unknown function), #CYCLE (refers to itself), #DEPTH (chain too long).
 */

export type CellGetter = (col: number, row: number) => string;
/** Optional memory shared between evaluations of one grid (same content) — makes whole-sheet display fast. */
export type FormulaCache = Map<string, unknown>;

const MAX_DEPTH = 50;
const MAX_RANGE = 100_000;
const MAX_COL = 16_384; // XFD, as in Excel
const MAX_ROW = 1_048_576;

class FormulaError {
  constructor(readonly code: string) {}
}
type Value = number | string | boolean;
type Arg = { range: Value[] } | { value: Value };

/* ------------------------------- Columns ------------------------------- */

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colName(i: number): string {
  let n = Math.max(0, Math.floor(i)) + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "A" → 0, "AA" → 26 (case-insensitive). -1 when it isn't letters. */
export function colIndex(name: string): number {
  const s = name.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* ------------------------------- Numbers ------------------------------- */

// Money people type: EGP 1,250 · 1,250 EGP · LE 500 · $40 · €12 · ج.م 300. Any 3 CAPITAL letters count as a currency
// code; the usual ones also in small letters. Case matters on purpose: "Day 5" is text, not 5.
const anyCase = (w: string) => w.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`);
const CURRENCY = String.raw`(?:[A-Z]{3}|${["egp", "usd", "eur", "gbp", "sar", "aed", "le", "l\\.e\\.?"].map(anyCase).join("|")}|ج\.م\.?|جنيه|[$€£¥])`;
const PLAIN_NUM = String.raw`[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|[-+]?\.\d+`;
const NUMBERISH = new RegExp(String.raw`^(-)?\s*(?:${CURRENCY}\s*)?(${PLAIN_NUM})\s*(?:${CURRENCY})?\s*(%)?$`);

/** "1,250" → 1250, "EGP 1,250" → 1250, "15%" → 0.15, "-$40" → -40; anything else → null. */
export function toNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = NUMBERISH.exec(s);
  if (!m) return null;
  let n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m[1]) n = -n;
  if (m[3]) n = n / 100;
  return n;
}

const NUM_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
/** 1250.456 → "1,250.46". */
export function formatNumber(n: number): string {
  return NUM_FMT.format(n);
}

// 0.1 + 0.2 → 0.3: hides floating-point noise in results.
const tidy = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(15)) : n);

/* ------------------------------ Tokenizer ------------------------------ */

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; c: number; r: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const REF_RE = /^\$?([A-Za-z]{1,4})\$?(\d+)(?![A-Za-z0-9_(])/;
const ID_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;
const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/;
const OPS = [">=", "<=", "<>", "+", "-", "*", "/", "^", "&", "(", ")", ",", ";", ":", "=", "<", ">", "%"];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    if (ch === '"') {
      let s = "";
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw new FormulaError("#ERR"); // unclosed quote
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    let m = NUM_RE.exec(rest);
    if (m) {
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    m = REF_RE.exec(rest);
    if (m) {
      const c = colIndex(m[1]);
      const r = Number(m[2]) - 1;
      if (c < 0 || c >= MAX_COL || r < 0 || r >= MAX_ROW) throw new FormulaError("#REF");
      out.push({ t: "ref", c, r });
      i += m[0].length;
      continue;
    }
    m = ID_RE.exec(rest);
    if (m) {
      out.push({ t: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => rest.startsWith(o));
    if (!op) throw new FormulaError("#ERR");
    out.push({ t: "op", v: op === ";" ? "," : op }); // ; = the argument separator in some locales
    i += op.length;
  }
  return out;
}

/* -------------------------------- Parser -------------------------------- */

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "ref"; c: number; r: number }
  | { k: "range"; c1: number; r1: number; c2: number; r2: number }
  | { k: "neg"; a: Node }
  | { k: "pct"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "fn"; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.t === "op" && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError("#ERR");
    p++;
  };

  // Lowest to highest, as in Excel: comparison, &, + -, * /, ^, unary minus, %.
  const comparison = (): Node => {
    let a = concat();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
        p++;
        a = { k: "bin", op: t.v, a, b: concat() };
      } else return a;
    }
  };
  const concat = (): Node => {
    let a = additive();
    while (isOp("&")) {
      p++;
      a = { k: "bin", op: "&", a, b: additive() };
    }
    return a;
  };
  const additive = (): Node => {
    let a = multiplicative();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        p++;
        a = { k: "bin", op: t.v, a, b: multiplicative() };
      } else return a;
    }
  };
  const multiplicative = (): Node => {
    let a = power();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) {
        p++;
        a = { k: "bin", op: t.v, a, b: power() };
      } else return a;
    }
  };
  const power = (): Node => {
    let a = unary();
    while (isOp("^")) {
      p++;
      a = { k: "bin", op: "^", a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp("-")) {
      p++;
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    let a = primary();
    while (isOp("%")) {
      p++;
      a = { k: "pct", a };
    }
    return a;
  };
  const primary = (): Node => {
    const t = toks[p++];
    if (!t) throw new FormulaError("#ERR");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "ref") {
      if (isOp(":")) {
        p++;
        const e = toks[p++];
        if (e?.t !== "ref") throw new FormulaError("#REF");
        return { k: "range", c1: Math.min(t.c, e.c), r1: Math.min(t.r, e.r), c2: Math.max(t.c, e.c), r2: Math.max(t.r, e.r) };
      }
      return { k: "ref", c: t.c, r: t.r };
    }
    if (t.t === "id") {
      if (isOp("(")) {
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          for (;;) {
            args.push(comparison());
            if (isOp(",")) {
              p++;
              continue;
            }
            break;
          }
        }
        expect(")");
        return { k: "fn", name: t.v, args };
      }
      if (t.v === "TRUE" || t.v === "FALSE") return { k: "bool", v: t.v === "TRUE" };
      // Looks like a cell but isn't one (e.g. "A0" is caught by the tokenizer; "ZZZZZ1" lands here).
      if (/^[A-Z]+\d+$/.test(t.v)) throw new FormulaError("#REF");
      throw new FormulaError("#NAME");
    }
    if (t.v === "(") {
      const e = comparison();
      expect(")");
      return e;
    }
    throw new FormulaError("#ERR");
  }

  const node = comparison();
  if (p !== toks.length) throw new FormulaError("#ERR");
  return node;
}

/* ------------------------------- Evaluator ------------------------------- */

const num = (v: Value): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === "") return 0;
  const n = toNumber(v);
  if (n === null) throw new FormulaError("#VALUE");
  return n;
};
const text = (v: Value): string => (typeof v === "number" ? String(tidy(v)) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v);
const truthy = (v: Value): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = v.trim().toUpperCase();
  if (s === "" || s === "FALSE") return false;
  if (s === "TRUE") return true;
  const n = toNumber(v);
  return n === null ? true : n !== 0;
};

function compare(op: string, a: Value, b: Value): boolean {
  let x: number | string;
  let y: number | string;
  const an = typeof a === "number" || typeof a === "boolean" ? num(a) : a === "" ? null : toNumber(a);
  const bn = typeof b === "number" || typeof b === "boolean" ? num(b) : b === "" ? null : toNumber(b);
  if ((an !== null || a === "") && (bn !== null || b === "")) {
    // Both numeric (an empty cell is 0 next to a number, as in Excel).
    x = an ?? 0;
    y = bn ?? 0;
  } else {
    x = text(a).toLowerCase(); // text compares without case, as in Excel
    y = text(b).toLowerCase();
  }
  switch (op) {
    case "=":
      return x === y;
    case "<>":
      return x !== y;
    case "<":
      return x < y;
    case ">":
      return x > y;
    case "<=":
      return x <= y;
    default:
      return x >= y;
  }
}

function roundTo(x: number, digits: number): number {
  const d = Math.max(-15, Math.min(15, Math.trunc(digits)));
  const sign = x < 0 ? -1 : 1;
  // Exponent shifting instead of x * 10^d avoids 1.005 → 1.00.
  const r = Number(`${Math.round(Number(`${Math.abs(x)}e${d}`))}e${-d}`);
  return sign * r;
}

type Ctx = { get: CellGetter; stack: Set<string>; depth: number; cache?: FormulaCache };

function cellValue(ctx: Ctx, c: number, r: number): Value {
  const raw = ctx.get(c, r) ?? "";
  if (!raw.startsWith("=")) {
    if (raw.trim() === "") return "";
    const n = toNumber(raw);
    return n === null ? raw : n;
  }
  const key = `${c},${r}`;
  if (ctx.stack.has(key)) throw new FormulaError("#CYCLE");
  const hit = ctx.cache?.get(key);
  if (hit instanceof FormulaError) throw hit;
  if (hit !== undefined) return hit as Value;
  if (ctx.depth >= MAX_DEPTH) throw new FormulaError("#DEPTH");
  ctx.stack.add(key);
  ctx.depth++;
  try {
    const v = run(ctx, raw.slice(1));
    ctx.cache?.set(key, v);
    return v;
  } catch (e) {
    // A too-long chain depends on where we started — don't remember it, a later look may succeed.
    if (e instanceof FormulaError && e.code !== "#DEPTH") ctx.cache?.set(key, e);
    throw e;
  } finally {
    ctx.stack.delete(key);
    ctx.depth--;
  }
}

function run(ctx: Ctx, src: string): Value {
  const toks = tokenize(src);
  if (!toks.length) throw new FormulaError("#ERR");
  return ev(ctx, parse(toks));
}

function rangeValues(ctx: Ctx, n: Extract<Node, { k: "range" }>): Value[] {
  if ((n.c2 - n.c1 + 1) * (n.r2 - n.r1 + 1) > MAX_RANGE) throw new FormulaError("#REF");
  const out: Value[] = [];
  for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) out.push(cellValue(ctx, c, r));
  return out;
}

function ev(ctx: Ctx, n: Node): Value {
  switch (n.k) {
    case "num":
    case "str":
    case "bool":
      return n.v;
    case "ref":
      return cellValue(ctx, n.c, n.r);
    case "range":
      throw new FormulaError("#VALUE"); // a range only makes sense inside SUM(…) etc.
    case "neg":
      return -num(ev(ctx, n.a));
    case "pct":
      return num(ev(ctx, n.a)) / 100;
    case "fn":
      return callFn(ctx, n.name, n.args);
    case "bin": {
      const a = ev(ctx, n.a);
      const b = ev(ctx, n.b);
      switch (n.op) {
        case "+":
          return num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/": {
          const d = num(b);
          if (d === 0) throw new FormulaError("#DIV/0");
          return num(a) / d;
        }
        case "^": {
          const v = Math.pow(num(a), num(b));
          if (!Number.isFinite(v)) throw new FormulaError("#VALUE");
          return v;
        }
        case "&":
          return text(a) + text(b);
        default:
          return compare(n.op, a, b);
      }
    }
  }
}

function args(ctx: Ctx, nodes: Node[]): Arg[] {
  // A single cell counts like a one-cell range (so =AVERAGE(C1) on text skips it, as in Excel).
  return nodes.map((a) => (a.k === "range" ? { range: rangeValues(ctx, a) } : a.k === "ref" ? { range: [cellValue(ctx, a.c, a.r)] } : { value: ev(ctx, a) }));
}

/** Numbers to add up: in a range only cells that are numbers count (text is skipped, as in Excel); typed values must be numbers. */
function numbers(list: Arg[]): number[] {
  const out: number[] = [];
  for (const a of list) {
    if ("range" in a) {
      for (const v of a.range) if (typeof v === "number") out.push(v);
    } else out.push(num(a.value));
  }
  return out;
}

function callFn(ctx: Ctx, name: string, nodes: Node[]): Value {
  const need = (min: number, max = Infinity) => {
    if (nodes.length < min || nodes.length > max) throw new FormulaError("#ERR");
  };
  switch (name) {
    case "SUM":
      return numbers(args(ctx, nodes)).reduce((s, x) => s + x, 0);
    case "AVERAGE":
    case "AVG": {
      const xs = numbers(args(ctx, nodes));
      if (!xs.length) throw new FormulaError("#DIV/0");
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    }
    case "MIN": {
      const xs = numbers(args(ctx, nodes));
      return xs.length ? Math.min(...xs) : 0;
    }
    case "MAX": {
      const xs = numbers(args(ctx, nodes));
      return xs.length ? Math.max(...xs) : 0;
    }
    case "COUNT": {
      let n = 0;
      for (const a of args(ctx, nodes)) {
        if ("range" in a) n += a.range.filter((v) => typeof v === "number").length;
        else if (typeof a.value === "number" || (typeof a.value === "string" && toNumber(a.value) !== null)) n++;
      }
      return n;
    }
    case "COUNTA": {
      let n = 0;
      for (const a of args(ctx, nodes)) {
        if ("range" in a) n += a.range.filter((v) => v !== "").length;
        else if (a.value !== "") n++;
      }
      return n;
    }
    case "ROUND": {
      need(1, 2);
      return roundTo(num(ev(ctx, nodes[0])), nodes[1] ? num(ev(ctx, nodes[1])) : 0);
    }
    case "ABS":
      need(1, 1);
      return Math.abs(num(ev(ctx, nodes[0])));
    case "IF":
      need(2, 3);
      // Only the chosen branch is worked out, so an error in the other one doesn't matter.
      if (truthy(ev(ctx, nodes[0]))) return ev(ctx, nodes[1]);
      return nodes[2] ? ev(ctx, nodes[2]) : false;
    case "CONCAT":
    case "CONCATENATE": {
      let s = "";
      for (const a of args(ctx, nodes)) s += "range" in a ? a.range.map(text).join("") : text(a.value);
      return s;
    }
    default:
      throw new FormulaError("#NAME");
  }
}

/* --------------------------------- API --------------------------------- */

/**
 * Works out a formula ("=A1+2" or "A1+2"). Returns a number, a string, or an error code ("#ERR", "#REF", "#DIV/0"…).
 * `self` is the cell holding the formula (so =A1 inside A1 is a #CYCLE). Pass the same `cache` for every cell of one
 * unchanged grid to evaluate a whole sheet quickly.
 */
export function evaluate(formula: string, get: CellGetter, self?: { col: number; row: number }, cache?: FormulaCache): number | string {
  const src = formula.startsWith("=") ? formula.slice(1) : formula;
  const ctx: Ctx = { get, stack: new Set(), depth: 0, cache };
  try {
    let v: Value;
    if (self) {
      // Through cellValue so the result is cached and cycles through this cell are seen.
      ctx.stack.add(`${self.col},${self.row}`);
      ctx.depth = 1;
      const key = `${self.col},${self.row}`;
      const hit = cache?.get(key);
      if (hit instanceof FormulaError) return hit.code;
      if (hit !== undefined && get(self.col, self.row) === `=${src}`) v = hit as Value;
      else {
        v = run(ctx, src);
        if (get(self.col, self.row) === `=${src}`) cache?.set(key, v);
      }
    } else v = run(ctx, src);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return "#VALUE";
      return tidy(v);
    }
    return v;
  } catch (e) {
    if (e instanceof FormulaError) {
      if (self && e.code !== "#DEPTH" && get(self.col, self.row) === `=${src}`) cache?.set(`${self.col},${self.row}`, e);
      return e.code;
    }
    return "#ERR";
  }
}

/** What a cell shows: a formula's result (numbers as 1,250.5), anything else as typed. */
export function displayValue(raw: string, get: CellGetter, self: { col: number; row: number }, cache?: FormulaCache): string {
  if (!raw.startsWith("=")) return raw;
  const v = evaluate(raw, get, self, cache);
  return typeof v === "number" ? formatNumber(v) : v;
}

/** True for the error codes `evaluate` returns (so the grid can colour them). */
export function isFormulaError(v: unknown): boolean {
  return typeof v === "string" && /^#(ERR|REF|DIV\/0|VALUE|NAME|CYCLE|DEPTH)$/.test(v);
}
