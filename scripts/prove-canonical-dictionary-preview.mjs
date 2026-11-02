#!/usr/bin/env node
/** Read-only browser proof against one protected staging Preview. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const base = process.argv[2];
const deploymentId = process.argv[3];
if (!base || !/^https:\/\/scarletts-spells-adle-staging-20261025-[a-z0-9]+\.vercel\.app$/.test(base))
  throw new Error("STAGING_PREVIEW_URL_REQUIRED");
if (!deploymentId || !/^[0-9a-f]{40}$/.test(deploymentId))
  throw new Error("EXACT_DEPLOYMENT_SHA_REQUIRED");
const token = process.env.VERCEL_OIDC_TOKEN;
const email = process.env.STAGING_ADMIN_EMAIL;
const password = process.env.STAGING_ADMIN_PASSWORD;
const databaseUrl = process.env.SUPABASE_STAGING_DB_URL;
if (!token || !email || !password || !databaseUrl ||
  new URL(databaseUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_PREVIEW_CREDENTIALS_REQUIRED");

const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let rootQuery = "";
try {
  const roots = await db.query(`select f.base_lemma from public.canonical_teaching_dictionary_lexical_base_families f
    where f.base_kind='bound_root' and f.review_status='approved'
    order by f.revision desc limit 1`);
  rootQuery = roots.rows[0]?.base_lemma ?? "";
} finally { await db.end(); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-vercel-trusted-oidc-idp-token": token },
  });
  const page = await context.newPage();
  const login = await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  assert.equal(login?.status(), 200, "application login loads after Vercel protection");
  assert.equal(await page.locator("html").getAttribute("data-dpl-id"), deploymentId,
    "pages carry the exact deployment ID for stale Server Action recovery");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  const queue = await page.goto(`${base}/admin/teaching-dictionary/format-review`,
    { waitUntil: "domcontentloaded" });
  assert.equal(queue?.status(), 200, "format review queue loads for admin");
  assert.equal(await page.locator("h1").filter({ hasText: "Dictionary format review" }).count(), 1,
    `format queue heading is present at ${new URL(page.url()).pathname}; headings=${JSON.stringify(await page.locator("h1").allTextContents())}`);
  assert.match(await page.locator("main").last().innerText(), /entries to review on this page/);
  assert.match(await page.locator("main").last().innerText(), /Approved word has no morphology record/,
    "approved staging words without morphology appear in the review queue");
  assert.ok(await page.locator('a[href*="#td-definition"]').count() > 0,
    "approved staging words without a shared definition link to the Overview control");

  const dictionary = await page.goto(`${base}/admin/teaching-dictionary`, { waitUntil: "domcontentloaded" });
  assert.equal(dictionary?.status(), 200, "dictionary index loads for admin");
  assert.equal(await page.locator('a[href="/admin/teaching-dictionary/format-review"]').count(), 1);

  const family = await context.request.get(`${base}/api/admin/teaching-dictionary/family-search?q=play`);
  assert.equal(family.status(), 200, "family search API loads for admin");
  const response = await family.json();
  assert.ok(Array.isArray(response.results), "family search returns structured results");
  assert.ok(response.results.some((item) => item.kind === "lexical" && item.baseKind === "free_base"),
    "approved free-base family is searchable");
  const shortSearch = await context.request.get(`${base}/api/admin/teaching-dictionary/family-search?q=ba`);
  assert.equal(shortSearch.status(), 200);
  const shortResults = await shortSearch.json();
  assert.ok(shortResults.results.every((item) => item.baseLemma.toLowerCase().includes("ba")),
    "a short query cannot match only the common family-key suffix");
  if (rootQuery) {
    const root = await context.request.get(`${base}/api/admin/teaching-dictionary/family-search?q=${encodeURIComponent(rootQuery)}`);
    assert.equal(root.status(), 200, "bound-root family search loads for admin");
    const rootResponse = await root.json();
    assert.ok(rootResponse.results.some((item) => item.kind === "lexical" && item.baseKind === "bound_root"),
      "approved bound-root family is searchable");
  }
  const detail = await page.goto(`${base}/admin/teaching-dictionary/00ccd7e3-f46c-516c-bb8a-535c49a4c817`,
    { waitUntil: "domcontentloaded" });
  assert.equal(detail?.status(), 200, "representative word Overview loads");
  assert.equal(await page.locator("h1").filter({ hasText: /^plate$/i }).count(), 1,
    `word heading: ${JSON.stringify(await page.locator("h1").allTextContents())}`);
  assert.equal(await page.getByText("1 · Overview", { exact: false }).count() > 0, true);
  await page.locator("summary").filter({ hasText: /^Advanced$/ }).click();
  for (const [label, id, choices] of [
    ["Age band", "td-age-band-input", ["early_primary", "middle_primary", "upper_primary"]],
    ["Frequency band", "td-frequency-band-input", ["high", "medium", "low"]],
    ["Complexity band", "td-complexity-band-input", ["low", "medium", "high"]],
  ]) {
    await page.getByRole("button", { name: `Edit ${label}` }).click();
    const select = page.locator(`#${id}`);
    assert.equal(await select.evaluate((element) => element.tagName), "SELECT",
      `${label} uses a selector`);
    const values = await select.locator("option").evaluateAll((elements) =>
      elements.map((element) => element.value));
    for (const choice of choices) assert.ok(values.includes(choice), `${label} offers ${choice}`);
  }
  const helpInHeading = async (label) => {
    const help = page.locator(`[aria-label^="How to fill ${label}."]`);
    assert.equal(await help.count(), 1, `${label} has one accessible help control`);
    assert.equal(await help.locator('[role="tooltip"]').count(), 1);
    const aligned = await help.evaluate((element) => {
      const heading = element.parentElement;
      const text = [...(heading?.childNodes ?? [])].find((node) =>
        node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!text) return false;
      const range = document.createRange();
      range.selectNodeContents(text);
      const textBox = range.getBoundingClientRect();
      const iconBox = element.getBoundingClientRect();
      return Math.abs(textBox.top - iconBox.top) < 12 && iconBox.left >= textBox.left;
    });
    assert.equal(aligned, true, `${label} help sits beside its heading`);
  };
  await page.getByRole("button", { name: "Edit word parts" }).click();
  await helpInHeading("written syllable breakdown");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Review family suggestions" }).click();
  await helpInHeading("family search");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const routeWord = await page.goto(`${base}/admin/teaching-dictionary/17a844e3-133b-408b-a90f-8235fcd8c7eb`,
    { waitUntil: "domcontentloaded" });
  assert.equal(routeWord?.status(), 200, "word with a saved route loads");
  assert.equal(await page.locator("h1").filter({ hasText: /^fixtureword001$/i }).count(), 1);
  await page.locator("#td-skills select").selectOption("D4_MOR_PREFIXES_UN");
  await page.getByRole("button", { name: "Add micro-skill" }).click();
  const checks = page.locator("#td-lesson-checks");
  assert.equal(await checks.count(), 1,
    `Lesson checks remains in the word workspace; summaries=${JSON.stringify(await page.locator("summary").allTextContents())}`);
  await page.waitForFunction(() => {
    const text = document.querySelector("#td-lesson-checks")?.textContent ?? "";
    return !text.includes("Checking complete lesson groups") ||
      text.includes("Lesson checks could not load");
  }, undefined, { timeout: 20_000 });
  assert.doesNotMatch(await checks.innerText(), /Lesson checks could not load/);
  assert.ok(await checks.locator("table tbody tr").count() > 0,
    "Lesson checks has an activity row for the selected micro-skill");
  console.log(JSON.stringify({ result: "passed", preview: base, formatQueue: true,
    dictionaryIndex: true, freeBaseSearch: true, boundRootSearch: Boolean(rootQuery),
    wordOverview: true, reviewedBandSelectors: true, lessonChecks: true, mutations: 0 }));
} finally {
  await browser.close();
}
