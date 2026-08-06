/* Disposable staging rows are narrowed and verified by the production loader. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import { priceWordEvidence } from "../lib/adle/evidence-pricing";
import { buildDynamicAffixAssignmentPlan, validateDynamicAffixAssignmentPlanAgainstSharedLesson } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import {
  compileDynamicAffixWordLabDecision,
  type DynamicAffixCompilerMode,
} from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { validateDynamicAffixV3ForNewWrite } from "../lib/adle/morphology/dynamic-affix-v3-compatibility";
import {
  canonicalDynamicAffixPublicV3Bytes,
  compileDynamicAffixSelectionThroughSharedCompiler,
} from "../lib/adle/morphology/shared-affix-compatibility";
import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";
import { selectDynamicAffixWordLab, type DynamicAffixLessonPayloadV3 } from "../lib/adle/morphology/affix-word-lab";
import { PROFICIENCY_POLICY_V1, stateCredit } from "../lib/adle/proficiency-policy";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";
import {
  activeAdlePolicyProofProjection,
  assignmentItemProjectionMismatchPaths,
  expectedAssignmentItemProofProjection,
  persistedAssignmentItemProofProjection,
} from "./lib/adle-staging-proof-serialization";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;
const STAGING_VERCEL_PROJECT = "scarletts-spells-staged";
const STAGING_VERCEL_PROJECT_ID = "prj_oJkffstOtacc4juYloXajHpjJUha";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const PRODUCTION_VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl";
const CONFIRMATION = "ADLE-DYNAMIC-AFFIX-STAGING-V1";
const ACCEPT_FLAG = "ADLE_DYNAMIC_AFFIX_ACCEPT_STAGING";
export const STATE_PATH = resolve(".tmp/adle-dynamic-affix-shared-staging-proof-state.json");
const SOURCE_PREFIX = "dynamic-affix-v3-shared-staging-proof:";

const FIXTURE_DEFINITIONS = [
  { purpose: "mode_legacy", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment"] },
  { purpose: "mode_shadow", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment"] },
  { purpose: "mode_enforced", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment"] },
  { purpose: "mode_shared", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment"] },
  { purpose: "direct_one_form", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment"] },
  { purpose: "changed_one_form", profileKey: "D4_MOR_SUFFIXES_OUS", authenticWords: ["famous"] },
  { purpose: "replace_remove", profileKey: "D4_MOR_SUFFIXES_ITY", authenticWords: ["possibility"] },
  { purpose: "two_form", profileKey: "D4_MOR_SUFFIXES_ABLE_IBLE", authenticWords: ["comfortable"] },
  { purpose: "two_form_meaning", profileKey: "D4_MOR_SUFFIXES_FUL_LESS", authenticWords: ["careful"] },
  { purpose: "visible_tion", profileKey: "D4_MOR_SUFFIXES_TION", authenticWords: ["action"] },
  { purpose: "visible_sion", profileKey: "D4_MOR_SUFFIXES_SION", authenticWords: ["decision"] },
  { purpose: "rollback_four_authentic", profileKey: "D4_MOR_SUFFIXES_MENT", authenticWords: ["enjoyment", "payment", "agreement", "movement"] },
  { purpose: "rollback_transfer_resume", profileKey: "D4_MOR_SUFFIXES_NESS", authenticWords: ["happiness"] },
] as const;
const CLASS_PURPOSES = ["direct_one_form", "changed_one_form", "replace_remove", "two_form", "two_form_meaning", "visible_tion", "visible_sion"] as const;
const PROTECTED_TABLES = [
  "children", "daily_assignments", "assignment_items", "adle_learning_items",
  "adle_assignment_attempt_events", "adle_child_learning_reflections", "adle_taught_word_history",
  "adle_review_bundles", "adle_review_schedule_words", "adle_review_schedule_word_routes",
  "child_word_treasures", "child_word_treasure_events",
] as const;

type Fixture = {
  purpose: string;
  profileKey: string;
  childId: string;
  learningItemIds: string[];
  authenticWordIds: string[];
  authenticWords: string[];
  profileWordIds: string[];
  profileWords: string[];
  assignmentId?: string;
  itemCount?: number;
  payloadFingerprint?: string;
  sourceFingerprint?: string;
  lessonFingerprint?: string;
  contentVersion?: string;
  lessonWordIds?: string[];
  lessonWords?: string[];
  sentences?: string[];
  splitPoint?: number;
  completion?: Record<string, unknown>;
};
type Deployment = { deploymentId: string; deploymentUrl: string; implementationSha: string };
type State = {
  receiptVersion: "adle_dynamic_affix_shared_staging_proof_v1";
  runId: string;
  gitSha: string;
  planDate: string;
  parentUserId: string;
  parentEmail: string;
  parentPassword: string;
  baselineProtectedCounts: Record<string, number>;
  baselineProfiles: Awaited<ReturnType<typeof profileSnapshot>>;
  fixtures: Fixture[];
  deployments: Partial<Record<DynamicAffixCompilerMode, Deployment>>;
};

function required(...names: string[]): string {
  for (const name of names) if (process.env[name]?.trim()) return process.env[name]!.trim();
  throw new Error(`Missing one of: ${names.join(", ")}`);
}
function mutating(command: string) {
  assert(process.argv.includes("--apply"), `${command} requires --apply`);
  const index = process.argv.indexOf("--confirm");
  assert(index >= 0 && process.argv[index + 1] === CONFIRMATION, `${command} requires --confirm ${CONFIRMATION}`);
  assert(process.env[ACCEPT_FLAG] === "disposable-data-only", `${ACCEPT_FLAG} must be disposable-data-only`);
}
function assertProjectIdentity() {
  const environmentIndex = process.argv.indexOf("--environment");
  assert.equal(process.argv[environmentIndex + 1], "staging", "proof requires --environment staging");
  const project = JSON.parse(readFileSync(resolve(".vercel/project.json"), "utf8"));
  assert(project.projectId !== PRODUCTION_VERCEL_PROJECT_ID, "production Vercel project is permanently rejected");
  assert(project.projectId === STAGING_VERCEL_PROJECT_ID && project.projectName === STAGING_VERCEL_PROJECT, "Vercel project is not the pinned staging project");
}
function client(): SupabaseClient {
  assertProjectIdentity();
  const url = new URL(required("STAGING_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"));
  assert(url.hostname === STAGING_HOST && !url.hostname.includes(PRODUCTION_REF), "Supabase is not pinned staging");
  return createClient(url.toString(), required("STAGING_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
function loadState(): State {
  assert(existsSync(STATE_PATH), "proof state missing; run setup");
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}
function saveState(state: State) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
function fixture(state: State, purpose: string): Fixture {
  const found = state.fixtures.find((entry) => entry.purpose === purpose);
  assert(found, `fixture not found: ${purpose}`);
  return found;
}
async function protectedCounts(db: SupabaseClient) {
  const result: Record<string, number> = {};
  for (const table of PROTECTED_TABLES) {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(`${table} count: ${error.message}`);
    result[table] = count ?? 0;
  }
  return result;
}
async function profileSnapshot(db: SupabaseClient) {
  const loaded = await loadDynamicSuffixProfiles(db, "00000000-0000-0000-0000-000000000000", { allowStagingProfiles: true });
  const projections = loaded.profiles.map((profile) => ({
    profileKey: profile.microSkillKey,
    productionEnabled: profile.productionEnabled,
    memberIds: [...profile.wordsByCanonicalId.keys()],
    memberWords: [...profile.wordsByCanonicalId.values()].map((word) => word.displayWord),
  }));
  return { profileCount: projections.length, memberCount: projections.reduce((sum, row) => sum + row.memberIds.length, 0), diagnostics: loaded.diagnostics, projections, fingerprint: fingerprintSnapshotValue(projections) };
}
function basePlan(childId: string, planDate: string): ComposedDailyPlan {
  return { childId, planDate, ...activeAdlePolicyProofProjection(), throttle: {}, partOne: {}, partTwo: {}, budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] } } as unknown as ComposedDailyPlan;
}

async function preflight(db: SupabaseClient) {
  const profiles = await profileSnapshot(db);
  assert.equal(profiles.profileCount, 10);
  assert.equal(profiles.memberCount, 40);
  assert.deepEqual(profiles.diagnostics, []);
  assert(profiles.projections.every((profile) => profile.productionEnabled && profile.memberIds.length === 4));
  console.log(JSON.stringify({ status: "preflight_passed", stagingSupabaseProject: STAGING_REF, stagingVercelProject: STAGING_VERCEL_PROJECT, productionIdentityRejected: true, profiles }));
}

async function setup(db: SupabaseClient) {
  mutating("setup");
  assert(!existsSync(STATE_PATH), "proof state already exists");
  const baselineProfiles = await profileSnapshot(db);
  assert.equal(baselineProfiles.profileCount, 10);
  assert.deepEqual(baselineProfiles.diagnostics, []);
  const baselineProtectedCounts = await protectedCounts(db);
  const runId = randomUUID();
  const suffix = `${Date.now()}-${runId.slice(0, 8)}`;
  const parentEmail = `adle-affix-v3-${suffix}@example.test`;
  const parentPassword = `Disposable-${suffix}!`;
  const { data: created, error: userError } = await db.auth.admin.createUser({ email: parentEmail, password: parentPassword, email_confirm: true });
  if (userError || !created.user) throw new Error(`create disposable parent: ${userError?.message}`);
  const parentUserId = created.user.id;
  const planDate = new Date().toISOString().slice(0, 10);
  const fixtures: Fixture[] = [];
  try {
    for (const definition of FIXTURE_DEFINITIONS) {
      const { data: child, error: childError } = await db.from("children").insert({ parent_user_id: parentUserId, first_name: `DAFX3 ${runId.slice(0, 8)} ${definition.purpose}` }).select("id").single();
      if (childError || !child) throw new Error(`${definition.purpose}: child: ${childError?.message}`);
      const loaded = await loadDynamicSuffixProfiles(db, child.id, { allowStagingProfiles: true });
      const profile = loaded.profiles.find((entry) => entry.microSkillKey === definition.profileKey);
      assert(profile, `${definition.purpose}: profile missing`);
      const byWord = new Map([...profile.wordsByCanonicalId.values()].map((word) => [word.displayWord, word]));
      const authentic = definition.authenticWords.map((word) => byWord.get(word));
      assert(authentic.every(Boolean), `${definition.purpose}: authentic display word missing`);
      const learningItemIds: string[] = [];
      for (const word of authentic) {
        const { data: row, error } = await db.from("adle_learning_items").insert({ child_id: child.id, canonical_word_id: word!.canonicalWordId, micro_skill_key: definition.profileKey, item_status: "pending", source_kind: "verified_misspelling", source_ref: `${SOURCE_PREFIX}${runId}:${definition.purpose}`, source_attempt_text: null, reteach_priority: false, intake_on: planDate, row_status: "active" }).select("id").single();
        if (error || !row) throw new Error(`${definition.purpose}: learning item: ${error?.message}`);
        learningItemIds.push(row.id);
      }
      for (const word of profile.wordsByCanonicalId.values()) {
        const { error } = await db.from("child_word_treasures").insert({ child_id: child.id, parent_user_id: parentUserId, canonical_word_id: word.canonicalWordId, corrected_word: word.displayWord, corrected_word_normalized: word.displayWord.toLocaleLowerCase("en-GB"), original_misspelling: `fixture-${word.displayWord}`, micro_skill_key: definition.profileKey, status: "golden_nugget", metadata: { fixture: SOURCE_PREFIX, runId, purpose: definition.purpose } });
        if (error) throw new Error(`${definition.purpose}: treasure: ${error.message}`);
      }
      fixtures.push({ purpose: definition.purpose, profileKey: definition.profileKey, childId: child.id, learningItemIds, authenticWordIds: authentic.map((word) => word!.canonicalWordId), authenticWords: [...definition.authenticWords], profileWordIds: [...profile.wordsByCanonicalId.keys()], profileWords: [...profile.wordsByCanonicalId.values()].map((word) => word.displayWord) });
    }
    saveState({ receiptVersion: "adle_dynamic_affix_shared_staging_proof_v1", runId, gitSha: required("ADLE_DYNAMIC_AFFIX_PROOF_GIT_SHA"), planDate, parentUserId, parentEmail, parentPassword, baselineProtectedCounts, baselineProfiles, fixtures, deployments: {} });
    console.log(JSON.stringify({ status: "fixtures_ready", runId, planDate, fixtureCount: fixtures.length, childCount: fixtures.length, learningItemCount: fixtures.reduce((sum, entry) => sum + entry.learningItemIds.length, 0), credentialsStoredOnlyInIgnoredProofState: true }));
  } catch (error) {
    await db.from("children").delete().eq("parent_user_id", parentUserId);
    await db.auth.admin.deleteUser(parentUserId);
    throw error;
  }
}

async function verifyAssignment(db: SupabaseClient, state: State, entry: Fixture, mode: DynamicAffixCompilerMode) {
  const { data: header, error: headerError } = await db.from("daily_assignments").select("id,status,assignment_generation_source,lesson_route_metadata").eq("parent_user_id", state.parentUserId).eq("child_id", entry.childId).eq("assignment_date", state.planDate).eq("title", "ADLE Daily Plan").single();
  if (headerError || !header) throw new Error(`${entry.purpose}: header: ${headerError?.message}`);
  const { data: persistedItems, error: itemError } = await db.from("assignment_items").select("id,source_entity_id,template_key,target_word,position,status,prompt_data,metadata").eq("daily_assignment_id", header.id).order("position");
  if (itemError || !persistedItems) throw new Error(`${entry.purpose}: items: ${itemError?.message}`);
  const loaded = await loadDynamicSuffixProfiles(db, entry.childId, { allowStagingProfiles: true });
  const selection = selectDynamicAffixWordLab(loaded);
  assert(selection && selection.profile.microSkillKey === entry.profileKey, `${entry.purpose}: unchanged normal selector`);
  assert.deepEqual(selection.authenticTargets.map((item) => item.canonicalWordId), entry.authenticWordIds, `${entry.purpose}: authentic member order`);
  const decision = compileDynamicAffixWordLabDecision(selection, { mode, sourceKind: "teaching_dictionary", legacyCompiler: mode === "shared_authoritative" ? () => { throw new Error("shared authority called legacy"); } : undefined });
  assert(decision.ok, `${entry.purpose}:${mode}: decision`);
  assert.equal(decision.metrics.legacyInvoked, mode !== "shared_authoritative");
  const root = (persistedItems as any[]).find((item) => item.prompt_data?.dynamicAffixActivityId === "intro-root");
  const payload = root?.prompt_data?.dynamicAffixLesson as DynamicAffixLessonPayloadV3 | undefined;
  assert(payload && canonicalDynamicAffixPublicV3Bytes(payload) === canonicalDynamicAffixPublicV3Bytes(decision.payload), `${entry.purpose}: exact public V3 bytes`);
  const strict = validateDynamicAffixV3ForNewWrite({ payload, selection, sharedLesson: decision.sharedLesson ?? undefined, parityPayload: decision.payload });
  assert(strict.ok, `${entry.purpose}: strict new-write V3`);
  const plan = buildDynamicAffixAssignmentPlan({ basePlan: basePlan(entry.childId, state.planDate), selection, payload: decision.payload });
  if (decision.sharedLesson) assert.deepEqual(validateDynamicAffixAssignmentPlanAgainstSharedLesson({ plan, payload, lesson: decision.sharedLesson }), { ok: true });
  const persistence = planAssignmentPersistence(plan, { parentUserId: state.parentUserId, existingHeaders: [] });
  assert(persistence.action === "insert", `${entry.purpose}: persistence projection`);
  const mismatches = assignmentItemProjectionMismatchPaths(persistence.items.map(expectedAssignmentItemProofProjection), persistedItems.map(persistedAssignmentItemProofProjection));
  assert.deepEqual(mismatches, [], `${entry.purpose}: persisted plan/binding mismatch`);
  assert.equal(header.assignment_generation_source, "adle_composer_v1");
  entry.assignmentId = header.id;
  entry.itemCount = persistedItems.length;
  entry.payloadFingerprint = strict.publicFingerprint;
  entry.sourceFingerprint = decision.sourceFingerprint;
  entry.lessonFingerprint = decision.lessonFingerprint;
  entry.contentVersion = payload.contentVersion;
  entry.lessonWordIds = payload.words.lesson.map((word) => word.canonicalWordId);
  entry.lessonWords = payload.words.lesson.map((word) => word.displayWord);
  entry.sentences = payload.activities.dictation.map((sentence) => sentence.sentence);
  entry.splitPoint = payload.words.lesson[0]!.splitPoints[0];
  return { assignmentId: header.id, itemCount: persistedItems.length, payloadFingerprint: strict.publicFingerprint, legacyInvoked: decision.metrics.legacyInvoked };
}

async function verifyMode(db: SupabaseClient, mode: DynamicAffixCompilerMode) {
  const state = loadState();
  const purpose = mode === "legacy_authoritative" ? "mode_legacy" : mode === "shadow" ? "mode_shadow" : mode === "enforced_parity" ? "mode_enforced" : "mode_shared";
  const entry = fixture(state, purpose);
  const deployment = { deploymentId: required("ADLE_DYNAMIC_AFFIX_PROOF_DEPLOYMENT_ID"), deploymentUrl: required("ADLE_DYNAMIC_AFFIX_PROOF_DEPLOYMENT_URL"), implementationSha: required("ADLE_DYNAMIC_AFFIX_PROOF_GIT_SHA") };
  assert.equal(deployment.implementationSha, state.gitSha, "deployment SHA differs from pinned proof SHA");
  const evidence = await verifyAssignment(db, state, entry, mode);
  let mismatchZeroWrite = false;
  if (mode === "enforced_parity") {
    const before = await protectedCounts(db);
    const loaded = await loadDynamicSuffixProfiles(db, entry.childId, { allowStagingProfiles: true });
    const selection = selectDynamicAffixWordLab(loaded)!;
    const shared = compileDynamicAffixSelectionThroughSharedCompiler(
      selection,
      "teaching_dictionary",
    );
    assert(shared.ok);
    const blocked = compileDynamicAffixWordLabDecision(selection, { mode, sharedCompiler: () => ({
      ...shared,
      payload: {
        ...shared.payload,
        activities: {
          ...shared.payload.activities,
          reflection: {
            ...shared.payload.activities.reflection,
            promptText: `${shared.payload.activities.reflection.promptText}:staging-mismatch`,
          },
        },
      },
    }) });
    assert(!blocked.ok && blocked.blockerCode === "public_payload_byte_mismatch");
    assert.deepEqual(await protectedCounts(db), before, "enforced mismatch changed staging rows");
    mismatchZeroWrite = true;
  }
  state.deployments[mode] = deployment;
  saveState(state);
  console.log(JSON.stringify({ status: "mode_verified", mode, deployment, ...evidence, exactPayloadPlanBindingParity: true, shadowAdditionalWrites: 0, mismatchZeroWrite }));
}

async function verifySharedAssignments(db: SupabaseClient) {
  const state = loadState();
  const purposes = [...CLASS_PURPOSES, "rollback_four_authentic", "rollback_transfer_resume"];
  const results = [];
  for (const purpose of purposes) results.push({ purpose, ...(await verifyAssignment(db, state, fixture(state, purpose), "shared_authoritative")) });
  saveState(state);
  console.log(JSON.stringify({ status: "shared_assignments_verified", count: results.length, sevenClasses: CLASS_PURPOSES, rollbackFixtures: 2, legacyInvocationCount: 0, results }));
}

async function verifyCompletedFixture(db: SupabaseClient, state: State, entry: Fixture) {
  assert(entry.assignmentId && entry.lessonWordIds && entry.lessonWords, `${entry.purpose}: assignment proof missing`);
  const assignmentId = entry.assignmentId;
  const { data: header, error: headerError } = await db.from("daily_assignments").select("status").eq("id", assignmentId).single();
  if (headerError) throw headerError;
  assert.equal(header?.status, "completed", `${entry.purpose}: assignment incomplete`);
  const { data: attempts, error: attemptError } = await db.from("adle_assignment_attempt_events").select("attempt_kind,canonical_word_id,attempt_text,is_correct").eq("daily_assignment_id", assignmentId);
  if (attemptError) throw attemptError;
  const production = (attempts ?? []).filter((row: any) => row.attempt_kind === "lesson_production");
  const dictation = (attempts ?? []).filter((row: any) => row.attempt_kind === "lesson_dictation");
  assert.equal(production.length, 4, `${entry.purpose}: one Cover Check event per word`);
  assert.equal(dictation.length, 4, `${entry.purpose}: one Dictation event per word`);
  assert.equal(new Set(production.map((row: any) => row.canonical_word_id)).size, 4);
  assert.equal(new Set(dictation.map((row: any) => row.canonical_word_id)).size, 4);
  const { data: taught, error: taughtError } = await db.from("adle_taught_word_history").select("canonical_word_id,event_kind,occurred_on,source_ref,row_status,attempt_text").eq("child_id", entry.childId).eq("row_status", "active");
  if (taughtError) throw taughtError;
  assert.equal(taught?.length, 4, `${entry.purpose}: taught/evidence covers all four words once`);
  const { data: schedules, error: scheduleError } = await db.from("adle_review_schedule_words").select("id,canonical_word_id").eq("child_id", entry.childId).eq("row_status", "active");
  if (scheduleError) throw scheduleError;
  assert.deepEqual((schedules ?? []).map((row: any) => row.canonical_word_id).sort(), [...entry.authenticWordIds].sort(), `${entry.purpose}: authentic-only schedules`);
  const { data: routes, error: routeError } = schedules?.length ? await db.from("adle_review_schedule_word_routes").select("schedule_word_id,learning_item_id,micro_skill_key").in("schedule_word_id", schedules.map((row: any) => row.id)).eq("row_status", "active") : { data: [], error: null };
  if (routeError) throw routeError;
  assert.equal(routes?.length ?? 0, entry.authenticWordIds.length, `${entry.purpose}: authentic-only schedule routes`);
  const { data: learningItems, error: learningError } = await db.from("adle_learning_items").select("id,canonical_word_id,item_status").eq("child_id", entry.childId).eq("row_status", "active");
  if (learningError) throw learningError;
  assert.equal(learningItems?.length, entry.authenticWordIds.length, `${entry.purpose}: no transfer learning item`);
  assert(learningItems?.every((row: any) => row.item_status === "awaiting_review_outcome"), `${entry.purpose}: authentic item transition`);
  const { count: bundleCount, error: bundleError } = await db.from("adle_review_bundles").select("id", { count: "exact", head: true }).eq("child_id", entry.childId).eq("row_status", "active");
  if (bundleError) throw bundleError;
  assert.equal(bundleCount, 1, `${entry.purpose}: one authentic review bundle`);
  const { count: reflectionCount, error: reflectionError } = await db.from("adle_child_learning_reflections").select("id", { count: "exact", head: true }).eq("child_id", entry.childId).eq("daily_assignment_id", assignmentId);
  if (reflectionError) throw reflectionError;
  assert.equal(reflectionCount, 1, `${entry.purpose}: one Reflection`);
  let treasures: any[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await db.from("child_word_treasures").select("id,corrected_word,status").eq("child_id", entry.childId);
    if (result.error) throw result.error;
    treasures = result.data ?? [];
    if (treasures.length === 4 && treasures.every((row) => row.status === "in_forge")) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  assert.equal(treasures.length, 4);
  assert(treasures.every((row) => row.status === "in_forge"), `${entry.purpose}: all-word reward bridge`);
  const { count: rewardEvents, error: rewardError } = await db.from("child_word_treasure_events").select("id", { count: "exact", head: true }).eq("child_id", entry.childId).eq("event_type", "entered_forge");
  if (rewardError) throw rewardError;
  assert.equal(rewardEvents, 4, `${entry.purpose}: all-word reward events`);
  const evidence = (taught ?? []).map((event: any) => {
    const word = entry.lessonWords![entry.lessonWordIds!.indexOf(event.canonical_word_id)]!;
    const pricing = priceWordEvidence(EVIDENCE_POLICY_V1, { childId: entry.childId, canonicalWordId: event.canonical_word_id, normalisedWord: word, skillFamilyKey: "D4_MOR", outcomeEvents: [], taughtHistory: [{ childId: entry.childId, canonicalWordId: event.canonical_word_id, eventKind: event.event_kind, occurredOn: event.occurred_on, sourceRef: event.source_ref, rowStatus: event.row_status, attemptText: event.attempt_text }], authenticUseEvents: [], slippageEvents: [] });
    const wordState = computeWordEvidenceState(EVIDENCE_POLICY_V1, pricing, { outcomeEvents: [], taughtHistory: [{ childId: entry.childId, canonicalWordId: event.canonical_word_id, eventKind: event.event_kind, occurredOn: event.occurred_on, sourceRef: event.source_ref, rowStatus: event.row_status, attemptText: event.attempt_text }], slippageEvents: [] });
    return { canonicalWordId: event.canonical_word_id, role: entry.authenticWordIds.includes(event.canonical_word_id) ? "authentic" : "transfer", score: pricing.score, state: wordState.state, breadth: stateCredit(PROFICIENCY_POLICY_V1, wordState.state) };
  });
  assert(evidence.every((row) => row.score === 0.75 && row.state === "active" && row.breadth === 0.1), `${entry.purpose}: evidence/state/breadth`);
  entry.completion = { attempts: attempts?.length ?? 0, coverAttempts: 4, dictationAttempts: 4, taught: 4, schedules: schedules?.length ?? 0, scheduleRoutes: routes?.length ?? 0, learningItems: learningItems?.length ?? 0, reviewBundles: bundleCount, reflection: reflectionCount, rewardTreasures: 4, rewardEvents, evidence };
  return entry.completion;
}

async function verifyCompleted(db: SupabaseClient, group: string) {
  const state = loadState();
  const purposes = group === "classes"
    ? [...CLASS_PURPOSES]
    : group === "mode-legacy"
      ? ["mode_legacy"]
      : group === "mode-shadow"
        ? ["mode_shadow"]
        : group === "mode-enforced"
          ? ["mode_enforced"]
          : group === "mode-shared"
            ? ["mode_shared"]
            : group === "older-four-authentic"
              ? ["rollback_four_authentic"]
              : group === "restored-transfer"
                ? ["rollback_transfer_resume"]
                : [];
  assert(purposes.length > 0, "verify-completed group must be a mode group, classes, older-four-authentic, or restored-transfer");
  const results = [];
  for (const purpose of purposes) results.push({ purpose, ...(await verifyCompletedFixture(db, state, fixture(state, purpose))) });
  saveState(state);
  console.log(JSON.stringify({ status: "completion_verified", group, results }));
}

async function verifyOlderResumeOnly(db: SupabaseClient) {
  const state = loadState();
  const entry = fixture(state, "rollback_transfer_resume");
  assert(entry.assignmentId);
  const { data: header, error } = await db.from("daily_assignments").select("status").eq("id", entry.assignmentId).single();
  if (error) throw error;
  assert.equal(header?.status, "ready", "older app must not complete transfer-bearing assignment");
  const { count: attempts } = await db.from("adle_assignment_attempt_events").select("id", { count: "exact", head: true }).eq("daily_assignment_id", entry.assignmentId);
  assert.equal(attempts, 0, "older load/resume must not write attempts");
  console.log(JSON.stringify({ status: "older_resume_only_verified", assignmentId: entry.assignmentId, assignmentStatus: header.status, completionWrites: 0 }));
}

async function cleanup(db: SupabaseClient) {
  mutating("cleanup");
  const state = loadState();
  const childIds = state.fixtures.map((entry) => entry.childId);
  const learningItemIds = state.fixtures.flatMap((entry) => entry.learningItemIds);
  const { error: childError } = await db.from("children").delete().in("id", childIds);
  if (childError) throw childError;
  const { error: authError } = await db.auth.admin.deleteUser(state.parentUserId);
  if (authError) throw authError;
  const residue: Record<string, number> = {};
  for (const table of PROTECTED_TABLES) {
    if (table === "adle_review_schedule_word_routes") {
      const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).in("learning_item_id", learningItemIds);
      if (error) throw new Error(`${table} residue: ${error.message}`);
      residue[table] = count ?? 0;
      continue;
    }
    const column = table === "children" ? "id" : "child_id";
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).in(column, childIds);
    if (error) throw new Error(`${table} residue: ${error.message}`);
    residue[table] = count ?? 0;
  }
  const { data: users, error: usersError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  residue.authUsers = users.users.some((user) => user.id === state.parentUserId) ? 1 : 0;
  assert(Object.values(residue).every((count) => count === 0), `fixture residue: ${JSON.stringify(residue)}`);
  const finalProfiles = await profileSnapshot(db);
  assert.deepEqual(finalProfiles, state.baselineProfiles, "profile projection changed");
  const finalCounts = await protectedCounts(db);
  assert.deepEqual(finalCounts, state.baselineProtectedCounts, "protected counts did not return to baseline");
  rmSync(STATE_PATH, { force: true });
  console.log(JSON.stringify({ status: "cleanup_verified", exactFixtureResidue: 0, residue, profileProjectionUnchanged: true, profileFingerprint: finalProfiles.fingerprint, protectedCountsRestored: true }));
}

async function main() {
  const command = process.argv[2];
  const db = client();
  if (command === "preflight") return preflight(db);
  if (command === "setup") return setup(db);
  if (command === "verify-mode") {
    const mode = process.argv[3] as DynamicAffixCompilerMode;
    assert(["legacy_authoritative", "shadow", "enforced_parity", "shared_authoritative"].includes(mode));
    return verifyMode(db, mode);
  }
  if (command === "verify-shared-assignments") return verifySharedAssignments(db);
  if (command === "verify-completed") return verifyCompleted(db, process.argv[3] ?? "");
  if (command === "verify-older-resume-only") return verifyOlderResumeOnly(db);
  if (command === "cleanup") return cleanup(db);
  throw new Error("Use preflight, setup, verify-mode <mode>, verify-shared-assignments, verify-completed <group>, verify-older-resume-only, or cleanup.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
