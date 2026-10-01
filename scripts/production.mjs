/**
 * Production start (a VPS, Docker…):  npm start  → next start on $PORT.
 * Migrations and the first seed run inside the server itself (src/instrumentation.ts), so hosts that run
 * `next start` directly (Hostinger) get exactly the same result.
 *
 * Database: DATABASE_URL=postgres://… for a PostgreSQL server, or DATABASE_URL=file:/abs/folder for the
 * built-in database. If nothing is set in production, the built-in database goes to ~/nexora-ops-data —
 * OUTSIDE the app folder, so redeploys (which replace the app folder) never touch the data.
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = `file:${path.join(os.homedir(), "nexora-ops-data")}`;
  console.log(`ℹ DATABASE_URL not set — using the built-in database at ${env.DATABASE_URL.slice(5)}`);
}
const PORT = env.PORT || "3000";
const shell = process.platform === "win32";

const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "inherit", shell, env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
