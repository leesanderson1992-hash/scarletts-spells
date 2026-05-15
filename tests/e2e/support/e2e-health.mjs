import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

import { loadE2EEnvFiles } from "./load-env.mjs";
import {
  createAdminClient,
  describeSupabaseEnvironment,
  ensureChild,
  ensureParentUser,
  readLocalE2EConfig,
  verifyParentCredentials,
} from "./local-supabase.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function logStep(message) {
  process.stdout.write(`${message}\n`);
}

function buildLoginUrl(baseUrl) {
  return new URL("/login", baseUrl).toString();
}

async function verifyBaseUrlReachable(baseUrl) {
  const response = await fetch(buildLoginUrl(baseUrl), {
    method: "GET",
    redirect: "manual",
  });

  if (!response.ok && response.status !== 307 && response.status !== 308) {
    throw new Error(
      `E2E_BASE_URL is not reachable at /login. Received status ${response.status}.`,
    );
  }
}

async function verifyPlaywrightLaunch(baseUrl) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const response = await page.goto(buildLoginUrl(baseUrl), {
      waitUntil: "domcontentloaded",
    });

    if (!response || !response.ok()) {
      throw new Error("Playwright reached the app but did not receive a healthy /login response.");
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const loadedFiles = loadE2EEnvFiles(repoRoot);
  const config = readLocalE2EConfig();
  const admin = createAdminClient(config);
  const supabaseEnvironment = describeSupabaseEnvironment(config);

  logStep("E2E health check");
  logStep(`- Loaded env files: ${loadedFiles.length > 0 ? loadedFiles.join(", ") : "none"}`);
  logStep(`- App URL: ${config.baseUrl}`);
  logStep(`- Supabase mode: ${supabaseEnvironment}`);
  logStep("- Secret values: present but never printed");

  await verifyBaseUrlReachable(config.baseUrl);
  logStep("- Base URL reachable");

  const parentUserId = await ensureParentUser(admin, {
    email: config.email,
    password: config.password,
  });
  logStep("- Test parent user is available");

  const authenticatedUserId = await verifyParentCredentials(config);

  if (authenticatedUserId !== parentUserId) {
    throw new Error("Password auth succeeded, but the signed-in user did not match the seeded parent.");
  }

  logStep("- Test parent credentials are usable");

  const childId = await ensureChild(admin, { parentUserId });
  logStep(`- Test child is available in scoped QA data (${childId})`);

  await verifyPlaywrightLaunch(config.baseUrl);
  logStep("- Playwright Chromium can launch and reach /login");

  logStep("E2E health check passed");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`E2E health check failed: ${message}\n`);
  process.exitCode = 1;
});
