#!/usr/bin/env node
/** Read-only browser proof against one protected staging Preview. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const base = process.argv[2];
if (!base || !/^https:\/\/scarletts-spells-adle-staging-20261025-[a-z0-9]+\.vercel\.app$/.test(base))
  throw new Error("STAGING_PREVIEW_URL_REQUIRED");
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

  const dictionary = await page.goto(`${base}/admin/teaching-dictionary`, { waitUntil: "domcontentloaded" });
  assert.equal(dictionary?.status(), 200, "dictionary index loads for admin");
  assert.equal(await page.locator('a[href="/admin/teaching-dictionary/format-review"]').count(), 1);

  const family = await context.request.get(`${base}/api/admin/teaching-dictionary/family-search?q=play`);
  assert.equal(family.status(), 200, "family search API loads for admin");
  const response = await family.json();
  assert.ok(Array.isArray(response.results), "family search returns structured results");
  assert.ok(response.results.some((item) => item.kind === "lexical" && item.baseKind === "free_base"),
    "approved free-base family is searchable");
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
  console.log(JSON.stringify({ result: "passed", preview: base, formatQueue: true,
    dictionaryIndex: true, freeBaseSearch: true, boundRootSearch: Boolean(rootQuery),
    wordOverview: true, mutations: 0 }));
} finally {
  await browser.close();
}
