/** Protected Preview proof: bulk re-approves the existing live sense without changing it. */
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "@playwright/test";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk"
  || !process.env.VERCEL_OIDC_TOKEN || !process.env.STAGING_ADMIN_EMAIL || !process.env.STAGING_ADMIN_PASSWORD)
  throw new Error("PINNED_STAGING_PREVIEW_CREDENTIALS_REQUIRED");
const base = process.argv[2];
if (!base || !/^https:\/\/scarletts-spells-adle-staging-20261025-[a-z0-9]+\.vercel\.app$/.test(base))
  throw new Error("EXACT_STAGING_PREVIEW_URL_REQUIRED");
const wordId = "02eccc55-4982-43fa-b14e-6e62fd420979";
const skill = "D4_PAT_SPLIT_DIGRAPHS_I_E";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
let browser;
let controlsChanged = false;
try {
  const before = await db.query(`select sense_id from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2
      and withdrawn_at is null`, [wordId, skill]);
  assert.equal(before.rows[0]?.sense_id, "live-on-stage");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows[0], { review_enabled: false,
    publication_enabled: false, withdrawal_enabled: false });
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  controlsChanged = true;
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
  await page.waitForURL(location => location.pathname !== "/login", { timeout: 20_000 });
  const response = await page.goto(`${base}/admin/teaching-dictionary/bulk-assign`,
    { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.getByRole("combobox", { name: "Family" }).selectOption("D4_PAT");
  await page.getByRole("combobox", { name: "Micro-skill", exact: true }).selectOption(skill);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("searchbox", { name: "Letters anywhere in word" }).fill("live");
  const meaning = page.getByRole("combobox", { name: "Meaning taught for live" }).first();
  assert.equal(await meaning.count(), 1);
  assert.equal(await meaning.inputValue(), "live-on-stage");
  await meaning.selectOption("live-to-remain-alive");
  await meaning.selectOption("live-on-stage");
  assert.equal(await page.getByRole("button", { name: "Confirm 1 word" }).count(), 0,
    "returning to the approved meaning should clear the pending change");
  await page.getByRole("button", { name: "Edit review choice for live" }).first().click();
  await page.getByRole("button", { name: "Re-review meaning" }).first().click();
  await page.getByRole("button", { name: "Confirm 1 word" }).click();
  await page.getByRole("status").filter({ hasText: /already assigned/ }).waitFor({ timeout: 30_000 });
  const after = await db.query(`select sense_id,pronunciation_snapshot->>'ipa' ipa
    from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2
      and withdrawn_at is null`, [wordId, skill]);
  assert.equal(after.rows[0]?.sense_id, "live-on-stage");
  assert.equal(after.rows[0]?.ipa, "/laɪv/");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", preview: base,
    bulkSenseChoice: true, reapproval: true, pageErrors: 0 }));
} finally {
  if (browser) await browser.close();
  if (controlsChanged) await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=false,publication_enabled=false,withdrawal_enabled=false
    where environment_key='staging'`);
  await db.end();
}
