import "dotenv/config";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { closeDb, databaseMode, db } from "../src/db";

async function main() {
  const mode = databaseMode();
  if (mode.kind === "postgres") await migratePg(db, { migrationsFolder: "./drizzle" });
  else await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder: "./drizzle" });
  console.log(`✓ Database migrated${mode.kind === "local" ? ` (built-in database in ${mode.dir})` : ""}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
