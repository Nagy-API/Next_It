/** Password rules and safe redirects — plain functions, usable anywhere (server, scripts, tests). */

const COMMON = ["password", "12345678", "123456789", "1234567890", "qwertyuiop", "nexora@2026", "nexora2026", "password123", "iloveyou"];

/** Returns a message when the password is too weak, else null. */
export function passwordProblem(pw: string, ctx: { username?: string; name?: string } = {}): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  const low = pw.toLowerCase();
  if (COMMON.includes(low)) return "That password is too common — choose another.";
  if (process.env.SEED_DEFAULT_PASSWORD && pw === process.env.SEED_DEFAULT_PASSWORD) return "Choose your own password, not the starting one.";
  if (ctx.username && low.includes(ctx.username.toLowerCase())) return "Don't use your username in the password.";
  if (/^(.)\1+$/.test(pw)) return "That password is too simple.";
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds < 2) return "Mix letters with numbers or symbols.";
  return null;
}

/** Only same-site paths are allowed after sign-in (no //evil.com or /\evil.com). */
export function safeNext(next: string) {
  return /^\/(?![/\\])/.test(next) ? next : "/";
}
