import { defineConfig } from "@playwright/test";
import base from "./playwright.adle.config";
export default defineConfig({ ...base, use: { ...base.use, baseURL: "http://127.0.0.1:3000" }, webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000/dev/adle/comparative-superlative", reuseExistingServer: true, timeout: 120_000 } });
