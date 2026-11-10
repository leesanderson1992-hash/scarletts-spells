/** Approve the two live sense-to-lesson links through the staging Preview UI. */
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "@playwright/test";

process.loadEnvFile(".env.staging.local");
const databaseUrl = process.env.SUPABASE_STAGING_DB_URL;
if (!databaseUrl || new URL(databaseUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk" ||
  !process.env.VERCEL_OIDC_TOKEN || !process.env.STAGING_ADMIN_EMAIL || !process.env.STAGING_ADMIN_PASSWORD)
  throw new Error("PINNED_STAGING_PREVIEW_CREDENTIALS_REQUIRED");
const base = process.argv[2];
if (!base || !/^https:\/\/scarletts-spells-adle-staging-20261025-[a-z0-9]+\.vercel\.app$/.test(base))
  throw new Error("EXACT_STAGING_PREVIEW_URL_REQUIRED");
const wordId = "02eccc55-4982-43fa-b14e-6e62fd420979";
const keys = ["D4_PAT_FINAL_CONSONANT_PATTERNS_FINAL_VE", "D4_PAT_SPLIT_DIGRAPHS_I_E"];
const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let controlsChanged = false;
let browser;
try {
  const control = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(control.rows, [{ review_enabled: false, publication_enabled: false, withdrawal_enabled: false }],
    "staging controls must begin closed");
  const prior = await db.query(`select count(*)::integer as n from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1`, [wordId]);
  assert.ok([0, 2].includes(prior.rows[0].n), "unexpected partial lesson bindings");
  if (prior.rows[0].n === 0) {
    await db.query(`update public.adle_word_skill_review_controls
      set review_enabled=true,publication_enabled=true
      where environment_key='staging' and review_enabled=false and publication_enabled=false`);
    controlsChanged = true;
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ extraHTTPHeaders: {
    "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN,
  } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.STAGING_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.STAGING_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(url => url.pathname !== "/login", { timeout: 20_000 });
  await page.goto(`${base}/admin/teaching-dictionary/${wordId}${prior.rows[0].n === 0 ? "?draft=8236f034-87f1-4e13-85f9-404a034204e1" : ""}`,
    { waitUntil: "domcontentloaded" });
  const skills = page.locator("#td-skills");
  if (prior.rows[0].n === 0) {
    const save = skills.getByRole("button", { name: "Save micro-skills" });
    assert.equal(await save.count(), 1);
    await save.click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
  }
  assert.deepEqual(errors, [], "browser had no page errors");
  const rows = await db.query(`select b.micro_skill_key,b.sense_id,b.pronunciation_snapshot->>'ipa' as ipa
    from public.teaching_dictionary_lesson_sense_bindings b
    where b.environment_key='staging' and b.canonical_word_id=$1 order by b.micro_skill_key`, [wordId]);
  assert.equal(rows.rows.length, 2, "both lessons gained a reviewed sense binding");
  const byKey = new Map(rows.rows.map(row => [row.micro_skill_key, row]));
  assert.equal(byKey.get(keys[0])?.sense_id, "live-to-remain-alive");
  assert.equal(byKey.get(keys[0])?.ipa, "/lɪv/");
  assert.equal(byKey.get(keys[1])?.sense_id, "live-on-stage");
  assert.equal(byKey.get(keys[1])?.ipa, "/laɪv/");
  if (prior.rows[0].n === 2) {
    const visible = await skills.locator("details select").evaluateAll(elements => elements.map(element => element.value));
    assert.ok(visible.includes("live-to-remain-alive") && visible.includes("live-on-stage"),
      "approved senses load without a draft URL");
    assert.equal(await skills.getByText("Word approved · awaiting lesson route").count(), 2,
      "word approvals are separate from unbuilt lesson routes");
  }
  console.log(JSON.stringify({ result: "passed", preview: base, wordId,
    lessons: rows.rows, pageErrors: errors.length, approvalPerformed: prior.rows[0].n === 0 }));
} finally {
  if (browser) await browser.close();
  if (controlsChanged) await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=false,publication_enabled=false
    where environment_key='staging'`);
  await db.end();
}
