/**
 * One command to try NEXORA Ops on a single computer — no Docker, no PostgreSQL install.
 *   npm run local        (or double-click start-nexora.bat on Windows)
 * Uses the built-in database in ./local-data unless DATABASE_URL points to a PostgreSQL server.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || "3000";
const shell = process.platform === "win32";

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell, env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\n✗ "${cmd} ${args.join(" ")}" failed. Scroll up for the reason.`);
    process.exit(r.status ?? 1);
  }
}

console.log("\n▶ Preparing the database…");
run("npx", ["tsx", "scripts/migrate.ts"]);
run("npx", ["tsx", "scripts/seed.ts"]);

if (!existsSync(".next/BUILD_ID") || process.argv.includes("--rebuild")) {
  console.log("\n▶ Building the app (first time only, takes a minute or two)…");
  run("npx", ["next", "build"], { NEXT_TELEMETRY_DISABLED: "1" });
}

const url = `http://localhost:${PORT}`;
console.log(`\n▶ Starting NEXORA Ops at ${url}  (sign in: shahenda / ${process.env.SEED_DEFAULT_PASSWORD || "Nexora@2026"})`);
console.log("  Keep this window open while you use it. Press Ctrl+C to stop.\n");
const server = spawn("npx", ["next", "start", "-p", PORT], {
  stdio: "inherit",
  shell,
  // Plain http on this computer / office network.
  env: { ...process.env, INSECURE_COOKIES: "1", NEXT_TELEMETRY_DISABLED: "1" },
});

// Open the browser once the server answers.
const started = Date.now();
const poll = setInterval(async () => {
  try {
    const res = await fetch(`${url}/login`);
    if (res.ok) {
      clearInterval(poll);
      const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
      spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    }
  } catch {
    if (Date.now() - started > 120_000) clearInterval(poll);
  }
}, 1000);

server.on("exit", (code) => process.exit(code ?? 0));
