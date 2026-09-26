import { defineConfig } from "@playwright/test";

/**
 * Browser acceptance tests. They change data, so point them at a throwaway database:
 *   DATABASE_URL=…/nexora_e2e npm run db:migrate && npm run db:seed
 *   DATABASE_URL=…/nexora_e2e npm run build && npm start -- -p 3001
 *   E2E_BASE_URL=http://localhost:3001 npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
