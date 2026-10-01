/**
 * One command to try NEXORA Ops on a single computer — no Docker, no PostgreSQL install.
 *   npm run local        (or double-click start-nexora.bat on Windows)
 * Uses the built-in database in ./local-data unless DATABASE_URL points to a PostgreSQL server.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = process.env.PORT || "3000";
// Same folder for the setup scripts and the (production-mode) server.
process.env.DATABASE_URL ||= `file:${path.resolve("local-data")}`;
const shell = process.platform === "win32";

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell, env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\n✗ "${cmd} ${args.join(" ")}" failed. Scroll up for the reason.`);
    process.exit(r.status ?? 1);
  }
}

// Make sure every package is really installed (an interrupted install or an antivirus can leave gaps).
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const missing = () => Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => !existsSync(`node_modules/${d}/package.json`));
if (missing().length) {
  console.log(`\n▶ Installing missing packages: ${missing().join(", ")}…`);
  run("npm", ["install", "--no-audit", "--no-fund"]);
  if (missing().length) {
    console.error(`\n✗ Still missing: ${missing().join(", ")}.`);
    console.error("  Delete the node_modules folder, check your internet connection (and that the antivirus isn't blocking it), then start again.");
    process.exit(1);
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
