import { describe, expect, it } from "vitest";
import { colIndex, colName, displayValue, evaluate, toNumber, type CellGetter } from "@/lib/formula";

/** A grid from rows of typed values: grid([["1","2"],["3"]]) → A1=1, B1=2, A2=3. Pure — no database. */
function grid(rows: string[][]): CellGetter {
  return (c, r) => rows[r]?.[c] ?? "";
}
const none: CellGetter = () => "";
const ev = (f: string, g: CellGetter = none) => evaluate(f, g);

describe("column names", () => {
  it("turns indexes into letters and back", () => {
    expect(colName(0)).toBe("A");
    expect(colName(25)).toBe("Z");
    expect(colName(26)).toBe("AA");
    expect(colName(51)).toBe("AZ");
    expect(colName(701)).toBe("ZZ");
    expect(colName(702)).toBe("AAA");
    for (const i of [0, 1, 25, 26, 27, 51, 52, 701, 702, 16383]) expect(colIndex(colName(i))).toBe(i);
    expect(colIndex("ab")).toBe(27);
    expect(colIndex("1")).toBe(-1);
  });
});

describe("arithmetic", () => {
  it("follows precedence and parentheses", () => {
    expect(ev("=1+2*3")).toBe(7);
    expect(ev("=(1+2)*3")).toBe(9);
    expect(ev("10-4-3")).toBe(3);
    expect(ev("=8/2/2")).toBe(2);
    expect(ev("=2^3*2")).toBe(16);
    expect(ev("=2*3^2")).toBe(18);
    expect(ev("=-3+5")).toBe(2);
    expect(ev("=-(2+3)*2")).toBe(-10);
    expect(ev("=50%*200")).toBe(100);
    expect(ev("=0.1+0.2")).toBe(0.3);
    expect(ev("= 1.5 * 2 ")).toBe(3);
  });

  it("returns #DIV/0, #ERR, #NAME, #VALUE", () => {
    expect(ev("=1/0")).toBe("#DIV/0");
    expect(ev("=1/(2-2)")).toBe("#DIV/0");
    expect(ev("=1+")).toBe("#ERR");
    expect(ev("=(1+2")).toBe("#ERR");
    expect(ev("=")).toBe("#ERR");
    expect(ev('="open')).toBe("#ERR");
    expect(ev("=1 2")).toBe("#ERR");
    expect(ev("=NOPE(1)")).toBe("#NAME");
    expect(ev('=1+"abc"')).toBe("#VALUE");
  });
});

describe("cell references", () => {
  const g = grid([
    ["10", "20", "x"],
    ["1,250", "EGP 1,000", "15%"],
    ["", "=A1+B1", "=B3*2"],
  ]);

  it("reads cells (A1 = col 0, row 0), numbers with commas, currency and %", () => {
    expect(evaluate("=A1+B1", g)).toBe(30);
    expect(evaluate("=a2", g)).toBe(1250);
    expect(evaluate("=B2+A2", g)).toBe(2250);
    expect(evaluate("=C2*100", g)).toBe(15);
    expect(evaluate("=$A$1*2", g)).toBe(20);
    expect(evaluate("=A3+1", g)).toBe(1); // empty = 0
  });

  it("evaluates referenced formulas recursively", () => {
    expect(evaluate("=B3", g)).toBe(30);
    expect(evaluate("=C3+1", g)).toBe(61);
  });

  it("returns #REF for bad references and #VALUE for text in maths", () => {
    expect(evaluate("=A0", g)).toBe("#REF");
    expect(evaluate("=ZZZZZ1", g)).toBe("#REF");
    expect(evaluate("=A1:", g)).toBe("#REF");
    expect(evaluate("=C1*2", g)).toBe("#VALUE");
  });

  it("detects cycles (direct, through other cells, and self)", () => {
    const c = grid([["=B1", "=A1", "=C1+1"]]);
    expect(evaluate("=A1", c)).toBe("#CYCLE");
    expect(evaluate("=C1+1", c, { col: 2, row: 0 })).toBe("#CYCLE");
    expect(evaluate("=SUM(A2:B2)", grid([["=SUM(A2:B2)"], ["1", "=SUM(A1:A2)"]]), { col: 0, row: 0 })).toBe("#CYCLE");
  });

  it("stops very long chains but handles them in order with a shared cache", () => {
    const rows: string[][] = [["1"]];
    for (let i = 1; i < 200; i++) rows.push([`=A${i}+1`]);
    const g2 = grid(rows);
    expect(evaluate("=A200", g2)).toBe("#DEPTH");
    const cache = new Map();
    let last: number | string = 0;
    for (let r = 0; r < 200; r++) if (rows[r][0].startsWith("=")) last = evaluate(rows[r][0], g2, { col: 0, row: r }, cache);
    expect(last).toBe(200);
  });
});

