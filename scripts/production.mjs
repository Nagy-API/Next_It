/**
 * Production start (Hostinger Node.js hosting, a VPS, Docker…):  npm start
 *   1. applies database migrations, 2. seeds on the very first start (safe to repeat), 3. starts the server.
 *
 * Database: DATABASE_URL=postgres://… for a PostgreSQL server, or DATABASE_URL=file:/abs/folder for the
 * built-in database. If nothing is set in production, the built-in database goes to ~/nexora-ops-data —
 * OUTSIDE the app folder, so redeploys (which replace the app folder) never touch the data.
 */
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = `file:${path.join(os.homedir(), "nexora-ops-data")}`;
  console.log(`ℹ DATABASE_URL not set — using the built-in database at ${env.DATABASE_URL.slice(5)}`);
}
const PORT = env.PORT || "3000";
const shell = process.platform === "win32";

for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
  const r = spawnSync("npx", ["tsx", script], { stdio: "inherit", shell, env });
  if (r.status !== 0) {
    console.error(`✗ ${script} failed — not starting.`);
    process.exit(r.status ?? 1);
  }
}

const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "inherit", shell, env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
