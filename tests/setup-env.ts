import "dotenv/config";
// Integration tests always run against the dedicated test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://nexora:nexora@localhost:5432/nexora_test";
