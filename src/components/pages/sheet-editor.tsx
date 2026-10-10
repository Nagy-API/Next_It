"use client";

/**
 * A sheet like Excel / Google Sheets: click a cell and type, Enter goes down, Tab goes right, arrows move,
 * Shift extends a selection, Ctrl/⌘ C / V copy and paste (also from Excel), Ctrl/⌘ Z undoes.
 * Cells starting with "=" are formulas (src/lib/formula.ts — parsed by hand, never eval).
 * Only the rows on screen are drawn, so a few thousand rows stay smooth. Everything autosaves.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDownAZ, ArrowUpAZ, Calendar, CheckSquare, ChevronDown, CircleDollarSign, Hash, Plus, Trash2, Type, type LucideIcon } from "lucide-react";
import { savePageContentAction, type SaveResult } from "@/app/page-actions";
import { LIMITS, SHEET_COL_TYPES, newId, type SheetColType, type SheetContent } from "@/domain/pages";
import { colName, displayValue, formatNumber, isFormulaError, toNumber, type FormulaCache } from "@/lib/formula";

const ROW_H = 34;
const HEAD_H = 38;
const NUM_W = 48;
const TYPE_ICON: Record<SheetColType, LucideIcon> = { text: Type, number: Hash, money: CircleDollarSign, date: Calendar, check: CheckSquare };

type Pos = { r: number; c: number };
type Edit = Pos & { value: string };
type SaveState = { kind: "saved" | "saving" } | { kind: "error"; error: string };

const isChecked = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true" || v === "✓";
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

export function SheetEditor({ pageId, initial, canEdit }: { pageId: string; initial: SheetContent; canEdit: boolean }) {
  const [data, setData] = useState<SheetContent>(initial);
  const dataRef = useRef(data);
  const past = useRef<SheetContent[]>([]);
  const future = useRef<SheetContent[]>([]);
  const [sel, setSel] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [edit, setEdit] = useState<Edit | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [scroll, setScroll] = useState({ top: 0, h: 600 });
  const [menu, setMenu] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const saver = useRef<{ touch: () => void } | null>(null);
  const resize = useRef<{ c: number; x: number; w: number } | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Every change goes through here: history for undo, then autosave. */
  const commit = useCallback(
    (next: SheetContent | ((d: SheetContent) => SheetContent)) => {
      if (!canEdit) return;
      const cur = dataRef.current;
      const value = typeof next === "function" ? next(cur) : next;
      if (value === cur) return;
      past.current = [...past.current.slice(-99), cur];
      future.current = [];
      dataRef.current = value;
      setData(value);
      saver.current?.touch();
    },
    [canEdit],
  );

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
      if (!dirty || inFlight) return;
      inFlight = true;
      const sent = rev;
      setSave({ kind: "saving" });
      let res: SaveResult;
      try {
        res = await savePageContentAction(pageId, dataRef.current);
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
    const onHide = () => document.visibilityState === "hidden" && dirty && void flush();
    const onUnload = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      saver.current = null;
      clearTimeout(retry);
      if (dirty) void flush();
      clearTimeout(timer);
    };
  }, [pageId, canEdit]);

  const { cols, rows } = data;
  const raw = useCallback((r: number, c: number) => rows[r]?.cells[cols[c]?.id ?? ""] ?? "", [rows, cols]);
  // One formula memory per version of the grid: every cell shown reuses it.
  const cache = useMemo<FormulaCache>(() => new Map(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // The formula engine asks for cells as (column, row).
  const getter = useCallback((c: number, r: number) => raw(r, c), [raw]);
  const shown = useCallback((r: number, c: number) => displayValue(raw(r, c), getter, { col: c, row: r }, cache), [raw, getter, cache]);

  const range = { r1: Math.min(sel.r, anchor.r), r2: Math.max(sel.r, anchor.r), c1: Math.min(sel.c, anchor.c), c2: Math.max(sel.c, anchor.c) };
  const inRange = (r: number, c: number) => r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  /* ------------------------------ Changing cells ------------------------------ */

  const setCells = (changes: { r: number; c: number; v: string }[]) =>
    commit((d) => {
      const needRows = Math.max(d.rows.length, ...changes.map((x) => x.r + 1));
      const needCols = Math.max(d.cols.length, ...changes.map((x) => x.c + 1));
      const cols2 = [...d.cols];
      while (cols2.length < Math.min(needCols, LIMITS.cols)) cols2.push({ id: newId(), name: colName(cols2.length), width: 140, type: "text" });
      const rows2 = d.rows.map((row) => ({ ...row, cells: { ...row.cells } }));
      while (rows2.length < Math.min(needRows, LIMITS.rows)) rows2.push({ id: newId(), cells: {} });
      for (const { r, c, v } of changes) {
        const row = rows2[r];
        const col = cols2[c];
        if (!row || !col) continue;
        const val = v.slice(0, LIMITS.cell);
        if (val) row.cells[col.id] = val;
        else delete row.cells[col.id];
      }
      return { cols: cols2, rows: rows2 };
    });

  const move = (dr: number, dc: number, extend = false) => {
    const next = { r: Math.max(0, Math.min(rows.length - 1, sel.r + dr)), c: Math.max(0, Math.min(cols.length - 1, sel.c + dc)) };
    setSel(next);
    if (!extend) setAnchor(next);
    reveal(next.r);
  };

  const reveal = (r: number) => {
    const el = gridRef.current;
    if (!el) return;
    const top = r * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight - HEAD_H) el.scrollTop = top + ROW_H - el.clientHeight + HEAD_H;
  };

  const startEdit = (value?: string) => {
    if (!canEdit) return;
    const col = cols[sel.c];
    if (col?.type === "check") {
      setCells([{ r: sel.r, c: sel.c, v: isChecked(raw(sel.r, sel.c)) ? "" : "1" }]);
      return;
    }
    setEdit({ ...sel, value: value ?? raw(sel.r, sel.c) });
  };

  const finishEdit = (dr = 0, dc = 0) => {
    if (!edit) return;
    if (edit.value !== raw(edit.r, edit.c)) setCells([{ r: edit.r, c: edit.c, v: edit.value }]);
    setEdit(null);
    gridRef.current?.focus();
    if (dr || dc) move(dr, dc);
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(dataRef.current);
    dataRef.current = prev;
    setData(prev);
    saver.current?.touch();
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(dataRef.current);
    dataRef.current = next;
    setData(next);
    saver.current?.touch();
  };

  /* ------------------------------ Keyboard & clipboard ------------------------------ */

  const onKey = (e: React.KeyboardEvent) => {
    if (edit || renaming !== null) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod) return; // copy / paste are handled by the clipboard events
    const k = e.key;
    if (k === "ArrowDown") move(1, 0, e.shiftKey);
    else if (k === "ArrowUp") move(-1, 0, e.shiftKey);
    else if (k === "ArrowRight") move(0, 1, e.shiftKey);
    else if (k === "ArrowLeft") move(0, -1, e.shiftKey);
    else if (k === "Tab") move(0, e.shiftKey ? -1 : 1);
    else if (k === "Enter" || k === "F2") startEdit();
    else if ((k === "Delete" || k === "Backspace") && canEdit) {
      const ch: { r: number; c: number; v: string }[] = [];
      for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) ch.push({ r, c, v: "" });
      setCells(ch);
    } else if (k.length === 1 && canEdit) {
      // Typing on a selected cell replaces it, like Excel.
      e.preventDefault();
      startEdit(k);
      return;
    } else return;
    e.preventDefault();
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (edit) return;
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const out: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) out.push(raw(r, c).replace(/[\t\n]/g, " "));
      lines.push(out.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    e.preventDefault();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (edit || !canEdit) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").slice(0, LIMITS.rows);
    const ch: { r: number; c: number; v: string }[] = [];
    lines.forEach((line, i) => line.split("\t").slice(0, LIMITS.cols).forEach((v, j) => ch.push({ r: sel.r + i, c: sel.c + j, v })));
    setCells(ch);
    const end = { r: sel.r + lines.length - 1, c: sel.c + Math.max(...lines.map((l) => l.split("\t").length)) - 1 };
    setAnchor(sel);
    setSel(end);
  };

  /* ------------------------------ Rows & columns ------------------------------ */

  const addRows = (n: number, at = rows.length) =>
    commit((d) => (d.rows.length + n > LIMITS.rows ? d : { ...d, rows: [...d.rows.slice(0, at), ...Array.from({ length: n }, () => ({ id: newId(), cells: {} })), ...d.rows.slice(at)] }));
  const deleteRow = (r: number) => commit((d) => (d.rows.length <= 1 ? d : { ...d, rows: d.rows.filter((_, i) => i !== r) }));
  const addCol = (at = cols.length) =>
    commit((d) => (d.cols.length >= LIMITS.cols ? d : { ...d, cols: [...d.cols.slice(0, at), { id: newId(), name: colName(d.cols.length), width: 140, type: "text" as const }, ...d.cols.slice(at)] }));
  const deleteCol = (c: number) => commit((d) => (d.cols.length <= 1 ? d : { ...d, cols: d.cols.filter((_, i) => i !== c) }));
  const setCol = (c: number, patch: Partial<SheetContent["cols"][number]>) => commit((d) => ({ ...d, cols: d.cols.map((x, i) => (i === c ? { ...x, ...patch } : x)) }));
  const sortBy = (c: number, dir: 1 | -1) =>
    commit((d) => {
      const id = d.cols[c].id;
      const key = (row: SheetContent["rows"][number]) => row.cells[id] ?? "";
      const filled = d.rows.filter((r) => key(r) !== "");
      const empty = d.rows.filter((r) => key(r) === "");
      filled.sort((a, b) => {
        const na = toNumber(key(a));
        const nb = toNumber(key(b));
        if (na !== null && nb !== null) return (na - nb) * dir;
        return key(a).localeCompare(key(b), undefined, { numeric: true }) * dir;
      });
      return { ...d, rows: [...filled, ...empty] };
    });

  // Dragging a header's edge resizes the column.
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const r = resize.current;
      if (!r) return;
      const w = Math.max(60, Math.min(600, r.w + e.clientX - r.x));
      setData((d) => ({ ...d, cols: d.cols.map((x, i) => (i === r.c ? { ...x, width: w } : x)) }));
    };
    const up = () => {
      if (!resize.current) return;
      resize.current = null;
      past.current.push(dataRef.current);
      saver.current?.touch();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // The grid's own height, for drawing only the visible rows.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScroll((s) => ({ ...s, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ Drawing ------------------------------ */

  const first = Math.max(0, Math.floor(scroll.top / ROW_H) - 8);
  const last = Math.min(rows.length, Math.ceil((scroll.top + scroll.h) / ROW_H) + 8);
  const widths = cols.map((c) => c.width ?? 140);
  const total = NUM_W + widths.reduce((a, b) => a + b, 0);

  // Count / sum / average of the selection, like the status bar in Sheets.
  const nums: number[] = [];
  let filledCount = 0;
  if ((range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) <= 20_000)
    for (let r = range.r1; r <= range.r2; r++)
      for (let c = range.c1; c <= range.c2; c++) {
        const v = shown(r, c);
        if (v !== "") filledCount++;
        const n = toNumber(v);
        if (n !== null) nums.push(n);
      }
  const sum = nums.reduce((a, b) => a + b, 0);

  const cellText = (r: number, c: number) => {
    const col = cols[c];
    const v = shown(r, c);
    if (!v) return "";
    if (col.type === "money") {
      const n = toNumber(v);
      return n === null ? v : `EGP ${formatNumber(n)}`;
    }
    if (col.type === "number") {
      const n = toNumber(v);
      return n === null ? v : formatNumber(n);
    }
    if (col.type === "date") return dmy(v);
    return v;
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
      {/* Formula bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-subtle px-2 py-1.5">
        <span className="w-14 shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-center font-mono text-[12.5px] font-semibold text-ink-2">
          {colName(sel.c)}
          {sel.r + 1}
        </span>
        <span className="font-mono text-[13px] italic text-faint">ƒx</span>
        <input
          value={edit && edit.r === sel.r && edit.c === sel.c ? edit.value : raw(sel.r, sel.c)}
          readOnly={!canEdit}
          onFocus={() => canEdit && !edit && setEdit({ ...sel, value: raw(sel.r, sel.c) })}
          onChange={(e) => setEdit({ ...sel, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishEdit(1, 0);
            else if (e.key === "Escape") {
              setEdit(null);
              gridRef.current?.focus();
            }
          }}
          onBlur={() => edit && finishEdit()}
          placeholder={canEdit ? "Type a value, or a formula like =SUM(B1:B10)" : ""}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-[13px] text-ink outline-none focus:border-electric"
          aria-label="Cell content"
        />
        <SaveBadge save={save} canEdit={canEdit} />
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKey}
        onCopy={onCopy}
        onPaste={onPaste}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, h: e.currentTarget.clientHeight })}
        className="relative min-h-0 flex-1 overflow-auto outline-none"
        role="grid"
        aria-label="Sheet"
      >
        <div style={{ width: total, height: HEAD_H + rows.length * ROW_H }} className="relative">
          {/* Header row */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-subtle" style={{ height: HEAD_H, width: total }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-subtle" style={{ width: NUM_W }} />
            {cols.map((col, c) => {
              const Icon = TYPE_ICON[col.type ?? "text"];
              return (
                <div key={col.id} className={clsx("group/h relative flex shrink-0 items-center gap-1 border-r border-line px-2", c >= range.c1 && c <= range.c2 && "bg-electric-soft")} style={{ width: widths[c] }}>
                  <Icon className="size-3.5 shrink-0 text-faint" />
                  <span className="shrink-0 font-mono text-[10.5px] text-faint">{colName(c)}</span>
                  {renaming === c ? (
                    <input
                      autoFocus
                      defaultValue={col.name}
                      maxLength={60}
                      onBlur={(e) => {
                        setCol(c, { name: e.target.value.trim() || col.name });
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-6 min-w-0 flex-1 rounded border border-electric bg-surface px-1 text-[12.5px] font-semibold outline-none"
                    />
                  ) : (
                    <span onDoubleClick={() => canEdit && setRenaming(c)} className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-2" title={canEdit ? "Double-click to rename" : col.name}>
                      {col.name}
                    </span>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => setMenu(menu === c ? null : c)} className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-faint opacity-0 hover:bg-hover hover:text-ink group-hover/h:opacity-100" aria-label={`${col.name} menu`}>
                      <ChevronDown className="size-3.5" />
                    </button>
                  )}
                  {canEdit && (
                    <span
                      onPointerDown={(e) => {
                        e.preventDefault();
                        resize.current = { c, x: e.clientX, w: widths[c] };
                      }}
                      className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-electric/40"
                      aria-hidden
                    />
                  )}
                  {menu === c && (
                    <ColMenu
                      type={col.type ?? "text"}
                      onClose={() => setMenu(null)}
                      onRename={() => setRenaming(c)}
                      onType={(t) => setCol(c, { type: t })}
                      onSort={(d) => sortBy(c, d)}
                      onInsert={(side) => addCol(side === "left" ? c : c + 1)}
                      onDelete={() => deleteCol(c)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Visible rows */}
          {rows.slice(first, last).map((row, i) => {
            const r = first + i;
            return (
              <div key={row.id} className="group/r absolute left-0 flex" style={{ top: HEAD_H + r * ROW_H, height: ROW_H, width: total }}>
                <div className={clsx("sticky left-0 z-10 flex shrink-0 items-center justify-center border-b border-r border-line bg-subtle text-[11.5px] tabular-nums text-faint", r >= range.r1 && r <= range.r2 && "bg-electric-soft text-electric")} style={{ width: NUM_W }}>
                  <span className={clsx(canEdit && "group-hover/r:hidden")}>{r + 1}</span>
                  {canEdit && (
                    <span className="hidden items-center gap-0.5 group-hover/r:flex">
                      <button type="button" onClick={() => addRows(1, r + 1)} className="grid size-4 cursor-pointer place-items-center rounded text-muted hover:bg-hover hover:text-ink" title="Insert a row below" aria-label="Insert a row below">
                        <Plus className="size-3" />
                      </button>
                      <button type="button" onClick={() => deleteRow(r)} className="grid size-4 cursor-pointer place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad" title="Delete this row" aria-label="Delete this row">
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  )}
                </div>
                {cols.map((col, c) => {
                  const selected = sel.r === r && sel.c === c;
                  const editing = edit && edit.r === r && edit.c === c;
                  const text = cellText(r, c);
                  const right = col.type === "number" || col.type === "money" || toNumber(shown(r, c)) !== null;
                  return (
                    <div
                      key={col.id}
                      role="gridcell"
                      aria-selected={selected}
                      onMouseDown={(e) => {
                        if (editing) return;
                        if (edit) finishEdit();
                        const p = { r, c };
                        setSel(p);
                        if (!e.shiftKey) setAnchor(p);
                        gridRef.current?.focus();
                      }}
                      onDoubleClick={() => startEdit()}
                      className={clsx(
                        "relative shrink-0 border-b border-r border-line px-2 text-[13.5px] leading-[33px] text-ink",
                        inRange(r, c) && !selected && "bg-electric-soft/70",
                        selected && "z-[5] outline outline-2 -outline-offset-1 outline-electric",
                      )}
                      style={{ width: widths[c] }}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          type={col.type === "date" && !edit.value.startsWith("=") ? "date" : "text"}
                          value={edit.value}
                          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              finishEdit(1, 0);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              finishEdit(0, e.shiftKey ? -1 : 1);
                            } else if (e.key === "Escape") {
                              setEdit(null);
                              gridRef.current?.focus();
                            }
                          }}
                          onBlur={() => finishEdit()}
                          className="absolute inset-0 z-10 h-full w-full bg-surface px-2 font-mono text-[13px] text-ink outline outline-2 -outline-offset-1 outline-electric"
                        />
                      ) : col.type === "check" ? (
                        <span className="flex h-full items-center justify-center">
                          <span className={clsx("grid size-4 place-items-center rounded border", isChecked(raw(r, c)) ? "border-ok bg-ok text-[10px] text-white" : "border-line-strong bg-surface")}>{isChecked(raw(r, c)) ? "✓" : ""}</span>
                        </span>
                      ) : (
                        <span className={clsx("block truncate", right && "text-right tabular-nums", isFormulaError(shown(r, c)) && "font-semibold text-bad")} title={text.length > 18 ? text : undefined}>
                          {text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-subtle px-2 py-1.5 text-[12.5px]">
        {canEdit && (
          <>
            <button type="button" onClick={(e) => addRows(e.shiftKey ? 10 : 1)} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium text-electric hover:bg-hover" title="Shift-click to add 10">
              <Plus className="size-3.5" /> Add row
            </button>
            <button type="button" onClick={() => addCol()} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium text-electric hover:bg-hover">
              <Plus className="size-3.5" /> Add column
            </button>
          </>
        )}
        <span className="text-faint">
          {rows.length} rows · {cols.length} columns
        </span>
        <span className="ml-auto flex gap-3 tabular-nums text-muted">
          {filledCount > 1 && <span>Count {filledCount}</span>}
          {nums.length > 0 && (range.r1 !== range.r2 || range.c1 !== range.c2) && (
            <>
              <span>Sum {formatNumber(sum)}</span>
              <span>Average {formatNumber(sum / nums.length)}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function ColMenu({
  type,
  onClose,
  onRename,
  onType,
  onSort,
  onInsert,
  onDelete,
}: {
  type: SheetColType;
  onClose: () => void;
  onRename: () => void;
  onType: (t: SheetColType) => void;
  onSort: (d: 1 | -1) => void;
  onInsert: (side: "left" | "right") => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const item = "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover";
  const run = (f: () => void) => () => {
    f();
    onClose();
  };
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
      <button type="button" className={item} onClick={run(onRename)}>
        <Type className="size-4 text-muted" /> Rename
      </button>
      <div className="my-1 border-t border-line" />
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Type</div>
      {(Object.keys(SHEET_COL_TYPES) as SheetColType[]).map((t) => {
        const Icon = TYPE_ICON[t];
        return (
          <button key={t} type="button" className={clsx(item, type === t && "font-semibold text-electric")} onClick={run(() => onType(t))}>
            <Icon className="size-4" /> {SHEET_COL_TYPES[t]}
          </button>
        );
      })}
      <div className="my-1 border-t border-line" />
      <button type="button" className={item} onClick={run(() => onSort(1))}>
        <ArrowDownAZ className="size-4 text-muted" /> Sort A → Z
      </button>
      <button type="button" className={item} onClick={run(() => onSort(-1))}>
        <ArrowUpAZ className="size-4 text-muted" /> Sort Z → A
      </button>
      <div className="my-1 border-t border-line" />
      <button type="button" className={item} onClick={run(() => onInsert("left"))}>
        <Plus className="size-4 text-muted" /> Insert column left
      </button>
      <button type="button" className={item} onClick={run(() => onInsert("right"))}>
        <Plus className="size-4 text-muted" /> Insert column right
      </button>
      <button type="button" className={clsx(item, "text-bad hover:bg-bad-soft")} onClick={run(onDelete)}>
        <Trash2 className="size-4" /> Delete column
      </button>
    </div>
  );
}

function SaveBadge({ save, canEdit }: { save: SaveState; canEdit: boolean }) {
  if (!canEdit) return <span className="shrink-0 rounded-full bg-sunken px-2.5 py-1 text-[11.5px] font-semibold text-muted">View only</span>;
  return (
    <span
      className={clsx("max-w-[240px] shrink-0 truncate rounded-full px-2.5 py-1 text-[11.5px] font-semibold", save.kind === "error" ? "bg-bad-soft text-bad" : save.kind === "saving" ? "bg-sunken text-muted" : "bg-ok-soft text-ok")}
      title={save.kind === "error" ? save.error : undefined}
    >
      {save.kind === "error" ? save.error : save.kind === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
