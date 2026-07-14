import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STATE_PATH = resolve(".tmp/adle-d4-mor-guided-pilot-live-smoke/state.json");
const PILOT_WORDS = ["unhappy", "unfair", "unkind", "unlock", "untidy", "unnatural", "unnecessary"] as const;

interface SmokeState {
  parentUserId: string;
  childId: string;
  email: string;
  password: string;
  planDate: string;
  importBatchId: string | null;
  sourceId: string | null;
  insertedWordIds: string[];
  supabaseHost: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function qaClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing QA Supabase URL or service role key.");
  const hostname = new URL(url).hostname;
  const local = hostname === "127.0.0.1" || hostname === "localhost";
  if (!local) {
    const expectedStagingHost = process.env.ADLE_QA_STAGING_SUPABASE_HOST;
    const acknowledgement = process.env.ADLE_QA_ACCEPT_STAGING;
    if (!hostname.endsWith(".supabase.co") || expectedStagingHost !== hostname || acknowledgement !== "disposable-data-only") {
      throw new Error("Refusing remote QA: set the exact ADLE_QA_STAGING_SUPABASE_HOST and ADLE_QA_ACCEPT_STAGING=disposable-data-only. Never use production.");
    }
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function qaPlanDate(hostname: string): string {
  const requested = process.env.ADLE_QA_PLAN_DATE;
  if (requested !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("Remote staging QA requires an explicit unused ADLE_QA_PLAN_DATE in YYYY-MM-DD format.");
  }
  return new Date().toISOString().slice(0, 10);
}

function readState(): SmokeState {
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as SmokeState;
}

async function setup(client: SupabaseClient): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `adle-ui-g-live-${suffix}@example.test`;
  const password = `Local-${suffix}!`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseHost = new URL(url!).hostname;
  const planDate = qaPlanDate(supabaseHost);
  const { data: authData, error: authError } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authData.user) throw new Error(`seed auth user: ${authError?.message}`);
  const parentUserId = authData.user.id;
  const { data: child, error: childError } = await client.from("children").insert({ parent_user_id: parentUserId, first_name: "ADLE UI-G Live" }).select("id").single();
  if (childError || !child) {
    await client.auth.admin.deleteUser(parentUserId);
    throw new Error(`seed child: ${childError?.message}`);
  }
  const childId = (child as { id: string }).id;
  let importBatchId: string | null = null;
  let sourceId: string | null = null;
  const insertedWordIds: string[] = [];
  try {
    const { data: existing, error: existingError } = await client.from("canonical_teaching_dictionary_words").select("id, display_word").in("display_word", [...PILOT_WORDS]).eq("row_status", "active");
    if (existingError) throw existingError;
    const present = new Set((existing ?? []).map((row) => (row as { display_word: string }).display_word));
    const missing = PILOT_WORDS.filter((word) => !present.has(word));
    if (missing.length > 0) {
      const { data: batch, error: batchError } = await client.from("canonical_teaching_dictionary_import_batches").insert({ source_folder_path: `local-smoke/adle-ui-g/${suffix}`, validator_version: "adle_ui_g_live_smoke_v1", validation_summary: { disposable: true }, row_counts: { words: missing.length }, readiness_summary: { local_smoke_only: true }, import_mode: "local_dev_import", batch_status: "applied", source_metadata: { disposable: true }, imported_by: "adle-ui-g-live-smoke", imported_at: new Date().toISOString() }).select("id").single();
      if (batchError || !batch) throw new Error(`seed import batch: ${batchError?.message}`);
      importBatchId = (batch as { id: string }).id;
      const { data: source, error: sourceError } = await client.from("canonical_teaching_dictionary_sources").insert({ import_batch_id: importBatchId, row_status: "active", source_sheet: "ADLE UI-G Live Smoke", source_row_number: 2, source_row_hash: `adle-ui-g-${suffix}`, source_metadata: { disposable: true }, source_key: `adle-ui-g-${suffix}`, source_category: "internal_authored", source_name: "ADLE UI-G disposable local smoke", source_url: null, source_licence: null, source_use_note: "Disposable local QA rows derived from the approved D4_MOR pilot fixture.", importability_status: "importable", legal_review_status: "not_required" }).select("id").single();
      if (sourceError || !source) throw new Error(`seed source: ${sourceError?.message}`);
      sourceId = (source as { id: string }).id;
      const rows = missing.map((word, index) => ({ import_batch_id: importBatchId, source_id: sourceId, row_status: "active", source_sheet: "ADLE UI-G Live Smoke", source_row_number: index + 2, source_row_hash: `adle-ui-g-${suffix}-${word}`, source_metadata: { disposable: true, approved_fixture: "d4-mor-prefixes-un-pilot-source-fixture" }, word_key: `local_smoke_${word}_${suffix}`, normalised_word: word, display_word: word, dialect_code: "en-GB", frequency_band: "medium", age_band: "ks2", complexity_band: "pilot", source_category: "internal_authored", source_name: "ADLE UI-G disposable local smoke", source_url: null, source_licence: null, source_use_note: "Disposable local QA row derived from the approved D4_MOR pilot fixture.", confidence: "high", review_status: "approved_for_first_exposure" }));
      const { data: inserted, error: wordsError } = await client.from("canonical_teaching_dictionary_words").insert(rows).select("id");
      if (wordsError) throw new Error(`seed pilot words: ${wordsError.message}`);
      insertedWordIds.push(...(inserted ?? []).map((row) => (row as { id: string }).id));
    }
    const { data: allWords, error: allWordsError } = await client.from("canonical_teaching_dictionary_words").select("id, display_word").in("display_word", [...PILOT_WORDS]).eq("row_status", "active");
    if (allWordsError) throw allWordsError;
    assert((allWords ?? []).length === 7, "all seven canonical pilot words are available");
    const state: SmokeState = { parentUserId, childId, email, password, planDate, importBatchId, sourceId, insertedWordIds, supabaseHost };
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(JSON.stringify(state));
  } catch (error) {
    await client.from("children").delete().eq("id", childId);
    if (insertedWordIds.length > 0) await client.from("canonical_teaching_dictionary_words").delete().in("id", insertedWordIds);
    if (sourceId) await client.from("canonical_teaching_dictionary_sources").delete().eq("id", sourceId);
    if (importBatchId) await client.from("canonical_teaching_dictionary_import_batches").delete().eq("id", importBatchId);
    await client.auth.admin.deleteUser(parentUserId);
    throw error;
  }
}

