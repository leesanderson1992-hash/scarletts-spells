/**
 * Disposable staging proof for the guarded D4_MOR base-word-family pilot.
 *
 * This is deliberately not a production importer. It refuses every host
 * except an explicitly named staging host, requires an acknowledgement for
 * every mutating command, records opaque IDs only in .tmp, and cleans up by
 * import batch and child ID. Never point it at Scarlett's account.
 *
 * Commands: preflight | load | setup | verify | verify-completed | verify-retry | cleanup | recover
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { generateGuardedBaseWordFamilyPilot } from "../lib/adle/loaders/base-word-family-pilot-loader";

const FIXTURE = resolve("docs/implementation/seed-data/staging-fixtures/adle-base-word-family-pilot-v1");
// Kept outside the compiled-script directory, which npm clears before every command.
const STATE_PATH = resolve(".tmp/adle-base-word-family-staging-proof-state.json");
const CONFIRM = "ADLE-BASE-WORD-STAGING-FIXTURE-V1";
const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const SKILL = "D4_MOR_BASE_WORDS_PRESERVE_BASE";
const FAMILY_KEYS = ["play_base_family", "govern_base_family"] as const;
const TARGET_KEYS = ["government_en_gb", "replayed_en_gb"] as const;
const INTERACTIVE_MEMBER_SUPPORT: Record<string, { meaning: string; sentence: string; tokenIndex: number }> = {
  play_en_gb: { meaning: "to have fun in a game", sentence: "The children play a game at break time.", tokenIndex: 2 },
  playing_en_gb: { meaning: "having fun in a game now", sentence: "The children are playing football in the park.", tokenIndex: 3 },
  plays_en_gb: { meaning: "has fun in a game", sentence: "Mia plays the piano after school.", tokenIndex: 1 },
  replay_en_gb: { meaning: "to play again", sentence: "Please replay the funny part of the film.", tokenIndex: 1 },
  replayed_en_gb: { meaning: "played again", sentence: "We replayed the song after dinner.", tokenIndex: 1 },
  govern_en_gb: { meaning: "to lead or rule", sentence: "Leaders govern a country by making rules.", tokenIndex: 1 },
  governor_en_gb: { meaning: "a person who leads or rules a place", sentence: "I am going to vote for our new governor.", tokenIndex: 8 },
  government_en_gb: { meaning: "the group that rules a country", sentence: "The government announced a new plan.", tokenIndex: 1 },
};

type CsvRow = Record<string, string>;
type State = {
  host: string; batchId: string; createdMicroSkill: boolean; parentUserId: string | null; childId: string | null;
  assignmentId: string | null; planDate: string | null; parentEmail: string | null; parentPassword: string | null;
  wordIds: Record<string, string>; baselineCounts: Record<string, number>;
};

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(`FAIL: ${message}`); }
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function value(row: CsvRow, key: string) { return row[key] === "" ? null : row[key]; }
function bool(value: string) { return value === "TRUE"; }
function json(value: string) { return JSON.parse(value) as Record<string, unknown> | unknown[]; }
function parts(value: string) { return value ? value.split("|").map((entry) => entry.trim()).filter(Boolean) : []; }

/** Small RFC-4180 reader; fixture CSVs are committed and validator-approved. */
function csv(file: string): CsvRow[] {
  const text = readFileSync(resolve(FIXTURE, file), "utf8").replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) { if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = false; else cell += character; continue; }
    if (character === '"') { quoted = true; continue; }
    if (character === ",") { row.push(cell); cell = ""; continue; }
    if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; continue; }
    cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...data] = rows;
  assert(headers?.length, `${file} has headers`);
  return data.filter((columns) => columns.some(Boolean)).map((columns) => Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ""])));
}

function manifest(): Record<string, unknown> { return JSON.parse(readFileSync(resolve(FIXTURE, "fixture-manifest.json"), "utf8")) as Record<string, unknown>; }
function state(): State { assert(existsSync(STATE_PATH), "proof state is missing; run load then setup"); return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State; }
function save(next: State) { mkdirSync(dirname(STATE_PATH), { recursive: true }); writeFileSync(STATE_PATH, JSON.stringify(next, null, 2)); }

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const host = new URL(url).hostname;
  const expected = process.env.ADLE_BASE_WORD_STAGING_SUPABASE_HOST;
  assert(host.endsWith(".supabase.co") && host.includes(STAGING_REF), "target must be the known staging project");
  assert(!host.includes(PRODUCTION_REF), "production project is permanently blocked");
  assert(expected === host, "ADLE_BASE_WORD_STAGING_SUPABASE_HOST must exactly match target host");
  assert(process.env.ADLE_BASE_WORD_ACCEPT_STAGING === "disposable-data-only", "set ADLE_BASE_WORD_ACCEPT_STAGING=disposable-data-only");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function mutating(command: string) {
  assert(process.argv.includes("--apply"), `${command} requires --apply`);
  assert(process.argv.includes("--confirm") && process.argv[process.argv.indexOf("--confirm") + 1] === CONFIRM, `${command} requires --confirm ${CONFIRM}`);
}

