import fs from "node:fs";

import { chromium } from "@playwright/test";

import { authStateDir, authStatePath, repoRoot } from "./auth-state.mjs";
import { loadE2EEnvFiles } from "./load-env.mjs";
import {
  createAdminClient,
  createParentSessionCookies,
  ensureParentUser,
  readLocalE2EConfig,
} from "./local-supabase.mjs";
import { assertStoredDashboardAccess } from "./playwright-auth.mjs";

const storageStatePath = authStatePath;
const tempStorageStatePath = `${storageStatePath}.tmp`;
function toPlaywrightCookies(config, cookies) {
  return cookies.map(({ name, value, options }) => ({
    name,
    value,
    url: config.baseUrl,
    httpOnly: options?.httpOnly ?? false,
    secure: options?.secure ?? false,
    sameSite:
      options?.sameSite === "strict"
        ? "Strict"
        : options?.sameSite === "none"
          ? "None"
          : "Lax",
    expires:
      typeof options?.maxAge === "number"
        ? Math.floor(Date.now() / 1000) + options.maxAge
        : -1,
  }));
}

async function ensureUsableStoredSession(browser, config, statePath) {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    storageState: statePath,
  });

  try {
    const page = await context.newPage();
    await assertStoredDashboardAccess(page);
  } finally {
    await context.close();
  }
}

export default async function globalSetup() {
  loadE2EEnvFiles(repoRoot);
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);

  await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });

  const sessionCookies = await createParentSessionCookies(config);

  const browser = await chromium.launch({ headless: true });

  try {
    fs.mkdirSync(authStateDir, { recursive: true });
    fs.rmSync(tempStorageStatePath, { force: true });

    if (fs.existsSync(storageStatePath)) {
      try {
        await ensureUsableStoredSession(browser, config, storageStatePath);
        return;
      } catch (error) {
        fs.rmSync(storageStatePath, { force: true });
        console.warn(
          `[e2e global setup] Discarding stale auth storage state after replay failure: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const loginContext = await browser.newContext({ baseURL: config.baseUrl });

    try {
      await loginContext.addCookies(toPlaywrightCookies(config, sessionCookies));
      const warmPage = await loginContext.newPage();
      await assertStoredDashboardAccess(warmPage, 30_000);
      await loginContext.storageState({ path: tempStorageStatePath });
    } finally {
      await loginContext.close();
    }

    await ensureUsableStoredSession(browser, config, tempStorageStatePath);
    fs.renameSync(tempStorageStatePath, storageStatePath);

    if (!fs.existsSync(storageStatePath)) {
      throw new Error(
        `Global E2E auth setup completed without creating storage state at ${storageStatePath}.`,
      );
    }
  } finally {
    fs.rmSync(tempStorageStatePath, { force: true });
    await browser.close();
  }
}
