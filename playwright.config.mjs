import path from "node:path";

import { defineConfig } from "@playwright/test";

import { authStatePath } from "./tests/e2e/support/auth-state.mjs";
import { loadE2EEnvFiles } from "./tests/e2e/support/load-env.mjs";

const repoRoot = import.meta.dirname;

loadE2EEnvFiles(path.resolve(repoRoot));

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["*.spec.mjs"],
  globalSetup: "./tests/e2e/support/global-setup.mjs",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    headless: true,
    storageState: authStatePath,
  },
});