async function count(client: SupabaseClient, table: string, filters: Array<[string, string]> = []) {
  let query: any = client.from(table).select("id", { count: "exact", head: true });
  for (const [column, item] of filters) query = query.eq(column, item);
  const { count: result, error } = await query;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return result ?? 0;
}

const AUDIT_TABLES = [
  "micro_skill_catalog", "canonical_teaching_dictionary_import_batches", "canonical_teaching_dictionary_sources",
  "canonical_teaching_dictionary_words", "canonical_teaching_dictionary_word_metadata", "canonical_teaching_dictionary_word_support",
  "canonical_teaching_dictionary_base_word_families", "canonical_teaching_dictionary_base_word_family_members",
  "canonical_teaching_dictionary_content_versions", "canonical_teaching_dictionary_field_reviews", "children", "daily_assignments",
  "assignment_items", "adle_learning_items", "adle_assignment_attempt_events", "adle_base_word_family_pilot_runs",
  "adle_base_word_transfer_miss_events", "adle_review_schedule_words", "adle_taught_word_history",
] as const;

async function auditCounts(db: SupabaseClient) {
  return Object.fromEntries(await Promise.all(AUDIT_TABLES.map(async (table) => [table, await count(db, table)] as const)));
}

async function removeFixtureBatch(db: SupabaseClient, batchId: string, removeCreatedMicroSkill: boolean) {
  for (const table of ["canonical_teaching_dictionary_field_reviews", "canonical_teaching_dictionary_readiness_reports", "canonical_teaching_dictionary_content_versions", "canonical_teaching_dictionary_base_word_family_members", "canonical_teaching_dictionary_base_word_families", "canonical_teaching_dictionary_word_support", "canonical_teaching_dictionary_word_metadata", "canonical_teaching_dictionary_words", "canonical_teaching_dictionary_sources"] as const) {
    const { error } = await db.from(table).delete().eq("import_batch_id", batchId);
    if (error) throw new Error(`cleanup ${table}: ${error.message}`);
  }
  { const { error } = await db.from("canonical_teaching_dictionary_import_batches").delete().eq("id", batchId); if (error) throw new Error(`cleanup import batch: ${error.message}`); }
  if (removeCreatedMicroSkill) { const { error } = await db.from("micro_skill_catalog").delete().eq("micro_skill_key", SKILL); if (error) throw new Error(`cleanup created micro-skill prerequisite: ${error.message}`); }
}

async function preflight(db: SupabaseClient) {
  const input = manifest(); const counts = input.counts as Record<string, number>;
  assert(input.fixture_key === "adle_base_word_family_pilot_v1", "fixture key matches this proof");
  assert(input.micro_skill_key === SKILL, "fixture micro-skill matches this proof");
  assert(JSON.stringify([...(input.families as string[])].sort()) === JSON.stringify([...FAMILY_KEYS].sort()), "fixture contains only approved play/govern families");
  for (const [file, expected] of Object.entries(counts)) assert(csv(file).length === expected, `${file} count matches fixture manifest`);
  for (const table of ["canonical_teaching_dictionary_import_batches", "canonical_teaching_dictionary_words", "canonical_teaching_dictionary_base_word_families", "canonical_teaching_dictionary_base_word_family_members", "adle_learning_items", "adle_base_word_transfer_miss_events", "adle_base_word_family_pilot_runs"]) await count(db, table);
  const fingerprint = sha(readFileSync(resolve(FIXTURE, "fixture-manifest.json"), "utf8"));
  const { data, error } = await db.from("canonical_teaching_dictionary_import_batches").select("id").eq("source_folder_sha256", fingerprint).eq("batch_status", "applied").limit(1);
  if (error) throw new Error(`fixture batch lookup: ${error.message}`);
  assert((data ?? []).length === 0, "no active duplicate base-word staging fixture batch");
  return fingerprint;
}