async function verify(client: SupabaseClient): Promise<void> {
  const state = readState();
  const { data: header, error: headerError } = await client.from("daily_assignments").select("id, status").eq("parent_user_id", state.parentUserId).eq("child_id", state.childId).eq("assignment_date", state.planDate).eq("title", "ADLE Daily Plan").single();
  if (headerError || !header) throw new Error(`verify header: ${headerError?.message}`);
  const assignmentId = (header as { id: string; status: string }).id;
  assert((header as { status: string }).status === "completed", "assignment header is completed");
  const { data: items, error: itemsError } = await client.from("assignment_items").select("id, status").eq("daily_assignment_id", assignmentId);
  if (itemsError) throw itemsError;
  assert((items ?? []).length === 16 && (items ?? []).every((item) => (item as { status: string }).status === "completed"), "exactly 16 assignment items are completed");
  const { data: attempts, error: attemptsError } = await client.from("adle_assignment_attempt_events").select("attempt_kind, attempt_text, is_correct, evidence_class").eq("daily_assignment_id", assignmentId);
  if (attemptsError) throw attemptsError;
  const attemptRows = attempts as Array<{ attempt_kind: string; attempt_text: string; is_correct: boolean | null; evidence_class: string }>;
  assert(attemptRows.length === 14, "exactly 14 attempt events were captured");
  assert(attemptRows.filter((row) => row.attempt_kind === "guided_practice").length === 6 && attemptRows.filter((row) => row.attempt_kind === "guided_practice").every((row) => row.is_correct === null), "six guided completion-only events were captured");
  assert(attemptRows.filter((row) => row.attempt_kind === "lesson_production").length === 4, "four controlled spelling events were captured");
  const dictation = attemptRows.filter((row) => row.attempt_kind === "lesson_dictation");
  assert(dictation.length === 4 && dictation.every((row) => row.attempt_text.includes(" ") && row.evidence_class === "first_exposure_lesson_attempt"), "four raw full-sentence dictation events were captured");
  const { data: reflections, error: reflectionsError } = await client.from("adle_child_learning_reflections").select("reflection_text, prompt_key").eq("daily_assignment_id", assignmentId);
  if (reflectionsError) throw reflectionsError;
  assert((reflections ?? []).length === 1 && (reflections?.[0] as { reflection_text: string; prompt_key: string }).reflection_text.trim().length > 0 && (reflections?.[0] as { prompt_key: string }).prompt_key === "word-lab-un-observation-v1", "one private non-assessment reflection was saved");
  const { data: learningItems, error: learningError } = await client.from("adle_learning_items").select("id").eq("child_id", state.childId).eq("micro_skill_key", "D4_MOR_PREFIXES_UN").eq("row_status", "active");
  if (learningError) throw learningError;
  assert((learningItems ?? []).length === 4, "four active morphology learning items remain");
  const { data: taught, error: taughtError } = await client.from("adle_taught_word_history").select("id").eq("child_id", state.childId).eq("row_status", "active");
  if (taughtError) throw taughtError;
  assert((taught ?? []).length === 4, "four taught-word history rows were created");
  const { data: schedule, error: scheduleError } = await client.from("adle_review_schedule_words").select("id").eq("child_id", state.childId).eq("row_status", "active");
  if (scheduleError) throw scheduleError;
  assert((schedule ?? []).length === 4, "four review schedule words were created");
  console.log(JSON.stringify({ assignmentId, headerCount: 1, itemCount: items?.length ?? 0, attemptCount: attemptRows.length, guidedCount: 6, controlledCount: 4, dictationCount: 4, reflectionNoteCount: reflections?.length ?? 0, learningItemCount: learningItems?.length ?? 0, taughtCount: taught?.length ?? 0, scheduleCount: schedule?.length ?? 0 }, null, 2));
}

