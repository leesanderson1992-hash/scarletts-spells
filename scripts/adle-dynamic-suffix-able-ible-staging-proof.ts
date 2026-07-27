/** Disposable staging proof harness for the combined Dynamic Suffix profile. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HOST = "jlhotktspjvffslvuyfz.supabase.co";
const SKILL = "D4_MOR_SUFFIXES_ABLE_IBLE";
const STATE = resolve(".tmp/adle-dynamic-suffix-able-ible-proof/state.json");
type State = { parentId: string; childId: string; email: string; password: string; tag: string; planDate: string };
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}.`); return value; };
const assert = (value: unknown, message: string): asserts value => { if (!value) throw new Error(`FAIL: ${message}`); };
function client() {
  assert(process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING === "disposable-data-only", "set ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING=disposable-data-only");
  const url = required("STAGING_SUPABASE_URL");
  assert(new URL(url).host === HOST, "refusing a non-staging host");
  return createClient(url, required("STAGING_SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
}
const state = () => JSON.parse(readFileSync(STATE, "utf8")) as State;
const save = (value: State) => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(value, null, 2)); };

async function setup() {
  const db = client(); const tag = `able-ible-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `adle-${tag}@example.test`; const password = `Proof-${tag}!`; const planDate = required("ADLE_QA_PLAN_DATE");
  const { data: user, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true }); if (userError || !user.user) throw new Error(userError?.message ?? "Create parent failed");
  try {
    const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: user.user.id, first_name: "ADLE Able Ible Proof" }).select("id").single(); if (childError || !child) throw new Error(childError?.message ?? "Create child failed");
    const { data: word, error: wordError } = await db.from("canonical_teaching_dictionary_words").select("id").eq("normalised_word", "comfortable").eq("row_status", "active").eq("review_status", "approved_for_first_exposure").single(); if (wordError || !word) throw new Error(wordError?.message ?? "Missing comfortable");
    const { error: itemError } = await db.from("adle_learning_items").insert({ child_id: child.id, canonical_word_id: word.id, micro_skill_key: SKILL, item_status: "pending", source_kind: "verified_misspelling", source_ref: `disposable-proof:${tag}`, source_attempt_text: "comftable", reteach_priority: false, intake_on: planDate, row_status: "active" }); if (itemError) throw itemError;
    save({ parentId: user.user.id, childId: child.id, email, password, tag, planDate }); console.log(JSON.stringify({ childId: child.id, email, password, planDate }));
  } catch (error) { await db.auth.admin.deleteUser(user.user.id); throw error; }
}

async function verify() {
  const db = client(); const s = state();
  const { data: assignment, error } = await db.from("daily_assignments").select("id,status").eq("child_id", s.childId).eq("assignment_date", s.planDate).single(); if (error || !assignment) throw new Error(error?.message ?? "Assignment missing"); assert(assignment.status === "completed", "assignment is completed");
  const [items, attempts, reflections, taught, schedules] = await Promise.all([
    db.from("assignment_items").select("id,status").eq("daily_assignment_id", assignment.id),
    db.from("adle_assignment_attempt_events").select("attempt_kind,attempt_text,evidence_class").eq("daily_assignment_id", assignment.id),
    db.from("adle_child_learning_reflections").select("prompt_key,reflection_text").eq("daily_assignment_id", assignment.id),
    db.from("adle_taught_word_history").select("id").eq("child_id", s.childId).eq("row_status", "active"),
    db.from("adle_review_schedule_words").select("id").eq("child_id", s.childId).eq("row_status", "active"),
  ]);
  for (const result of [items, attempts, reflections, taught, schedules]) if (result.error) throw result.error;
  assert(items.data?.length === 16 && items.data.every((row) => row.status === "completed"), "16 completed immutable items");
  assert(attempts.data?.length === 14, "14 attempt events"); assert(attempts.data?.filter((row) => row.attempt_kind === "guided_practice").length === 6, "6 guided events"); assert(attempts.data?.filter((row) => row.attempt_kind === "lesson_production").length === 4, "4 controlled events"); assert(attempts.data?.filter((row) => row.attempt_kind === "lesson_dictation").length === 4, "4 dictation events");
  assert(reflections.data?.length === 1 && reflections.data[0]?.prompt_key === "able-ible-base-test-v1" && reflections.data[0]?.reflection_text.trim(), "one reviewed reflection"); assert(taught.data?.length === 4, "4 taught words"); assert(schedules.data?.length === 4, "4 review schedules");
  console.log(JSON.stringify({ assignmentId: assignment.id, itemCount: items.data?.length, attemptCount: attempts.data?.length, reflectionCount: reflections.data?.length, taughtCount: taught.data?.length, scheduleCount: schedules.data?.length }));
}

async function cleanup() {
  const db = client(); const s = state(); await db.from("children").delete().eq("id", s.childId); await db.auth.admin.deleteUser(s.parentId);
  const { count, error } = await db.from("children").select("id", { count: "exact", head: true }).eq("id", s.childId); if (error) throw error; assert(count === 0, "fixture child removed"); console.log("Dynamic suffix -able/-ible disposable proof cleanup passed.");
}
const command = process.argv[2]; const run = command === "setup" ? setup : command === "verify" ? verify : command === "cleanup" ? cleanup : null; if (!run) throw new Error("Use setup, verify, or cleanup."); run().catch((error) => { console.error(error); process.exitCode = 1; });
