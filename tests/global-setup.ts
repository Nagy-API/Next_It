import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://nexora:nexora@localhost:5432/nexora_test" });
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  await pool.end();
}
