/* Disposable staging rows are narrowed and verified by the production loader. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { ComposedDailyPlan, DailyPlanFacts } from "../lib/adle/daily-assignment-composer";
import {
  buildDynamicPrefixAssignmentPlan,
  validateDynamicPrefixAssignmentPlanAgainstSharedLesson,
} from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import {
  DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS,
  compileDynamicPrefixWordLabDecision,
  type DynamicPrefixCompilerMode,
} from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { loadDynamicPrefixProfiles } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import {
  selectDynamicPrefixWordLab,
  validateDynamicPrefixWordLabPayload,
  type DynamicPrefixLessonPayloadV2,
} from "../lib/adle/morphology/dynamic-prefix-word-lab";
import {
  activeAdlePolicyProofProjection,
  assignmentItemProjectionMismatchPaths,
  expectedAssignmentItemProofProjection,
  fingerprintSerializableProofValue,
  persistedAssignmentItemProofProjection,
} from "./lib/adle-staging-proof-serialization";
import { approvedDictationCoverage } from "./lib/adle-staging-dictionary-coverage";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const PRODUCTION_HOST = `${PRODUCTION_REF}.supabase.co`;
const STAGING_VERCEL_PROJECT = "scarletts-spells-staged";
const STAGING_VERCEL_PROJECT_ID = "prj_oJkffstOtacc4juYloXajHpjJUha";
const PRODUCTION_VERCEL_PROJECT = "scarletts-spells";
const PRODUCTION_VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl";
const CONFIRMATION = "ADLE-DYNAMIC-PREFIX-ALL-FIVE-STAGING-V2";
const STATE_PATH = resolve(".tmp/adle-dynamic-prefix-shared-staging-proof-state.json");
const SOURCE_PREFIX = "dynamic-prefix-shared-staging-proof:";
const PROFILE_KEYS = [...DYNAMIC_PREFIX_MIGRATED_PROFILE_KEYS];

type Fixture = {
  profileKey: string;
  childId: string;
  learningItemId: string;
  canonicalWordId: string;
  expectedItemCount: 16 | 18;
};

type ModeEvidence = {
  deploymentId: string;
  deploymentUrl: string;
  assignments: Array<{
    profileKey: string;
    childId: string;
    assignmentId: string;
    itemCount: number;
    payloadFingerprint: string;
    sourceFingerprint: string;
    lessonFingerprint: string;
    legacyInvoked: boolean;
  }>;
};

type State = {
  receiptVersion: "adle_dynamic_prefix_shared_staging_proof_v2";
  runId: string;
  gitSha: string;
  planDate: string;
  parentUserId: string;
  parentEmail: string;
  parentPassword: string;
  baselineDictionary: Awaited<ReturnType<typeof dictionarySnapshot>>;
  fixtures: Fixture[];
  modes: Partial<Record<DynamicPrefixCompilerMode, ModeEvidence>>;
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL: ${message}`);
}

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing one of: ${names.join(", ")}`);
}

function mutating(command: string): void {
  assert(process.argv.includes("--apply"), `${command} requires --apply`);
  const confirmationIndex = process.argv.indexOf("--confirm");
  assert(
    confirmationIndex >= 0 && process.argv[confirmationIndex + 1] === CONFIRMATION,
    `${command} requires --confirm ${CONFIRMATION}`,
  );
  assert(
    process.env.ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING === "disposable-data-only",
    "ADLE_DYNAMIC_PREFIX_ACCEPT_STAGING must be disposable-data-only",
  );
}

function assertProjectIdentity(): void {
  const project = JSON.parse(readFileSync(resolve(".vercel/project.json"), "utf8")) as {
    projectId?: string;
    projectName?: string;
  };
  assert(
    !isPinnedStagingVercelProject(project.projectId ?? "", project.projectName ?? "")
      ? project.projectId !== PRODUCTION_VERCEL_PROJECT_ID
        && project.projectName !== PRODUCTION_VERCEL_PROJECT
      : true,
    "production Vercel project is permanently rejected",
  );
  assert(
    isPinnedStagingVercelProject(project.projectId ?? "", project.projectName ?? ""),
    "Vercel project must be the pinned Scarlett's Spells staging project",
  );
}

function client(): SupabaseClient {
  assertProjectIdentity();
  const rawUrl = required("STAGING_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const url = new URL(rawUrl);
  assert(url.hostname !== PRODUCTION_HOST && !url.hostname.includes(PRODUCTION_REF), "production Supabase is permanently rejected");
  assert(isPinnedStagingSupabaseHost(url.hostname), "Supabase must be the pinned staging project");
  const key = required(
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SB_SERVICE_ROLE_KEY",
  );
  return createClient(url.toString(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function loadState(): State {
  assert(existsSync(STATE_PATH), "proof state is missing; run setup first");
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}

function saveState(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function isPinnedStagingSupabaseHost(hostname: string): boolean {
  return hostname === STAGING_HOST && hostname.includes(STAGING_REF);
}

function isPinnedStagingVercelProject(projectId: string, projectName: string): boolean {
  return projectId === STAGING_VERCEL_PROJECT_ID && projectName === STAGING_VERCEL_PROJECT;
}

function projectProductionRejectionVerified(): boolean {
  return !isPinnedStagingSupabaseHost(PRODUCTION_HOST)
    && !isPinnedStagingVercelProject(PRODUCTION_VERCEL_PROJECT_ID, PRODUCTION_VERCEL_PROJECT);
}

async function dictionarySnapshot(db: SupabaseClient) {
  const { data: profiles, error: profileError } = await db
    .from("canonical_teaching_dictionary_prefix_profiles")
    .select("id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,canonical_teaching_dictionary_prefix_members(canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,prefix_variant,teaching_split_parts,teaching_split_joins,assignment_eligible,row_status,review_status,canonical_teaching_dictionary_words!inner(display_word,frequency_band,age_band,complexity_band,row_status,review_status,canonical_teaching_dictionary_dictation_sentences(dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status)))")
    .in("micro_skill_key", PROFILE_KEYS)
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure");
  if (profileError) throw new Error(`dictionary profile snapshot: ${profileError.message}`);
  const orderedProfiles = [...(profiles ?? [])]
    .map((profile: any) => ({
      ...profile,
      canonical_teaching_dictionary_prefix_members: [
        ...(profile.canonical_teaching_dictionary_prefix_members ?? []),
      ].sort((left: any, right: any) =>
        left.canonical_word_id.localeCompare(right.canonical_word_id),
      ),
    }))
    .sort((left: any, right: any) => left.micro_skill_key.localeCompare(right.micro_skill_key));
  const members = orderedProfiles.flatMap(
    (profile: any) => profile.canonical_teaching_dictionary_prefix_members ?? [],
  );
  const canonicalWordIds = [...new Set(members.map((member: any) => member.canonical_word_id))].sort();
  const { data: metadata, error: metadataError } = await db
    .from("canonical_teaching_dictionary_word_metadata")
    .select("canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,row_status,review_status")
    .in("canonical_word_id", canonicalWordIds)
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure")
    .order("canonical_word_id");
  if (metadataError) throw new Error(`dictionary metadata snapshot: ${metadataError.message}`);
  const dictationCoverage = approvedDictationCoverage(members);
  return {
    profileCount: orderedProfiles.length,
    memberCount: members.length,
    canonicalWordCount: canonicalWordIds.length,
    metadataCount: metadata?.length ?? 0,
    dictationWordCount: dictationCoverage.wordCount,
    dictationCount: dictationCoverage.rowCount,
    fingerprint: fingerprintSnapshotValue({ profiles: orderedProfiles, metadata }),
  };
}

function basePlan(childId: string, planDate: string): ComposedDailyPlan {
  return {
    childId,
    planDate,
    ...activeAdlePolicyProofProjection(),
    throttle: {},
    partOne: {},
    partTwo: {},
    budget: {
      budgetResponses: 0,
      estimatedResponses: 0,
      guidedWordCount: 0,
      introTrimmed: false,
      trims: [],
    },
  } as unknown as ComposedDailyPlan;
}

async function preflight(db: SupabaseClient): Promise<void> {
  assert(projectProductionRejectionVerified(), "production identity rejection guard");
  const snapshot = await dictionarySnapshot(db);
  assert(snapshot.profileCount === 5, `expected five normal-path staging profiles, received ${snapshot.profileCount}`);
  assert(snapshot.memberCount === 35, `expected 35 staged Prefix members, received ${snapshot.memberCount}`);
  assert(snapshot.canonicalWordCount === 35, `expected 35 staged Prefix words, received ${snapshot.canonicalWordCount}`);
  assert(snapshot.metadataCount === 35, `expected 35 staged metadata rows, received ${snapshot.metadataCount}`);
  assert(
    snapshot.dictationWordCount === 35,
    `expected dictation coverage for all 35 staged words, received ${snapshot.dictationWordCount}`,
  );
  assert(
    snapshot.dictationCount >= snapshot.dictationWordCount,
    `expected at least one approved dictation row per staged word, received ${snapshot.dictationCount}`,
  );
  console.log(JSON.stringify({
    status: "preflight_passed",
    stagingSupabaseProject: STAGING_REF,
    stagingVercelProject: STAGING_VERCEL_PROJECT,
    productionIdentityRejected: true,
    profileCount: snapshot.profileCount,
    memberCount: snapshot.memberCount,
    metadataCount: snapshot.metadataCount,
    dictationWordCount: snapshot.dictationWordCount,
    dictationCount: snapshot.dictationCount,
    dictionaryFingerprint: snapshot.fingerprint,
    unNormalPathProfilePresent: true,
  }));
}

async function setup(db: SupabaseClient): Promise<void> {
  mutating("setup");
  assert(!existsSync(STATE_PATH), "proof state already exists; cleanup or recover it first");
  const baselineDictionary = await dictionarySnapshot(db);
  assert(baselineDictionary.profileCount === 5, "setup requires exactly five normal-path staging profiles");
  const runId = randomUUID();
  const suffix = `${Date.now()}-${runId.slice(0, 8)}`;
  const parentEmail = `adle-prefix-shared-${suffix}@example.test`;
  const parentPassword = `Disposable-${suffix}!`;
  const { data: user, error: userError } = await db.auth.admin.createUser({
    email: parentEmail,
    password: parentPassword,
    email_confirm: true,
  });
  if (userError || !user.user) throw new Error(`create disposable parent: ${userError?.message}`);
  const parentUserId = user.user.id;
  const planDate = new Date().toISOString().slice(0, 10);
  const fixtures: Fixture[] = [];
  try {
    for (const profileKey of PROFILE_KEYS) {
      const { data: profile, error: profileError } = await db
        .from("canonical_teaching_dictionary_prefix_profiles")
        .select("micro_skill_key,canonical_teaching_dictionary_prefix_members(canonical_word_id,assignment_eligible,row_status,review_status)")
        .eq("micro_skill_key", profileKey)
        .eq("row_status", "active")
        .eq("review_status", "approved_for_first_exposure")
        .single();
      if (profileError || !profile) throw new Error(`${profileKey}: staging profile read: ${profileError?.message}`);
      const members = [...((profile as any).canonical_teaching_dictionary_prefix_members ?? [])]
        .filter((member: any) =>
          member.assignment_eligible
          && member.row_status === "active"
          && member.review_status === "approved_for_first_exposure",
        )
        .sort((left: any, right: any) => left.canonical_word_id.localeCompare(right.canonical_word_id));
      assert(members.length === 7, `${profileKey}: exactly seven eligible members`);
      const { data: child, error: childError } = await db
        .from("children")
        .insert({ parent_user_id: parentUserId, first_name: `Prefix proof ${fixtures.length + 1}` })
        .select("id")
        .single();
      if (childError || !child) throw new Error(`${profileKey}: create child: ${childError?.message}`);
      const canonicalWordId = members[0].canonical_word_id as string;
      const { data: learningItem, error: learningItemError } = await db
        .from("adle_learning_items")
        .insert({
          child_id: child.id,
          canonical_word_id: canonicalWordId,
          micro_skill_key: profileKey,
          item_status: "pending",
          source_kind: "verified_misspelling",
          source_ref: `${SOURCE_PREFIX}${runId}:${profileKey}`,
          source_attempt_text: null,
          reteach_priority: false,
          intake_on: planDate,
          row_status: "active",
        })
        .select("id")
        .single();
      if (learningItemError || !learningItem) {
        throw new Error(`${profileKey}: seed learning item: ${learningItemError?.message}`);
      }
      fixtures.push({
        profileKey,
        childId: child.id,
        learningItemId: learningItem.id,
        canonicalWordId,
        expectedItemCount: profileKey === "D4_MOR_PREFIXES_SUB_INTER_SUPER" ? 18 : 16,
      });
    }
    saveState({
      receiptVersion: "adle_dynamic_prefix_shared_staging_proof_v2",
      runId,
      gitSha: required("ADLE_DYNAMIC_PREFIX_PROOF_GIT_SHA"),
      planDate,
      parentUserId,
      parentEmail,
      parentPassword,
      baselineDictionary,
      fixtures,
      modes: {},
    });
    console.log(JSON.stringify({
      status: "fixtures_ready",
      planDate,
      profileKeys: fixtures.map((fixture) => fixture.profileKey),
      childCount: fixtures.length,
      learningItemCount: fixtures.length,
      credentialsStoredOnlyInIgnoredProofState: true,
    }));
  } catch (error) {
    await db.from("children").delete().eq("parent_user_id", parentUserId);
    await db.auth.admin.deleteUser(parentUserId);
    throw error;
  }
}

async function verifyMode(
  db: SupabaseClient,
  mode: DynamicPrefixCompilerMode,
  deploymentId: string,
  deploymentUrl: string,
): Promise<void> {
  const current = loadState();
  assert(!current.modes[mode], `${mode} already has recorded evidence`);
  const assignments: ModeEvidence["assignments"] = [];
  for (const fixture of current.fixtures) {
    const { data: header, error: headerError } = await db
      .from("daily_assignments")
      .select("id,status,assignment_generation_source,lesson_route_metadata")
      .eq("parent_user_id", current.parentUserId)
      .eq("child_id", fixture.childId)
      .eq("assignment_date", current.planDate)
      .eq("title", "ADLE Daily Plan")
      .single();
    if (headerError || !header) throw new Error(`${fixture.profileKey}: assignment header: ${headerError?.message}`);
    const { data: persistedItems, error: itemError } = await db
      .from("assignment_items")
      .select("id,source_entity_id,template_key,target_word,position,status,prompt_data,metadata")
      .eq("daily_assignment_id", header.id)
      .order("position");
    if (itemError) throw new Error(`${fixture.profileKey}: assignment items: ${itemError.message}`);
    assert(persistedItems?.length === fixture.expectedItemCount, `${fixture.profileKey}: immutable item count`);
    const loaded = await loadDynamicPrefixProfiles(db, fixture.childId, { allowStagingProfiles: true });
    const selection = selectDynamicPrefixWordLab(loaded);
    assert(selection?.profile.microSkillKey === fixture.profileKey, `${fixture.profileKey}: normal selector path`);
    const decision = compileDynamicPrefixWordLabDecision(selection, {
      mode,
      sourceKind: "teaching_dictionary",
    });
    assert(decision.ok && decision.sharedLesson, `${fixture.profileKey}:${mode}: shared decision`);
    assert(
      decision.metrics.legacyInvoked === (mode !== "shared_authoritative"),
      `${fixture.profileKey}:${mode}: legacy invocation contract`,
    );
    assert(validateDynamicPrefixWordLabPayload(decision.payload), `${fixture.profileKey}: V2 validator`);
    assert(dynamicPrefixRuntime(decision.payload), `${fixture.profileKey}: runtime reconstruction`);
    const plan = buildDynamicPrefixAssignmentPlan({
      basePlan: basePlan(fixture.childId, current.planDate),
      facts: {} as DailyPlanFacts,
      selection,
      payload: decision.payload,
    });
    assert(
      validateDynamicPrefixAssignmentPlanAgainstSharedLesson({
        plan,
        payload: decision.payload,
        lesson: decision.sharedLesson,
      }).ok,
      `${fixture.profileKey}: shared plan validation`,
    );
    const persistence = planAssignmentPersistence(plan, {
      parentUserId: current.parentUserId,
      existingHeaders: [],
    });
    assert(persistence.action === "insert" && persistence.header, `${fixture.profileKey}: persistence projection`);
    assert(
      fingerprintSerializableProofValue(header.lesson_route_metadata) === fingerprintSerializableProofValue(persistence.header.lessonRouteMetadata),
      `${fixture.profileKey}: route metadata`,
    );
    const persistedProjection = persistedItems.map((item: any) =>
      persistedAssignmentItemProofProjection(item),
    );
    const expectedProjection = persistence.items.map((item) =>
      expectedAssignmentItemProofProjection(item),
    );
    const projectionMismatches = assignmentItemProjectionMismatchPaths(
      expectedProjection,
      persistedProjection,
    );
    assert(
      projectionMismatches.length === 0,
      `${fixture.profileKey}: persisted assignment projection (${projectionMismatches.join(",")})`,
    );
    const root = (persistedItems as any[]).find(
      (item) => item.prompt_data?.dynamicPrefixActivityId === "intro-root",
    );
    const persistedPayload = root?.prompt_data?.dynamicPrefixLesson as DynamicPrefixLessonPayloadV2 | undefined;
    assert(
      persistedPayload
      && validateDynamicPrefixWordLabPayload(persistedPayload)
      && fingerprintSerializableProofValue(persistedPayload) === fingerprintSerializableProofValue(decision.payload),
      `${fixture.profileKey}: persisted V2 payload parity`,
    );
    assert(header.assignment_generation_source === "adle_composer_v1", `${fixture.profileKey}: generation source`);
    assignments.push({
      profileKey: fixture.profileKey,
      childId: fixture.childId,
      assignmentId: header.id,
      itemCount: persistedItems.length,
      payloadFingerprint: fingerprintSerializableProofValue(persistedPayload),
      sourceFingerprint: decision.sharedLesson.provenance.sourceFingerprint,
      lessonFingerprint: decision.sharedLesson.fingerprint,
      legacyInvoked: decision.metrics.legacyInvoked,
    });
  }
  current.modes[mode] = { deploymentId, deploymentUrl, assignments };
  saveState(current);
  console.log(JSON.stringify({
    status: "mode_verified",
    mode,
    deploymentId,
    profileCount: assignments.length,
    itemCounts: assignments.map((assignment) => assignment.itemCount),
    exactPayloadPlanBindingParity: true,
    legacyInvocationCount: assignments.filter((assignment) => assignment.legacyInvoked).length,
  }));
}

async function resetMode(db: SupabaseClient, mode: DynamicPrefixCompilerMode): Promise<void> {
  mutating("reset-mode");
  const current = loadState();
  const evidence = current.modes[mode];
  assert(evidence, `${mode} evidence must be verified before reset`);
  const assignmentIds = evidence.assignments.map((assignment) => assignment.assignmentId);
  const { error } = await db.from("daily_assignments").delete().in("id", assignmentIds);
  if (error) throw new Error(`${mode}: reset assignments: ${error.message}`);
  const { count: remainingAssignments, error: assignmentCountError } = await db
    .from("daily_assignments")
    .select("id", { count: "exact", head: true })
    .in("id", assignmentIds);
  if (assignmentCountError) throw assignmentCountError;
  const { count: remainingItems, error: itemCountError } = await db
    .from("assignment_items")
    .select("id", { count: "exact", head: true })
    .in("daily_assignment_id", assignmentIds);
  if (itemCountError) throw itemCountError;
  assert(remainingAssignments === 0 && remainingItems === 0, `${mode}: assignment cleanup`);
  const childIds = current.fixtures.map((fixture) => fixture.childId);
  const { count: learningItems, error: learningItemError } = await db
    .from("adle_learning_items")
    .select("id", { count: "exact", head: true })
    .in("child_id", childIds)
    .eq("row_status", "active");
  if (learningItemError) throw learningItemError;
  assert(learningItems === current.fixtures.length, `${mode}: authentic items remain available`);
  console.log(JSON.stringify({ status: "mode_reset", mode, assignmentResidue: 0, itemResidue: 0 }));
}

async function verifyCompleted(db: SupabaseClient): Promise<void> {
  const current = loadState();
  const shared = current.modes.shared_authoritative;
  assert(shared, "shared-authoritative evidence is missing");
  const completedKeys = [
    "D4_MOR_PREFIXES_UN",
    "D4_MOR_PREFIXES_SUB_INTER_SUPER",
  ];
  const results = [];
  for (const profileKey of completedKeys) {
    const fixture = current.fixtures.find((entry) => entry.profileKey === profileKey)!;
    const assignment = shared.assignments.find((entry) => entry.profileKey === profileKey)!;
    const { data: header, error: headerError } = await db
      .from("daily_assignments")
      .select("status")
      .eq("id", assignment.assignmentId)
      .single();
    if (headerError) throw headerError;
    assert(header?.status === "completed", `${profileKey}: assignment completed`);
    const { count: completedItems, error: itemError } = await db
      .from("assignment_items")
      .select("id", { count: "exact", head: true })
      .eq("daily_assignment_id", assignment.assignmentId)
      .eq("status", "completed");
    if (itemError) throw itemError;
    const expectedAttempts = fixture.expectedItemCount - 2;
    const counts: Record<string, number> = {};
    for (const [name, table, filters] of [
      ["attempts", "adle_assignment_attempt_events", [["daily_assignment_id", assignment.assignmentId]]],
      ["reflections", "adle_child_learning_reflections", [["daily_assignment_id", assignment.assignmentId]]],
      ["taught", "adle_taught_word_history", [["child_id", fixture.childId]]],
      ["scheduled", "adle_review_schedule_words", [["child_id", fixture.childId]]],
      ["bundles", "adle_review_bundles", [["child_id", fixture.childId]]],
      ["treasures", "child_word_treasures", [["child_id", fixture.childId]]],
      ["rewardEvents", "child_word_treasure_events", [["child_id", fixture.childId]]],
    ] as const) {
      let query = db.from(table).select("id", { count: "exact", head: true });
      for (const [column, value] of filters) query = query.eq(column, value);
      const { count, error } = await query;
      if (error) throw new Error(`${profileKey}:${name}: ${error.message}`);
      counts[name] = count ?? 0;
    }
    const { data: learningItem, error: learningItemError } = await db
      .from("adle_learning_items")
      .select("canonical_word_id,item_status")
      .eq("id", fixture.learningItemId)
      .single();
    if (learningItemError) throw learningItemError;
    const { data: authenticAttempt, error: authenticAttemptError } = await db
      .from("adle_assignment_attempt_events")
      .select("is_correct")
      .eq("daily_assignment_id", assignment.assignmentId)
      .eq("canonical_word_id", learningItem.canonical_word_id)
      .eq("attempt_kind", "lesson_dictation")
      .single();
    if (authenticAttemptError) throw authenticAttemptError;
    const authenticPassed = authenticAttempt.is_correct === true;
    const expectedScheduleCount = authenticPassed ? 1 : 0;
    const expectedItemStatus = authenticPassed ? "awaiting_review_outcome" : "pending";
    assert(completedItems === fixture.expectedItemCount, `${profileKey}: all assignment items complete`);
    assert(counts.attempts === expectedAttempts, `${profileKey}: attempt count`);
    assert(counts.reflections === 1, `${profileKey}: one reflection`);
    assert(counts.taught === 1, `${profileKey}: one authentic taught-history event`);
    assert(
      counts.scheduled === expectedScheduleCount && counts.bundles === expectedScheduleCount,
      `${profileKey}: authentic scheduling follows the final dictation result`,
    );
    assert(learningItem.item_status === expectedItemStatus, `${profileKey}: authentic item transition follows the final dictation result`);
    assert(counts.treasures === 0 && counts.rewardEvents === 0, `${profileKey}: missing-treasure reward path is side-effect free`);
    results.push({
      profileKey,
      assignmentItems: completedItems,
      attempts: counts.attempts,
      reflections: counts.reflections,
      taught: counts.taught,
      scheduled: counts.scheduled,
      authenticPassed,
      itemStatus: learningItem.item_status,
      rewardBehavior: "missing_word_treasure_graceful",
    });
  }
  console.log(JSON.stringify({ status: "completion_verified", results }));
}

async function cleanup(db: SupabaseClient): Promise<void> {
  mutating("cleanup");
  const current = loadState();
  const childIds = current.fixtures.map((fixture) => fixture.childId);
  const { error: childError } = await db.from("children").delete().in("id", childIds);
  if (childError) throw new Error(`delete disposable children: ${childError.message}`);
  const { error: userError } = await db.auth.admin.deleteUser(current.parentUserId);
  if (userError) throw new Error(`delete disposable parent: ${userError.message}`);
  const childTables = [
    "children",
    "daily_assignments",
    "assignment_items",
    "adle_learning_items",
    "adle_assignment_attempt_events",
    "adle_child_learning_reflections",
    "adle_review_bundles",
    "adle_review_schedule_words",
    "adle_taught_word_history",
    "child_word_treasures",
    "child_word_treasure_events",
  ] as const;
  const residue: Record<string, number> = {};
  for (const table of childTables) {
    const childColumn = table === "children" ? "id" : "child_id";
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(childColumn, childIds);
    if (error) throw new Error(`${table} cleanup audit: ${error.message}`);
    residue[table] = count ?? 0;
  }
  const { data: authUsers, error: authError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw authError;
  residue.authUsers = authUsers.users.some((user) => user.id === current.parentUserId) ? 1 : 0;
  assert(Object.values(residue).every((count) => count === 0), `fixture residue: ${JSON.stringify(residue)}`);
  const afterDictionary = await dictionarySnapshot(db);
  assert(
    JSON.stringify(afterDictionary) === JSON.stringify(current.baselineDictionary),
    "profile/dictionary facts changed during proof",
  );
  rmSync(STATE_PATH, { force: true });
  console.log(JSON.stringify({
    status: "cleanup_verified",
    exactFixtureResidue: 0,
    profileDictionaryUnchanged: true,
    dictionaryFingerprint: afterDictionary.fingerprint,
  }));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const db = client();
  if (command === "preflight") return preflight(db);
  if (command === "setup") return setup(db);
  if (command === "verify-mode") {
    const mode = process.argv[3] as DynamicPrefixCompilerMode;
    assert(["shadow", "enforced_parity", "shared_authoritative"].includes(mode), "verify-mode requires a valid mode");
    return verifyMode(db, mode, required("ADLE_DYNAMIC_PREFIX_PROOF_DEPLOYMENT_ID"), required("ADLE_DYNAMIC_PREFIX_PROOF_DEPLOYMENT_URL"));
  }
  if (command === "reset-mode") return resetMode(db, process.argv[3] as DynamicPrefixCompilerMode);
  if (command === "verify-completed") return verifyCompleted(db);
  if (command === "cleanup") return cleanup(db);
  throw new Error("Use preflight, setup, verify-mode <mode>, reset-mode <mode>, verify-completed, or cleanup.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
