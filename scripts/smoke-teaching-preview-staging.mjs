/** Read-only browser smoke for a branch Preview pinned to the staging database. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

process.loadEnvFile(".env.staging.local");
const base = process.argv[2];
assert(/^https:\/\/scarletts-spells-[a-z0-9]+-leesanderson1992-hashs-projects\.vercel\.app$/.test(base ?? ""));
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0],
  "qkpjbajicacbrphthibk");
for (const key of ["VERCEL_OIDC_TOKEN", "STAGING_ADMIN_EMAIL", "STAGING_ADMIN_PASSWORD"])
  assert(process.env[key], `${key}_REQUIRED`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ extraHTTPHeaders: {
    "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN,
  } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.STAGING_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.STAGING_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(url => url.pathname !== "/login", { timeout: 20_000 });
  await page.goto(`${base}/admin/teaching-dictionary/02eccc55-4982-43fa-b14e-6e62fd420979`,
    { waitUntil: "domcontentloaded" });
  await page.locator("#td-skills").waitFor();
  const definitions = await page.locator('section[aria-label="Word meanings and pronunciations"] input')
    .evaluateAll(elements => elements.map(element => element.value));
  assert(definitions.includes("To be alive or remain alive.")
    && definitions.includes("Performed in real time rather than recorded."),
    "Both staging live senses must appear in Overview");
  await page.goto(`${base}/admin/teaching-dictionary/bulk-assign`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Assign words to a micro-skill" }).waitFor();
  await page.goto(`${base}/admin/adle-lesson-readiness?route=ing_endings_word_lab&skill=D4_INF_ING_ENDINGS_REGULAR`,
    { waitUntil: "domcontentloaded" });
  await page.getByText("Inspect word gates and blockers").click();
  await page.getByText("Reviewed Overview facts:").first().waitFor();
  assert.deepEqual(pageErrors, [], "Preview pages must not throw client errors");
  console.log(JSON.stringify({ result: "passed", liveSenses: 2, bulkPage: "loaded",
    adleOverviewCandidates: "visible" }));
} finally {
  await browser.close();
}