function provenance(file: string, row: CsvRow, index: number) {
  return { source_sheet: file, source_row_number: index + 2, source_row_hash: sha(`${file}:${JSON.stringify(row)}`), source_metadata: { disposable_staging_fixture: "adle_base_word_family_pilot_v1" } };
}

async function load(db: SupabaseClient) {
  mutating("load"); const fingerprint = await preflight(db); const baselineCounts = await auditCounts(db); const skill = JSON.parse(readFileSync(resolve(FIXTURE, "micro_skill_catalog_prerequisite.json"), "utf8")) as Record<string, unknown>;
  const { data: existingSkill, error: skillReadError } = await db.from("micro_skill_catalog").select("micro_skill_key").eq("micro_skill_key", SKILL).maybeSingle();
  if (skillReadError) throw new Error(`micro-skill prerequisite: ${skillReadError.message}`);
  let createdMicroSkill = false;
  if (!existingSkill) { const { error } = await db.from("micro_skill_catalog").insert(skill); if (error) throw new Error(`insert micro-skill prerequisite: ${error.message}`); createdMicroSkill = true; }
  const now = new Date().toISOString();
  const { data: batch, error: batchError } = await db.from("canonical_teaching_dictionary_import_batches").insert({ source_folder_path: "staging-fixtures/adle-base-word-family-pilot-v1", source_folder_sha256: fingerprint, source_commit: null, validator_version: "adle_base_word_family_staging_proof_v1", validation_summary: { fixture: "adle_base_word_family_pilot_v1", disposable: true }, row_counts: manifest().counts, readiness_summary: { ready_for_first_exposure: true }, import_mode: "local_dev_import", batch_status: "applied", source_metadata: { disposable: true, fixture: "adle_base_word_family_pilot_v1" }, imported_by: "adle-base-word-family-staging-proof", imported_at: now }).select("id").single();
  if (batchError || !batch) throw new Error(`create import batch: ${batchError?.message}`);
  const batchId = (batch as { id: string }).id;
  save({ host: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!).hostname, batchId, createdMicroSkill, parentUserId: null, childId: null, assignmentId: null, planDate: null, parentEmail: null, parentPassword: null, wordIds: {}, baselineCounts });
  try {
    const sourceRows = csv("teaching_content_sources.csv").map((row, index) => ({ import_batch_id: batchId, row_status: "active", ...provenance("teaching_content_sources.csv", row, index), source_key: row.source_key, source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), importability_status: row.importability_status, legal_review_status: row.legal_review_status }));
    if (sourceRows.length) { const { error } = await db.from("canonical_teaching_dictionary_sources").insert(sourceRows); if (error) throw new Error(`insert sources: ${error.message}`); }
    const wordRows = csv("canonical_words.csv").map((row, index) => ({ import_batch_id: batchId, source_id: null, row_status: row.row_status, ...provenance("canonical_words.csv", row, index), word_key: row.word_key, normalised_word: row.normalised_word, display_word: row.display_word, dialect_code: row.dialect_code, frequency_band: row.frequency_band, age_band: row.age_band, complexity_band: row.complexity_band, source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), confidence: row.confidence, review_status: row.review_status }));
    const { data: insertedWords, error: wordsError } = await db.from("canonical_teaching_dictionary_words").insert(wordRows).select("id, word_key"); if (wordsError) throw new Error(`insert words: ${wordsError.message}`);
    const wordIds = Object.fromEntries((insertedWords ?? []).map((row: any) => [row.word_key, row.id])) as Record<string, string>;
    assert(Object.keys(wordIds).length === 9, "all fixture words inserted");
    const metadataRows = csv("canonical_word_metadata.csv").map((row, index) => ({ import_batch_id: batchId, canonical_word_id: wordIds[row.word_key], source_id: null, row_status: "active", ...provenance("canonical_word_metadata.csv", row, index), syllables: value(row, "syllables"), phoneme_hint: value(row, "phoneme_hint"), grapheme_notes: value(row, "grapheme_notes"), stress_pattern: value(row, "stress_pattern"), has_schwa: bool(row.has_schwa), morphemes: value(row, "morphemes"), morphology_notes: value(row, "morphology_notes"), irregularity_notes: value(row, "irregularity_notes"), source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), confidence: row.confidence, review_status: row.review_status }));
    const supportRows = csv("micro_skill_word_support.csv").map((row, index) => ({ import_batch_id: batchId, canonical_word_id: wordIds[row.word_key], source_id: null, row_status: "active", ...provenance("micro_skill_word_support.csv", row, index), micro_skill_key: row.micro_skill_key, support_role: row.support_role, source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), confidence: row.confidence, review_status: row.review_status, review_notes: value(row, "review_notes") }));
    for (const [table, rows] of [["canonical_teaching_dictionary_word_metadata", metadataRows], ["canonical_teaching_dictionary_word_support", supportRows]] as const) { const { error } = await db.from(table).insert(rows); if (error) throw new Error(`insert ${table}: ${error.message}`); }
    const familyInput = csv("base_word_families.csv"); const { data: insertedFamilies, error: familiesError } = await db.from("canonical_teaching_dictionary_base_word_families").insert(familyInput.map((row, index) => ({ import_batch_id: batchId, base_family_key: row.base_family_key, micro_skill_key: row.micro_skill_key, base_word_id: wordIds[row.base_word_key], base_meaning: row.base_meaning, etymology_route: json(row.etymology_route), row_status: "active", ...provenance("base_word_families.csv", row, index), source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), confidence: row.confidence, review_status: row.review_status, reviewed_by: value(row, "reviewed_by"), reviewed_at: value(row, "reviewed_at") }))).select("id, base_family_key"); if (familiesError) throw new Error(`insert families: ${familiesError.message}`);
    const familyIds = Object.fromEntries((insertedFamilies ?? []).map((row: any) => [row.base_family_key, row.id])) as Record<string, string>;
    const memberRows = csv("base_word_family_members.csv").map((row, index) => {
      const support = INTERACTIVE_MEMBER_SUPPORT[row.word_key];
      assert(support, `interactive meaning and contextual dictation exist for ${row.word_key}`);
      return { import_batch_id: batchId, base_word_family_id: familyIds[row.base_family_key], canonical_word_id: wordIds[row.word_key], member_role: row.member_role, word_sum: row.word_sum, morphology_parts: json(row.morphology_parts), morphology_joins: json(row.morphology_joins), transformation_notes: value(row, "transformation_notes"), child_friendly_meaning: support.meaning, dictation_sentence: support.sentence, dictation_target_token_index: support.tokenIndex, audio_text: support.sentence, assignment_eligible: bool(row.assignment_eligible), row_status: "active", ...provenance("base_word_family_members.csv", row, index), source_category: row.source_category, source_name: value(row, "source_name"), source_url: value(row, "source_url"), source_licence: value(row, "source_licence"), source_use_note: value(row, "source_use_note"), confidence: row.confidence, review_status: row.review_status, reviewed_by: value(row, "reviewed_by"), reviewed_at: value(row, "reviewed_at") };
    });
    { const { error } = await db.from("canonical_teaching_dictionary_base_word_family_members").insert(memberRows); if (error) throw new Error(`insert family members: ${error.message}`); }
    const contentInput = csv("teaching_content_versions.csv")[0]; assert(contentInput, "fixture has teaching content");
    const { data: content, error: contentError } = await db.from("canonical_teaching_dictionary_content_versions").insert({ import_batch_id: batchId, source_id: null, ...provenance("teaching_content_versions.csv", contentInput, 0), micro_skill_key: contentInput.micro_skill_key, content_version: contentInput.content_version, version_status: contentInput.version_status, is_active: bool(contentInput.is_active), teaching_objective: contentInput.teaching_objective, child_friendly_explanation: contentInput.child_friendly_explanation, rule_explanation: contentInput.rule_explanation, memory_tip: value(contentInput, "memory_tip"), common_misconceptions: contentInput.common_misconceptions, first_exposure_progression: parts(contentInput.first_exposure_progression), guided_practice_progression: parts(contentInput.guided_practice_progression), review_proofreading_progression: parts(contentInput.review_proofreading_progression), example_selection_guidance: contentInput.example_selection_guidance, contrast_policy_guidance: contentInput.contrast_policy_guidance, sample_preview_word_key: contentInput.sample_preview_word_key, source_category: contentInput.source_category, source_name: value(contentInput, "source_name"), source_url: value(contentInput, "source_url"), source_licence: value(contentInput, "source_licence"), source_use_note: value(contentInput, "source_use_note"), confidence: contentInput.confidence, supersedes_content_version: value(contentInput, "supersedes_content_version"), final_readiness_review_status: contentInput.final_readiness_review_status, final_readiness_reviewed_by: value(contentInput, "final_readiness_reviewed_by"), final_readiness_reviewed_at: value(contentInput, "final_readiness_reviewed_at"), created_by: "adle-base-word-family-staging-proof" }).select("id").single();
    if (contentError || !content) throw new Error(`insert teaching content: ${contentError?.message}`);
    const reviewRows = csv("teaching_content_field_reviews.csv").map((row, index) => ({ import_batch_id: batchId, teaching_content_version_id: (content as { id: string }).id, ...provenance("teaching_content_field_reviews.csv", row, index), field_key: row.field_key, review_gate: row.review_gate, review_status: row.review_status, reviewed_by: value(row, "reviewed_by"), reviewed_at: value(row, "reviewed_at"), review_notes: value(row, "review_notes") }));
    { const { error } = await db.from("canonical_teaching_dictionary_field_reviews").insert(reviewRows); if (error) throw new Error(`insert field reviews: ${error.message}`); }
    save({ host: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!).hostname, batchId, createdMicroSkill, parentUserId: null, childId: null, assignmentId: null, planDate: null, parentEmail: null, parentPassword: null, wordIds, baselineCounts });
    console.log(JSON.stringify({ status: "fixture_loaded", batchId, wordCount: Object.keys(wordIds).length, familyCount: Object.keys(familyIds).length }));
  } catch (error) { try { await removeFixtureBatch(db, batchId, createdMicroSkill); rmSync(STATE_PATH, { force: true }); } catch (cleanupError) { throw new Error(`${error instanceof Error ? error.message : String(error)}; cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`); } throw error; }
}

