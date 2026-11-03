/** Read-only round-trip of the Overview CSV on one protected staging Preview. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import pg from "pg";
import { MAX_DICTIONARY_CSV_BYTES, parseDictionaryCsv } from
  "../lib/teaching-dictionary-manager/csv";
import { OVERVIEW_CSV_COLUMNS, OVERVIEW_EXPORT_BATCH_SIZE } from
  "../lib/teaching-dictionary-manager/overview-csv";

process.loadEnvFile(".env.staging.local");
const base = process.argv[2];
const deploymentId = process.argv[3];
if (!base || !/^https:\/\/scarletts-spells-adle-staging-20261025-[a-z0-9]+\.vercel\.app$/u.test(base))
  throw new Error("STAGING_PREVIEW_URL_REQUIRED");
if (!deploymentId || !/^[a-f0-9]{32}$/u.test(deploymentId))
  throw new Error("DEPLOYMENT_ID_REQUIRED");
const token = process.env.VERCEL_OIDC_TOKEN;
const email = process.env.STAGING_ADMIN_EMAIL;
const password = process.env.STAGING_ADMIN_PASSWORD;
const databaseUrl = process.env.SUPABASE_STAGING_DB_URL;
if (!token || !email || !password || !databaseUrl
  || new URL(databaseUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_PREVIEW_CREDENTIALS_REQUIRED");

const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let activeWords = 0;
try {
  await db.query("begin read only");
  const result = await db.query(`select count(*)::int count from canonical_teaching_dictionary_words
    where row_status='active' and dialect_code='en-GB'`);
  activeWords = result.rows[0].count;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-vercel-trusted-oidc-idp-token": token },
  });
  const page = await context.newPage();
  const login = await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  assert.equal(login?.status(), 200);
  assert.ok((await login.text()).includes(`data-dpl-id="${deploymentId}"`));
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
  const response = await context.request.get(`${base}/admin/teaching-dictionary/export/overview`);
  assert.equal(response.status(), 200, `Overview CSV response: ${response.status()}`);
  assert.match(response.headers()["content-type"] ?? "", /^text\/csv/u);
  const csv = await response.text();
  assert.ok(Buffer.byteLength(csv, "utf8") <= MAX_DICTIONARY_CSV_BYTES,
    "the full sheet fits the admin's 4 MB import limit");
  assert(!csv.includes("route_content_json") && !csv.includes("morphology_parts"),
    "the admin-facing sheet has no JSON columns");
  const rows = parseDictionaryCsv(csv);
  assert.equal(rows.length, activeWords, "one Overview row per active staging word");
  assert.equal(new Set(rows.map((row) => row.canonicalWordId)).size, rows.length);
  assert.ok(rows.every((row) => row.exportVersion === "2" && row.unchanged === true));
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/u.test(row.sourceOverviewHash ?? "")));
  assert.ok(OVERVIEW_CSV_COLUMNS.every((name) => csv.slice(0, csv.indexOf("\n")).includes(name)));
  const batchCount = Math.ceil(activeWords / OVERVIEW_EXPORT_BATCH_SIZE);
  const batchRows = [];
  for (let batch = 1; batch <= batchCount; batch += 1) {
    const batchResponse = await context.request.get(
      `${base}/admin/teaching-dictionary/export/overview?batch=${batch}`);
    assert.equal(batchResponse.status(), 200, `Overview batch ${batch}`);
    const batchCsv = await batchResponse.text();
    assert.ok(Buffer.byteLength(batchCsv, "utf8") <= MAX_DICTIONARY_CSV_BYTES);
    const parsed = parseDictionaryCsv(batchCsv);
    assert.equal(parsed.length, Math.min(OVERVIEW_EXPORT_BATCH_SIZE,
      activeWords - ((batch - 1) * OVERVIEW_EXPORT_BATCH_SIZE)));
    batchRows.push(...parsed);
  }
  assert.deepEqual(batchRows.map((row) => row.canonicalWordId),
    rows.map((row) => row.canonicalWordId), "batch exports cover the full sheet exactly once");
  const missingBatch = await context.request.get(
    `${base}/admin/teaching-dictionary/export/overview?batch=${batchCount + 1}`);
  assert.equal(missingBatch.status(), 400);
  // Every row has its exact exported edit hash; the server action must skip
  // the entire unchanged sheet without creating drafts or changing approvals.
  await page.goto(`${base}/admin/teaching-dictionary`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="dictionary_csv"]').setInputFiles({
    name: "unchanged-overview-review.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Import drafts" }).click();
  await page.getByRole("status").getByText("Imported 0 changed words as drafts.").waitFor({ timeout: 30_000 });
  const alerts = await page.getByRole("alert").allTextContents();
  assert.deepEqual(alerts.map((alert) => alert.trim()).filter(Boolean), [],
    `unexpected import alerts: ${JSON.stringify(alerts)}`);
  console.log(JSON.stringify({ result: "passed", preview: base, activeWords,
    csvBytes: Buffer.byteLength(csv, "utf8"), batchCount,
    reviewRows: rows.filter((row) => row.error).length,
    importedDrafts: 0 }));
} finally {
  await browser.close();
}