async function cleanup(client: SupabaseClient): Promise<void> {
  const state = readState();
  await client.from("children").delete().eq("id", state.childId);
  if (state.insertedWordIds.length > 0) await client.from("canonical_teaching_dictionary_words").delete().in("id", state.insertedWordIds);
  if (state.sourceId) await client.from("canonical_teaching_dictionary_sources").delete().eq("id", state.sourceId);
  if (state.importBatchId) await client.from("canonical_teaching_dictionary_import_batches").delete().eq("id", state.importBatchId);
  await client.auth.admin.deleteUser(state.parentUserId);
  const { count: childRows } = await client.from("children").select("id", { count: "exact", head: true }).eq("id", state.childId);
  const { count: assignmentRows } = await client.from("daily_assignments").select("id", { count: "exact", head: true }).eq("child_id", state.childId);
  const { count: itemRows } = await client.from("assignment_items").select("id", { count: "exact", head: true }).eq("child_id", state.childId);
  const { count: reflectionRows } = await client.from("adle_child_learning_reflections").select("id", { count: "exact", head: true }).eq("child_id", state.childId);
  assert((childRows ?? 0) === 0 && (assignmentRows ?? 0) === 0 && (itemRows ?? 0) === 0 && (reflectionRows ?? 0) === 0, "disposable child, assignment, and private reflection rows were removed");
  console.log("ADLE D4_MOR live smoke cleanup passed");
}

const command = process.argv[2];
const client = qaClient();
const operation = command === "setup" ? setup(client) : command === "verify" ? verify(client) : command === "cleanup" ? cleanup(client) : Promise.reject(new Error("Use setup, verify, or cleanup."));
operation.catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