async function setup(db: SupabaseClient) {
  mutating("setup"); const current = state(); assert(current.parentUserId === null && current.childId === null, "fixture setup has not already created a child");
  assert(process.env.ADLE_BASE_WORD_PROOF_ENABLE_TEMPORARY_CHILD === "yes", "setup requires ADLE_BASE_WORD_PROOF_ENABLE_TEMPORARY_CHILD=yes");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const email = `adle-base-word-${suffix}@example.test`; const password = `Disposable-${suffix}!`;
  const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true }); if (userError || !user.user) throw new Error(`create disposable parent: ${userError?.message}`);
  const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: user.user.id, first_name: "ADLE Base-word Proof" }).select("id").single(); if (childError || !child) { await db.auth.admin.deleteUser(user.user.id); throw new Error(`create disposable child: ${childError?.message}`); }
  const planDate = process.env.ADLE_BASE_WORD_QA_PLAN_DATE; assert(/^\d{4}-\d{2}-\d{2}$/.test(planDate ?? ""), "ADLE_BASE_WORD_QA_PLAN_DATE must be an explicit unused YYYY-MM-DD date"); const safePlanDate = planDate!;
  try {
    const input = TARGET_KEYS.map((wordKey, index) => ({ child_id: child.id, canonical_word_id: current.wordIds[wordKey], micro_skill_key: SKILL, item_status: "pending", source_kind: "verified_misspelling", source_ref: `staging-proof:${suffix}:${wordKey}`, source_attempt_text: index === 0 ? "goviment" : "replaied", intake_on: safePlanDate, row_status: "active" }));
    const { error } = await db.from("adle_learning_items").insert(input); if (error) throw new Error(`seed verified authentic learning items: ${error.message}`);
    // The proof process alone gets a one-child allowlist after the anonymous
    // child exists. This does not set a Vercel variable or enable any account.
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED = "enabled";
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = child.id;
    process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED = "false";
    assert(process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED === "enabled" && process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS === child.id && process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED !== "true", "local proof process must use the temporary child as its only enabled allowlist entry");
    const generated = await generateGuardedBaseWordFamilyPilot({ client: db, parentUserId: user.user.id, childId: child.id, planDate: safePlanDate });
    const assignmentId = generated.assignmentId; assert(typeof assignmentId === "string", `guarded generator readiness: ${generated.readinessReason ?? "unknown"}`);
    save({ ...current, parentUserId: user.user.id, childId: child.id, assignmentId, planDate: safePlanDate, parentEmail: email, parentPassword: password });
    console.log(JSON.stringify({ status: "assignment_generated", childId: child.id, assignmentId, planDate: safePlanDate, loginEmail: email, loginPassword: password }));
  } catch (error) { await db.from("children").delete().eq("id", child.id); await db.auth.admin.deleteUser(user.user.id); throw error; }
}