describe("ranges and functions", () => {
  const g = grid([
    ["2", "4", "text"],
    ["6", "", "8"],
    ["=A1*5", "1,000", ""],
  ]);

  it("SUM over ranges (any corner order), skipping text", () => {
    expect(evaluate("=SUM(A1:A3)", g)).toBe(18);
    expect(evaluate("=sum(A3:A1)", g)).toBe(18);
    expect(evaluate("=SUM(A1:C2)", g)).toBe(20);
    expect(evaluate("=SUM(A1, B1, 10)", g)).toBe(16);
    expect(evaluate("=SUM(B3)", g)).toBe(1000);
    expect(evaluate("=A1:A3", g)).toBe("#VALUE");
  });

  it("AVERAGE / AVG, MIN, MAX", () => {
    expect(evaluate("=AVERAGE(A1:A3)", g)).toBe(6);
    expect(evaluate("=avg(A1:B1)", g)).toBe(3);
    expect(evaluate("=AVERAGE(C1)", g)).toBe("#DIV/0");
    expect(evaluate("=MIN(A1:C2)", g)).toBe(2);
    expect(evaluate("=MAX(A1:C3)", g)).toBe(1000);
    expect(evaluate("=MAX(C1)", g)).toBe(0);
  });

  it("COUNT counts numbers, COUNTA non-empty cells", () => {
    expect(evaluate("=COUNT(A1:C3)", g)).toBe(6);
    expect(evaluate("=COUNTA(A1:C3)", g)).toBe(7);
    expect(evaluate('=COUNT(1, "2", "x")', g)).toBe(2);
  });

  it("ROUND and ABS", () => {
    expect(evaluate("=ROUND(3.14159, 2)", g)).toBe(3.14);
    expect(evaluate("=ROUND(2.5)", g)).toBe(3);
    expect(evaluate("=ROUND(-2.5)", g)).toBe(-3);
    expect(evaluate("=ROUND(1.005, 2)", g)).toBe(1.01);
    expect(evaluate("=ROUND(1234, -2)", g)).toBe(1200);
    expect(evaluate("=ABS(-7)", g)).toBe(7);
    expect(evaluate("=ABS(1, 2)", g)).toBe("#ERR");
  });

  it("IF with comparisons, only working out the chosen branch", () => {
    expect(evaluate('=IF(A1>1, "big", "small")', g)).toBe("big");
    expect(evaluate('=IF(A1<1, "big", "small")', g)).toBe("small");
    expect(evaluate("=IF(A1>=2, 1, 0)", g)).toBe(1);
    expect(evaluate("=IF(A1<=1, 1, 0)", g)).toBe(0);
    expect(evaluate("=IF(A1=2, 1, 0)", g)).toBe(1);
    expect(evaluate("=IF(A1<>2, 1, 0)", g)).toBe(0);
    expect(evaluate('=IF(C1="TEXT", "same", "diff")', g)).toBe("same");
    expect(evaluate("=IF(B2=0, 1, 0)", g)).toBe(1);
    expect(evaluate("=IF(TRUE, 1, 1/0)", g)).toBe(1);
    expect(evaluate("=IF(FALSE, 1)", g)).toBe("FALSE");
    expect(evaluate("=A1>1", g)).toBe("TRUE");
    expect(evaluate("=1+2>2", g)).toBe("TRUE");
  });

  it("joins text with & and CONCAT", () => {
    expect(evaluate('="EGP "&B3', g)).toBe("EGP 1000");
    expect(evaluate('=A1&"-"&B1', g)).toBe("2-4");
    expect(evaluate('=CONCAT("a", A1, "b")', g)).toBe("a2b");
    expect(evaluate("=CONCAT(A1:B1)", g)).toBe("24");
    expect(evaluate('="say ""hi"""', g)).toBe('say "hi"');
    expect(evaluate('="a"&1+1', g)).toBe("a2");
  });

  it("refuses ranges over 100k cells", () => {
    expect(evaluate("=SUM(A1:Z5000)", g)).toBe("#REF");
  });
});

describe("toNumber and displayValue", () => {
  it("reads numbers people type", () => {
    expect(toNumber("1,250")).toBe(1250);
    expect(toNumber("EGP 1,250.50")).toBe(1250.5);
    expect(toNumber("1,250 EGP")).toBe(1250);
    expect(toNumber("$40")).toBe(40);
    expect(toNumber("-$40")).toBe(-40);
    expect(toNumber("12%")).toBe(0.12);
    expect(toNumber("Day 5")).toBeNull();
    expect(toNumber("2026-10-10")).toBeNull();
    expect(toNumber("1,2,3")).toBeNull();
    expect(toNumber("")).toBeNull();
  });

  it("formats formula results, leaves plain text alone", () => {
    const g = grid([["1234.567", "=A1*1000"]]);
    expect(displayValue("=A1", g, { col: 2, row: 0 })).toBe("1,234.57");
    expect(displayValue("=B1", g, { col: 2, row: 0 })).toBe("1,234,567");
    expect(displayValue("hello", g, { col: 2, row: 0 })).toBe("hello");
    expect(displayValue("=1/0", g, { col: 2, row: 0 })).toBe("#DIV/0");
  });
});
