/**
 * Restore a backup of the built-in database (made with Settings → My account → Download a backup).
 *   1. STOP the app first.
 *   2. node scripts/restore.mjs path/to/ops-backup-XXXX.tar.gz [target-folder]
 * The target folder defaults to DATABASE_URL=file:<folder>, else ./local-data. It must not exist yet
 * (rename the old one first — nothing is overwritten).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const [file, target] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/restore.mjs <backup.tar.gz> [target-folder]");
  process.exit(1);
}
const url = process.env.DATABASE_URL?.trim();
const dir = path.resolve(target ?? (url?.startsWith("file:") ? url.slice(5) : "local-data"));
if (existsSync(dir)) {
  console.error(`✗ ${dir} already exists. Rename it (keep it as a safety copy), then run this again.`);
  process.exit(1);
}
const blob = new Blob([readFileSync(file)], { type: "application/gzip" });
const pg = new PGlite(dir, { loadDataDir: blob });
const { rows } = await pg.query("select count(*)::int as n from users");
await pg.close();
console.log(`✓ Restored into ${dir} (${rows[0].n} accounts). Start the app again.`);