async function verify(db: SupabaseClient) {
  const current = state(); assert(current.childId && current.assignmentId, "setup state is incomplete");
  assert(await count(db, "assignment_items", [["daily_assignment_id", current.assignmentId]]) === 18, "assignment has exactly 18 bound items");
  assert(await count(db, "adle_learning_items", [["child_id", current.childId]]) === 2, "proof has exactly two authentic learning items before completion");
  const { count: transfers, error } = await db.from("adle_base_word_transfer_miss_events").select("id", { count: "exact", head: true }).eq("child_id", current.childId); if (error) throw new Error(`transfer ledger check: ${error.message}`);
  console.log(JSON.stringify({ status: "verification_ready", assignmentItems: 18, authenticLearningItems: 2, transferMisses: transfers ?? 0 }));
}

async function verifyCompleted(db: SupabaseClient, retry: boolean) {
  const current = state(); assert(current.childId && current.assignmentId, "setup state is incomplete");
  assert(await count(db, "assignment_items", [["daily_assignment_id", current.assignmentId]]) === 18, "assignment retains exactly 18 immutable bindings");
  assert(await count(db, "adle_assignment_attempt_events", [["daily_assignment_id", current.assignmentId]]) === 18, "completion has exactly 18 attempt events");
  assert(await count(db, "adle_child_learning_reflections", [["daily_assignment_id", current.assignmentId]]) === 1, "completion has exactly one reflection");
  assert(await count(db, "adle_review_schedule_words", [["child_id", current.childId]]) === 2, "only two authentic targets are scheduled");
  assert(await count(db, "adle_base_word_transfer_miss_events", [["child_id", current.childId]]) <= 1, "transfer ledger records at most one first miss");
  const { data: run, error: runError } = await db.from("adle_base_word_family_pilot_runs").select("run_status").eq("assignment_id", current.assignmentId).maybeSingle();
  if (runError) throw new Error(`pilot run verification: ${runError.message}`); assert(run?.run_status === "completed", "pilot run is completed");
  console.log(JSON.stringify({ status: retry ? "retry_verified" : "completion_verified", attempts: 18, reflections: 1, authenticSchedules: 2 }));
}

