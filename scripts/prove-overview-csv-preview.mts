/** Read-only round-trip of the Overview CSV on one protected staging Preview. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import pg from "pg";
import { MAX_DICTIONARY_CSV_BYTES, parseDictionaryCsv } from
  "../lib/teaching-dictionary-manager/csv";
import { OVERVIEW_CSV_COLUMNS, OVERVIEW_EXPORT_BATCH_SIZE } from
  "../lib/teaching-dictionary-manager/overview-csv";
import { WORD_METADATA_FIELDS } from "../lib/teaching-dictionary-manager/contracts";
import { overviewSourceHash } from "../lib/teaching-dictionary-manager/overview-source-hash";

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
  const sourceDb = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await sourceDb.connect();
    await sourceDb.query("begin read only");
    const facts = await sourceDb.query(`select to_jsonb(w) word,to_jsonb(md) metadata,
      to_jsonb(ds) dictation,to_jsonb(m) morphology,d.definition
      from canonical_teaching_dictionary_words w
      left join lateral (select * from canonical_teaching_dictionary_word_metadata
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1) md on true
      left join lateral (select * from canonical_teaching_dictionary_dictation_sentences
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1) ds on true
      left join lateral (select * from canonical_teaching_dictionary_word_morphology
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1) m on true
      left join lateral (select definition from teaching_dictionary_definition_versions
        where canonical_word_id=w.id and route_id is null
        order by published_at desc,id desc limit 1) d on true
      where w.row_status='active' and w.dialect_code='en-GB'`);
    const byId = new Map(rows.map((row) => [row.canonicalWordId, row]));
    for (const item of facts.rows) {
      const w = item.word ?? {};
      const md = item.metadata ?? {};
      const ds = item.dictation ?? {};
      const m = item.morphology ?? {};
      const source = { ...w, definition: item.definition ?? "",
        dictation_sentence: ds.dictation_sentence ?? "",
        dictation_target_token_index: ds.dictation_target_token_index ?? 0,
        ...Object.fromEntries(WORD_METADATA_FIELDS.map((key) => [key, md[key] ?? ""])),
        written_syllable_breakdown: md.written_syllable_breakdown ?? "",
        has_schwa: md.has_schwa,
        raw_morpholex_segmentation: m.raw_morpholex_segmentation ?? "",
        raw_morpholex_pos: m.raw_morpholex_pos ?? "",
        morphology_parts: m.morphology_parts ?? [], feature_keys: m.feature_keys ?? [],
        morphology_joins: m.morphology_joins ?? [],
        __morphology_transformations: m.morphology_transformations ?? [],
        transformation_notes: m.transformation_notes ?? "", word_sum: m.word_sum ?? "",
        analysis_status: m.analysis_status ?? "in_review",
        morphology_review_notes: m.review_notes ?? "" };
      assert.equal(byId.get(w.id)?.sourceOverviewHash, overviewSourceHash(source),
        `source Overview hash for ${w.normalised_word}`);
    }
    assert.equal(facts.rows.length, rows.length);
  } finally {
    await sourceDb.query("rollback").catch(() => {});
    await sourceDb.end().catch(() => {});
  }
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
