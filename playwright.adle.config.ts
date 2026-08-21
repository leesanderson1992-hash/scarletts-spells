import { defineConfig } from "@playwright/test";

const adlePort = process.env.ADLE_PLAYWRIGHT_PORT ?? "3210";
const adleBaseUrl = `http://127.0.0.1:${adlePort}`;

export default defineConfig({
  testDir: "./tests/adle",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: adleBaseUrl,
    headless: true,
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${adlePort}`,
    url: `${adleBaseUrl}/dev/adle/morphology-primitives`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "mobile-touch-chromium", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
