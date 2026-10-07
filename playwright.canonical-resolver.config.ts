import { defineConfig } from "@playwright/test";

const port = process.env.CANONICAL_RESOLVER_TEST_PORT ?? "3220";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/adle",
  testMatch: "canonical-resolver-bulk.spec.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "line",
  use: { baseURL, browserName: "chromium", headless: true, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/dev/resolver-preview`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
