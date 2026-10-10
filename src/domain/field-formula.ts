/**
 * Formula columns in Spaces: "{Budget} * 1.14", "({Price} - {Cost}) / {Price} * 100". Column names in braces,
 * numbers, + - * / ( ). Parsed by hand (no eval) so a formula can never run code. Pure, no database.
 */

/** Names referred to in braces. */
export function formulaRefs(expr: string): string[] {
  return [...expr.matchAll(/\{([^{}]{1,40})\}/g)].map((m) => m[1].trim());
}

/** Checks the shape only (characters + balanced braces / parentheses). Returns an error message or null. */
export function formulaProblem(expr: string): string | null {
  if (!expr.trim()) return "Write the formula, e.g. {Budget} * 1.14";
  if (expr.length > 300) return "Keep the formula under 300 characters.";
  const bare = expr.replace(/\{[^{}]{1,40}\}/g, "0");
  if (!/^[0-9+\-*/().\s]*$/.test(bare)) return "Use column names in {braces}, numbers and + - * / ( ) only.";
  try {
    evaluateFormula(expr, () => 1);
  } catch {
    return "That formula isn't complete — check the brackets and signs.";
  }
  return null;
}

/** Works the formula out; `value(name)` gives a column's number (null = empty → the result is empty). */
export function evaluateFormula(expr: string, value: (name: string) => number | null): number | null {
  const tokens: (number | string | null)[] = [];
  const re = /\s*(\{[^{}]{1,40}\}|\d+(?:\.\d+)?|\.\d+|[+\-*/()])/y;
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(expr);
    if (!m) throw new Error("bad token");
    const t = m[1];
    if (t.startsWith("{")) tokens.push(value(t.slice(1, -1).trim()));
    else if (/^[\d.]/.test(t)) tokens.push(Number(t));
    else tokens.push(t);
    i = re.lastIndex;
  }
  let p = 0;
  let empty = false;
  const num = (v: number | string | null): number => {
    if (v === null) {
      empty = true;
      return 0;
    }
    return v as number;
  };
  const primary = (): number => {
    const t = tokens[p++];
    if (t === "(") {
      const v = sum();
      if (tokens[p++] !== ")") throw new Error("missing )");
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    if (typeof t === "number" || t === null) return num(t);
    throw new Error("unexpected");
  };
  const product = (): number => {
    let v = primary();
    while (tokens[p] === "*" || tokens[p] === "/") {
      const op = tokens[p++];
      const r = primary();
      v = op === "*" ? v * r : r === 0 ? NaN : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (tokens[p] === "+" || tokens[p] === "-") {
      const op = tokens[p++];
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  if (!tokens.length) throw new Error("empty");
  const out = sum();
  if (p !== tokens.length) throw new Error("trailing");
  if (empty) return null;
  return Number.isFinite(out) ? Math.round(out * 100) / 100 : NaN;
}
