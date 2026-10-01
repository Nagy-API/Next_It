import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { MIGRATIONS } from "@/db/migrations.generated";

describe("Embedded migrations", () => {
  it("match drizzle/ exactly (run `node scripts/embed-migrations.mjs` after adding a migration)", () => {
    expect(MIGRATIONS).toEqual(readMigrationFiles({ migrationsFolder: "./drizzle" }));
  });
});
