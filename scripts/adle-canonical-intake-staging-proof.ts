#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- staging proof reads additive tables ahead of generated types */
import assert from "node:assert/strict";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  intakeApprovedSubmissionCorrections,
  runCanonicalIntakeReconciliationSweep,
} from "../lib/adle/loaders/canonical-intake-live";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const TAG = "adle_canonical_intake_staging_proof_2026_08_04";
const CONFIRMATION = `${TAG}:disposable-staging-only`;

const MATRIX = [
  ["misslead", "mislead", "D4_MOR_PREFIXES_DIS_MIS"],
  ["imcorrect", "incorrect", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["riplay", "replay", "D4_MOR_PREFIXES_RE_PRE"],
  ["urnkind", "unkind", "D4_MOR_PREFIXES_UN"],
  ["imvisible", "invisible", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["reebuild", "rebuild", "D4_MOR_PREFIXES_RE_PRE"],
  ["preeview", "preview", "D4_MOR_PREFIXES_RE_PRE"],
  ["urnlocked", "unlocked", "D4_MOR_PREFIXES_UN"],
  ["inpossible", "impossible", "D4_MOR_PREFIXES_IN_IM_IL_IR"],
  ["disshonest", "dishonest", "D4_MOR_PREFIXES_DIS_MIS"],
  ["supahero", "superhero", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
  ["intanational", "international", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
  ["subbway", "subway", "D4_MOR_PREFIXES_SUB_INTER_SUPER"],
] as const;

type Mode = "run" | "verify" | "cleanup";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function mode(): Mode {
  const value = process.argv[2] ?? "verify";
  if (value === "run" || value === "verify" || value === "cleanup") return value;
  throw new Error("Usage: adle-canonical-intake-staging-proof.ts <run|verify|cleanup>");
}

function serviceClient(): SupabaseClient {
  const url = required("SUPABASE_URL");
  const hostname = new URL(url).hostname;
  if (hostname.includes(PRODUCTION_REF)) throw new Error("Production Supabase is permanently rejected.");
  if (hostname !== `${STAGING_REF}.supabase.co`) throw new Error(`Unexpected Supabase identity: ${hostname}.`);
  const key = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.trim()) throw new Error("Missing staging service-role key.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function assertQuery(error: { message?: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message ?? "unknown error"}`);
}

async function protectedCounts(db: SupabaseClient) {
  const tables = [
    "adle_learning_items",
    "daily_assignments",
    "assignment_items",
    "adle_assignment_attempt_events",
    "adle_review_schedule_words",
    "child_word_treasure_events",
  ] as const;
  const entries = await Promise.all(tables.map(async (table) => {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
    assertQuery(error, `Count ${table}`);
    return [table, count ?? 0] as const;
  }));
  return Object.fromEntries(entries) as Record<(typeof tables)[number], number>;
}

async function taggedSourceCandidates(db: SupabaseClient) {
  const { data, error } = await db
    .from("parent_verified_spelling_candidate_mappings")
    .select("id,parent_verification_id,task_submission_id,parent_user_id,child_id")
    .contains("metadata", { proofTag: TAG });
  assertQuery(error, "Read tagged source candidates");
  return (data ?? []) as any[];
}

async function taggedMappings(db: SupabaseClient) {
  const { data, error } = await db
    .from("spelling_canonical_mappings")
    .select("id")
    .contains("metadata", { proofTag: TAG });
  assertQuery(error, "Read tagged canonical mappings");
  return (data ?? []) as Array<{ id: string }>;
}

async function fixtureState(db: SupabaseClient) {
  const sourceCandidates = await taggedSourceCandidates(db);
  const sourceIds = sourceCandidates.map((row) => row.id as string);
  const { data: technical, error: technicalError } = sourceIds.length
    ? await db
        .from("adle_canonical_intake_candidates")
        .select("id,source_candidate_mapping_id,candidate_state,normalized_target_token,learning_item_id")
        .in("source_candidate_mapping_id", sourceIds)
    : { data: [], error: null };
  assertQuery(technicalError, "Read technical candidates");
  const technicalIds = (technical ?? []).map((row: any) => row.id as string);
  const { data: links, error: linkError } = technicalIds.length
    ? await db
        .from("adle_canonical_intake_candidate_demands")
        .select("candidate_id,demand_id,link_status")
        .in("candidate_id", technicalIds)
    : { data: [], error: null };
  assertQuery(linkError, "Read fixture demand links");
  const demandIds = [...new Set((links ?? []).map((row: any) => row.demand_id as string))];
  const { data: demands, error: demandError } = demandIds.length
    ? await db
        .from("adle_canonical_intake_demands")
        .select("id,demand_type,target_identity_status,normalized_target_token,canonical_word_id,lifecycle_status,primary_blocker_code,occurrence_count,notification_status")
        .in("id", demandIds)
    : { data: [], error: null };
  assertQuery(demandError, "Read fixture demands");
  const { data: sources, error: sourceError } = sourceIds.length
    ? await db
        .from("adle_learning_item_sources")
        .select("id,learning_item_id,parent_verified_candidate_mapping_id")
        .in("parent_verified_candidate_mapping_id", sourceIds)
    : { data: [], error: null };
  assertQuery(sourceError, "Read fixture learning-item sources");
  return {
    sourceCandidates,
    sourceIds,
    technical: (technical ?? []) as any[],
    technicalIds,
    links: (links ?? []) as any[],
    demandIds,
    demands: (demands ?? []) as any[],
    learningSources: (sources ?? []) as any[],
    learningItemIds: [...new Set((sources ?? []).map((row: any) => row.learning_item_id as string))],
  };
}

async function insertFixtures(db: SupabaseClient) {
  const existing = await fixtureState(db);
  assert.equal(existing.sourceIds.length, 0, "Tagged fixture rows already exist; run cleanup first.");
  const { data: existingMappings, error: existingMappingError } = await db
    .from("spelling_canonical_mappings")
    .select("id")
    .in("misspelling_normalized", MATRIX.map(([misspelling]) => misspelling));
  assertQuery(existingMappingError, "Read conflicting mappings");
  assert.equal(existingMappings?.length ?? 0, 0, "Staging has non-fixture mappings for the proof misspellings.");

  const { data: submissions, error: submissionError } = await db
    .from("task_submissions")
    .select("id,parent_user_id,child_id,parent_review_status")
    .eq("parent_review_status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);
  assertQuery(submissionError, "Read approved staging submission");
  assert.equal(submissions?.length ?? 0, 1, "One existing approved staging submission is required.");
  const submission = submissions![0] as any;

  const verificationRows = MATRIX.map(([misspelling, , microSkillKey], index) => ({
    child_id: submission.child_id,
    parent_user_id: submission.parent_user_id,
    domain_module: "spelling",
    source_type: "canonical_intake_staging_proof",
    source_entity_id: `${TAG}:${index}:${misspelling}`,
    task_submission_id: submission.id,
    suggested_micro_skill_key: microSkillKey,
    decision: "accepted",
    verified_micro_skill_key: microSkillKey,
    metadata: { proofTag: TAG, fixtureOrdinal: index },
  }));
  const { data: verifications, error: verificationError } = await db
    .from("parent_verifications")
    .insert(verificationRows)
    .select("id");
  assertQuery(verificationError, "Insert fixture parent verifications");
  assert.equal(verifications?.length ?? 0, MATRIX.length);

  const candidateRows = MATRIX.map(([misspelling, target, microSkillKey], index) => ({
    parent_user_id: submission.parent_user_id,
    child_id: submission.child_id,
    parent_verification_id: (verifications![index] as any).id,
    task_submission_id: submission.id,
    source_provenance: "lesson_submission_parent_added_missed_word",
    reviewed_event_source_entity_id: `${TAG}:${index}:${misspelling}`,
    original_child_spelling: misspelling,
    original_correct_spelling: target,
    misspelling_normalized: misspelling,
    correct_spelling_normalized: target,
    micro_skill_key: microSkillKey,
    candidate_status: "parent_local_promoted",
    promotion_scope: "parent_local",
    metadata: { proofTag: TAG, fixtureOrdinal: index },
  }));
  const { data: candidates, error: candidateError } = await db
    .from("parent_verified_spelling_candidate_mappings")
    .insert(candidateRows)
    .select("id");
  assertQuery(candidateError, "Insert fixture source candidates");
  assert.equal(candidates?.length ?? 0, MATRIX.length);

  const mappingRows = MATRIX.map(([misspelling, target, microSkillKey], index) => ({
    misspelling_normalized: misspelling,
    correct_spelling_normalized: target,
    micro_skill_key: microSkillKey,
    mapping_status: "active",
    resolver_visibility_status: "visible",
    created_by_admin_user_id: submission.parent_user_id,
    decision_note: "Disposable staging-only canonical-intake proof",
    source_candidate_mapping_id: (candidates![index] as any).id,
    metadata: { proofTag: TAG, fixtureOrdinal: index },
  }));
  const { data: mappings, error: mappingError } = await db
    .from("spelling_canonical_mappings")
    .insert(mappingRows)
    .select("id");
  assertQuery(mappingError, "Insert fixture canonical mappings");
  assert.equal(mappings?.length ?? 0, MATRIX.length);

  const eventRows = MATRIX.map(([misspelling, target, microSkillKey], index) => ({
    mapping_id: (mappings![index] as any).id,
    event_type: "resolver_visibility_enabled",
    new_status: "active",
    new_misspelling_normalized: misspelling,
    new_correct_spelling_normalized: target,
    new_micro_skill_key: microSkillKey,
    previous_resolver_visibility_status: "hidden",
    new_resolver_visibility_status: "visible",
    admin_user_id: submission.parent_user_id,
    note: "Disposable staging-only canonical-intake proof",
    metadata: { proofTag: TAG, fixtureOrdinal: index },
  }));
  const { error: eventError } = await db.from("spelling_canonical_mapping_events").insert(eventRows);
  assertQuery(eventError, "Insert fixture resolver-visibility events");
  return submission as { id: string; parent_user_id: string; child_id: string };
}

async function verifyExpectedState(db: SupabaseClient, beforeCounts?: Record<string, number>) {
  const state = await fixtureState(db);
  assert.equal(state.sourceIds.length, 13);
  assert.equal(state.technical.length, 13);
  assert.equal(state.technical.filter((row) => row.candidate_state === "activated").length, 12);
  assert.equal(state.technical.filter((row) => row.candidate_state === "pending_content").length, 1);
  const unlocked = state.technical.find((row) => row.normalized_target_token === "unlocked");
  assert.equal(unlocked?.candidate_state, "pending_content");
  assert.equal(state.demands.length, 1);
  const demand = state.demands[0];
  assert.equal(demand.demand_type, "teaching_content");
  assert.equal(demand.target_identity_status, "established");
  assert.equal(demand.normalized_target_token, "unlocked");
  assert.equal(demand.primary_blocker_code, "canonical_word_missing");
  assert.equal(demand.occurrence_count, 1);
  assert.notEqual(demand.notification_status, "resolved");
  assert.equal(state.links.length, 1);
  assert.equal(state.links[0]?.link_status, "waiting");
  assert.equal(state.learningSources.length, 12);
  assert.equal(state.learningItemIds.length, 12);
  const counts = await protectedCounts(db);
  if (beforeCounts) {
    assert.equal(counts.daily_assignments, beforeCounts.daily_assignments);
    assert.equal(counts.assignment_items, beforeCounts.assignment_items);
    assert.equal(counts.adle_assignment_attempt_events, beforeCounts.adle_assignment_attempt_events);
    assert.equal(counts.adle_review_schedule_words, beforeCounts.adle_review_schedule_words);
    assert.equal(counts.child_word_treasure_events, beforeCounts.child_word_treasure_events);
    assert.equal(counts.adle_learning_items, beforeCounts.adle_learning_items + 12);
  }
  return { state, counts, demandId: String(demand.id) };
}

async function runProof(db: SupabaseClient) {
  assert.equal(process.env.ADLE_CANONICAL_INTAKE_STAGING_CONFIRM, CONFIRMATION, `Set ADLE_CANONICAL_INTAKE_STAGING_CONFIRM=${CONFIRMATION}.`);
  process.env.ADLE_CANONICAL_INTAKE_ENABLED = "enabled";
  process.env.VERCEL_ENV = "preview";
  process.env.ADLE_DYNAMIC_PREFIX_STAGING_ENABLED = "enabled";
  process.env.ADLE_DYNAMIC_PREFIX_COMPILER_MODE = "shared_authoritative";
  const beforeCounts = await protectedCounts(db);
  const submission = await insertFixtures(db);
  const first = await intakeApprovedSubmissionCorrections({
    serviceClient: db,
    parentUserId: submission.parent_user_id,
    childId: submission.child_id,
    submissionId: submission.id,
  });
  console.log(JSON.stringify({
    status: "staging_fixture_first_pass",
    summary: {
      eligible: first.eligible,
      inserted: first.inserted,
      pendingContent: first.pendingContent,
      pendingMapping: first.pendingMapping,
      demandsCreated: first.demandsCreated,
    },
    blockers: first.blocked.map((entry) => ({
      candidateState: entry.candidateState,
      demandType: entry.demandType,
      blockers: entry.blockers.map((blocker) => ({
        code: blocker.code,
        microSkillKey: blocker.microSkillKey,
      })),
    })),
  }, null, 2));
  assert.deepEqual(
    { eligible: first.eligible, inserted: first.inserted, pendingContent: first.pendingContent, pendingMapping: first.pendingMapping, demandsCreated: first.demandsCreated },
    { eligible: 12, inserted: 12, pendingContent: 1, pendingMapping: 0, demandsCreated: 1 },
  );
  const second = await intakeApprovedSubmissionCorrections({
    serviceClient: db,
    parentUserId: submission.parent_user_id,
    childId: submission.child_id,
    submissionId: submission.id,
  });
  assert.deepEqual(
    { eligible: second.eligible, inserted: second.inserted, strengthened: second.strengthened, pendingContent: second.pendingContent, pendingMapping: second.pendingMapping, demandsCreated: second.demandsCreated },
    { eligible: 12, inserted: 0, strengthened: 12, pendingContent: 1, pendingMapping: 0, demandsCreated: 0 },
  );
  const sweep = await runCanonicalIntakeReconciliationSweep({
    serviceClient: db,
    leaseOwner: `${TAG}:manual-safety-sweep`,
    limit: 25,
  });
  assert.equal(sweep.enabled, true);
  assert.equal(sweep.claimed, 1);
  assert.equal(sweep.completed, 1);
  assert.equal(sweep.pendingContent, 1);
  const verified = await verifyExpectedState(db, beforeCounts);
  console.log(JSON.stringify({
    status: "staging_fixture_verified",
    tag: TAG,
    submissionId: submission.id,
    sourceCandidateIds: verified.state.sourceIds,
    demandId: verified.demandId,
    learningItemIds: verified.state.learningItemIds,
    first,
    second,
    sweep,
    protectedBefore: beforeCounts,
    protectedAfter: verified.counts,
  }, null, 2));
}

async function cleanup(db: SupabaseClient) {
  assert.equal(process.env.ADLE_CANONICAL_INTAKE_STAGING_CONFIRM, CONFIRMATION, `Set ADLE_CANONICAL_INTAKE_STAGING_CONFIRM=${CONFIRMATION}.`);
  const state = await fixtureState(db);
  const mappingRows = await taggedMappings(db);
  const mappingIds = mappingRows.map((row) => row.id);
  const verificationIds = state.sourceCandidates.map((row) => row.parent_verification_id as string);
  const proofSourceRefs = state.sourceIds.map((id) => `verified-correction:${id}`);
  const { data: proofOwnedItems, error: proofOwnedItemError } = proofSourceRefs.length
    ? await db
        .from("adle_learning_items")
        .select("id")
        .in("source_ref", proofSourceRefs)
    : { data: [], error: null };
  assertQuery(proofOwnedItemError, "Read proof-owned learning items");
  const proofOwnedItemIds = (proofOwnedItems ?? []).map((row: any) => row.id as string);
  const deleteIn = async (table: string, column: string, ids: string[]) => {
    if (!ids.length) return;
    const { error } = await db.from(table).delete().in(column, ids);
    assertQuery(error, `Cleanup ${table}`);
  };
  await deleteIn("adle_canonical_intake_events", "candidate_id", state.technicalIds);
  await deleteIn("adle_canonical_intake_events", "demand_id", state.demandIds);
  await deleteIn("adle_canonical_intake_reconciliation_queue", "candidate_id", state.technicalIds);
  await deleteIn("adle_canonical_intake_candidate_demands", "candidate_id", state.technicalIds);
  await deleteIn("adle_canonical_intake_candidates", "id", state.technicalIds);
  await deleteIn("adle_learning_item_sources", "parent_verified_candidate_mapping_id", state.sourceIds);
  await deleteIn("adle_learning_items", "id", proofOwnedItemIds);
  for (const demandId of state.demandIds) {
    const { count, error: countError } = await db
      .from("adle_canonical_intake_candidate_demands")
      .select("id", { count: "exact", head: true })
      .eq("demand_id", demandId);
    assertQuery(countError, "Check remaining demand links");
    if ((count ?? 0) === 0) await deleteIn("adle_canonical_intake_demands", "id", [demandId]);
  }
  await deleteIn("spelling_canonical_mapping_events", "mapping_id", mappingIds);
  await deleteIn("spelling_canonical_mappings", "id", mappingIds);
  await deleteIn("parent_verified_spelling_candidate_mappings", "id", state.sourceIds);
  await deleteIn("parent_verifications", "id", verificationIds);
  const remaining = await fixtureState(db);
  assert.equal(remaining.sourceIds.length, 0);
  assert.equal((await taggedMappings(db)).length, 0);
  console.log(JSON.stringify({ status: "staging_fixture_cleanup_verified", tag: TAG, deleted: { sourceCandidates: state.sourceIds.length, technicalCandidates: state.technicalIds.length, demands: state.demandIds.length, proofOwnedLearningItems: proofOwnedItemIds.length, reusedLearningItemsPreserved: state.learningItemIds.length - proofOwnedItemIds.length, mappings: mappingIds.length } }, null, 2));
}

async function main() {
  const db = serviceClient();
  const selectedMode = mode();
  if (selectedMode === "run") {
    try {
      await runProof(db);
    } catch (error) {
      await cleanup(db);
      throw error;
    }
  }
  else if (selectedMode === "cleanup") await cleanup(db);
  else {
    const verified = await verifyExpectedState(db);
    console.log(JSON.stringify({ status: "staging_fixture_state_verified", tag: TAG, demandId: verified.demandId, protectedCounts: verified.counts }, null, 2));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