async function cleanup(db: SupabaseClient) {
  mutating("cleanup"); const current = state(); assert(process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED !== "enabled" || process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED === "true", "disable the local/preview pilot gate before cleanup");
  if (current.childId) await db.from("children").delete().eq("id", current.childId);
  if (current.parentUserId) await db.auth.admin.deleteUser(current.parentUserId);
  await removeFixtureBatch(db, current.batchId, current.createdMicroSkill);
  assert(await count(db, "canonical_teaching_dictionary_import_batches", [["id", current.batchId]]) === 0, "fixture import batch was removed");
  if (current.childId) assert(await count(db, "children", [["id", current.childId]]) === 0, "disposable child was removed");
  const afterCounts = await auditCounts(db); const changed = AUDIT_TABLES.filter((table) => afterCounts[table] !== current.baselineCounts[table]);
  assert(changed.length === 0, `cleanup must restore preflight counts (${changed.join(", ")})`);
  rmSync(STATE_PATH, { force: true }); console.log("ADLE base-word-family staging proof cleanup passed");
}

async function recover(db: SupabaseClient) {
  mutating("recover"); const fingerprint = sha(readFileSync(resolve(FIXTURE, "fixture-manifest.json"), "utf8"));
  const { data, error } = await db.from("canonical_teaching_dictionary_import_batches").select("id").eq("source_folder_sha256", fingerprint);
  if (error) throw new Error(`failed fixture batch lookup: ${error.message}`);
  assert((data ?? []).length === 1, "recovery requires exactly one failed fixture batch");
  await removeFixtureBatch(db, (data![0] as { id: string }).id, true); rmSync(STATE_PATH, { force: true }); console.log("ADLE base-word-family failed fixture batch recovery passed");
}

async function main() {
  const command = process.argv[2]; const db = client();
  if (command === "preflight") { console.log(JSON.stringify({ status: "preflight_ok", fixtureFingerprint: await preflight(db) })); return; }
  if (command === "load") return load(db);
  if (command === "setup") return setup(db);
  if (command === "verify") return verify(db);
  if (command === "verify-completed") return verifyCompleted(db, false);
  if (command === "verify-retry") return verifyCompleted(db, true);
  if (command === "cleanup") return cleanup(db);
  if (command === "recover") return recover(db);
  throw new Error("Use preflight, load, setup, verify, verify-completed, verify-retry, cleanup, or recover.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
