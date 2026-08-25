import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  selectDuePerWordReviewsV1,
  type PerWordReviewScheduleFactV1,
} from "./per-word-scheduler";
import { selectLeastRecentlyUsedReflectionPrompt } from "./prompt-selection";
import {
  compileReviewSnapshotR6,
  deterministicReviewR6Uuid,
  type ReviewR6DueWordFact,
  type ReviewR6PromptFact,
} from "./r6-snapshot-compiler";
import type { ReviewChallengeType, ReviewPromptReusePolicy } from "./contracts";

type Client = SupabaseClient;

type ScheduleRow = {
  id: string;
  child_id: string;
  canonical_word_id: string;
  bundle_id: string | null;
  word_schedule_version: string | null;
  word_schedule_policy_version: string | null;
  word_interval_index: number | null;
  word_next_due_on: string | null;
  membership_status: PerWordReviewScheduleFactV1["membershipStatus"];
  catch_up_stage: number;
  next_retest_due_on: string | null;
  pre_retirement_check_due_on: string | null;
  taught_on: string;
  row_status: string;
};

type CanonicalWordRow = {
  id: string;
  display_word: string;
  dialect_code: string;
  source_row_hash: string;
  row_status: string;
  review_status: string;
};

type PromptRow = {
  id: string;
  stable_prompt_key: string;
  challenge_type: ReviewChallengeType;
  content_version: string;
  prompt_text: string;
  instruction_text: string;
  configuration: Record<string, never>;
  reuse_policy: ReviewPromptReusePolicy;
  release_reference: string;
  source_fingerprint: string;
  review_status: string;
  row_status: string;
};

function fingerprint(value: string): string {
  return /^[a-f0-9]{64}$/.test(value)
    ? value
    : createHash("sha256").update(value).digest("hex");
}

function fail(error: { message?: string } | null, boundary: string): never {
  throw new Error(`${boundary}: ${error?.message ?? "unknown error"}`);
}

export type EnsureReviewAssignmentR6Result =
  | { outcome: "created" | "reused_incomplete"; assignmentId: string; reviewSessionId: string }
  | { outcome: "not_due" }
  | { outcome: "blocked"; blockerCode: string };

export async function ensureReviewAssignmentR6(input: {
  client: Client;
  parentUserId: string;
  childId: string;
  assignmentDate: string;
}): Promise<EnsureReviewAssignmentR6Result> {
  const open = await input.client.from("adle_review_sessions")
    .select("id,daily_assignment_id")
    .eq("child_id", input.childId)
    .is("completed_at", null)
    .order("created_at", { ascending: true })
    .limit(2);
  if (open.error) fail(open.error, "ensureReviewAssignmentR6:open");
  if ((open.data ?? []).length > 1) {
    return { outcome: "blocked", blockerCode: "multiple_incomplete_review_sessions" };
  }
  if (open.data?.[0]) {
    return {
      outcome: "reused_incomplete",
      assignmentId: open.data[0].daily_assignment_id as string,
      reviewSessionId: open.data[0].id as string,
    };
  }

  const rollout = await input.client.from("adle_review_r6_child_rollouts")
    .select("rollout_state")
    .eq("child_id", input.childId)
    .maybeSingle();
  if (rollout.error) fail(rollout.error, "ensureReviewAssignmentR6:rollout");
  const rolloutState = rollout.data?.rollout_state as string | undefined;
  if (!rolloutState || rolloutState === "inactive") return { outcome: "not_due" };
  if (rolloutState !== "active") {
    return { outcome: "blocked", blockerCode: `review_r6_rollout_${rolloutState}` };
  }

  const [policyResult, scheduleResult] = await Promise.all([
    input.client.from("adle_review_policy_versions")
      .select("schedule_policy_version,session_cap")
      .eq("is_active", true),
    input.client.from("adle_review_schedule_words")
      .select("id,child_id,canonical_word_id,bundle_id,word_schedule_version,word_schedule_policy_version,word_interval_index,word_next_due_on,membership_status,catch_up_stage,next_retest_due_on,pre_retirement_check_due_on,taught_on,row_status")
      .eq("child_id", input.childId)
      .eq("row_status", "active")
      .eq("word_schedule_version", PER_WORD_REVIEW_SCHEDULE_VERSION_V1),
  ]);
  if (policyResult.error) fail(policyResult.error, "ensureReviewAssignmentR6:policy");
  if (scheduleResult.error) fail(scheduleResult.error, "ensureReviewAssignmentR6:schedule");
  if ((policyResult.data ?? []).length !== 1) {
    return { outcome: "blocked", blockerCode: "active_review_policy_missing_or_ambiguous" };
  }
  const policy = policyResult.data![0] as { schedule_policy_version: string; session_cap: number };
  const scheduleRows = (scheduleResult.data ?? []) as ScheduleRow[];
  const due = selectDuePerWordReviewsV1({
    policyVersion: policy.schedule_policy_version,
    sessionCap: Math.min(10, policy.session_cap),
    today: input.assignmentDate,
    words: scheduleRows.flatMap((row): PerWordReviewScheduleFactV1[] =>
      row.word_interval_index === null || row.word_schedule_policy_version === null
        ? []
        : [{
            scheduleWordId: row.id,
            childId: row.child_id,
            canonicalWordId: row.canonical_word_id,
            sourceBundleId: row.bundle_id,
            scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
            schedulePolicyVersion: row.word_schedule_policy_version,
            intervalIndex: row.word_interval_index,
            nextDueOn: row.word_next_due_on,
            membershipStatus: row.membership_status,
            catchUpStage: row.catch_up_stage as 0 | 1 | 2,
            nextRetestDueOn: row.next_retest_due_on,
            preRetirementCheckDueOn: row.pre_retirement_check_due_on,
            taughtOn: row.taught_on,
            rowStatus: row.row_status === "active" ? "active" : "superseded",
          }],
    ),
  });
  if (due.length === 0) return { outcome: "not_due" };

  const dueScheduleIds = due.map((item) => item.scheduleWordId);
  const canonicalIds = due.map((item) => item.canonicalWordId);
  const [wordsResult, routesResult, cuesResult, promptResult, historyResult] = await Promise.all([
    input.client.from("canonical_teaching_dictionary_words")
      .select("id,display_word,dialect_code,source_row_hash,row_status,review_status")
      .in("id", canonicalIds),
    input.client.from("adle_review_schedule_word_routes")
      .select("schedule_word_id,learning_item_id,micro_skill_key,attachment_ordinal")
      .in("schedule_word_id", dueScheduleIds)
      .eq("row_status", "active"),
    input.client.from("adle_review_memory_cue_versions")
      .select("id,canonical_word_id,spelling_authority_reference_id,spelling_authority_version,tricky_grapheme_start,tricky_grapheme_end,selected_tricky_text,cue_text,source_review_encounter_id,version_number")
      .eq("child_id", input.childId)
      .in("canonical_word_id", canonicalIds)
      .eq("version_status", "active"),
    input.client.from("adle_review_prompt_versions")
      .select("id,stable_prompt_key,challenge_type,content_version,prompt_text,instruction_text,configuration,reuse_policy,release_reference,source_fingerprint,review_status,row_status")
      .eq("review_status", "approved")
      .eq("row_status", "active"),
    input.client.from("adle_review_sessions")
      .select("selected_prompt_version_id,completed_at")
      .eq("child_id", input.childId)
      .not("completed_at", "is", null)
      .not("selected_prompt_version_id", "is", null),
  ]);
  for (const [result, boundary] of [
    [wordsResult, "words"], [routesResult, "routes"], [cuesResult, "cues"],
    [promptResult, "prompts"], [historyResult, "history"],
  ] as const) if (result.error) fail(result.error, `ensureReviewAssignmentR6:${boundary}`);

  const words = (wordsResult.data ?? []) as CanonicalWordRow[];
  const wordById = new Map(words.map((word) => [word.id, word]));
  if (words.length !== canonicalIds.length || words.some((word) =>
    word.row_status !== "active" || !word.review_status.startsWith("approved_for_")
  )) return { outcome: "blocked", blockerCode: "review_r6_word_authority_incomplete" };

  const routesBySchedule = new Map<string, Array<{ schedule_word_id: string; learning_item_id: string; micro_skill_key: string; attachment_ordinal: number }>>();
  for (const route of routesResult.data ?? []) {
    const key = route.schedule_word_id as string;
    routesBySchedule.set(key, [...(routesBySchedule.get(key) ?? []), route as never]);
  }
  const cueByWord = new Map((cuesResult.data ?? []).map((cue) => [cue.canonical_word_id as string, cue]));
  const scheduleById = new Map(scheduleRows.map((row) => [row.id, row]));
  const dueWords: ReviewR6DueWordFact[] = due.map((item) => {
    const canonical = wordById.get(item.canonicalWordId)!;
    const schedule = scheduleById.get(item.scheduleWordId)!;
    const cue = cueByWord.get(item.canonicalWordId);
    const authorityVersion = canonical.source_row_hash;
    return {
      ...item,
      canonicalSpelling: canonical.display_word,
      taughtOn: schedule.taught_on,
      wordScheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
      answerAuthorityReferenceId: `canonical_teaching_dictionary_words:${canonical.id}`,
      answerAuthorityVersion: authorityVersion,
      answerAuthorityFingerprint: fingerprint(`answer:${canonical.id}:${authorityVersion}:${canonical.display_word}`),
      audioAuthorityReferenceId: `canonical_speech_text:${canonical.id}`,
      audioAuthorityVersion: authorityVersion,
      audioAuthorityFingerprint: fingerprint(`audio:${canonical.id}:${authorityVersion}:${canonical.display_word}`),
      audioKind: "speech_text",
      speechText: canonical.display_word,
      assetReference: null,
      routeProvenance: (routesBySchedule.get(item.scheduleWordId) ?? [])
        .sort((left, right) => left.attachment_ordinal - right.attachment_ordinal)
        .map((route) => ({
          routeId: `specialist:${route.micro_skill_key}`,
          microSkillKey: route.micro_skill_key,
          learningItemId: route.learning_item_id,
        })),
      availableCue: cue ? {
        cueVersionId: cue.id as string,
        canonicalAuthorityVersion: cue.spelling_authority_version as string,
        trickyStart: cue.tricky_grapheme_start as number,
        trickyEnd: cue.tricky_grapheme_end as number,
        trickyText: cue.selected_tricky_text as string,
        cueText: cue.cue_text as string,
        sourceReviewEncounterId: cue.source_review_encounter_id as string,
      } : null,
    };
  });

  const history = (historyResult.data ?? []) as Array<{
    selected_prompt_version_id: string;
    completed_at: string;
  }>;
  const historyPromptIds = [...new Set(history.map((entry) => entry.selected_prompt_version_id))];
  let historyPrompts: Array<{ id: string; stable_prompt_key: string; challenge_type: ReviewChallengeType }> = [];
  if (historyPromptIds.length > 0) {
    const result = await input.client.from("adle_review_prompt_versions")
      .select("id,stable_prompt_key,challenge_type").in("id", historyPromptIds);
    if (result.error) fail(result.error, "ensureReviewAssignmentR6:historyPrompts");
    historyPrompts = (result.data ?? []) as typeof historyPrompts;
  }
  const historyKeyById = new Map(historyPrompts.map((prompt) => [prompt.id, prompt.stable_prompt_key]));
  const historyTypeById = new Map(historyPrompts.map((prompt) => [prompt.id, prompt.challenge_type]));
  const completionsByKey = new Map<string, string[]>();
  for (const entry of history) {
    const key = historyKeyById.get(entry.selected_prompt_version_id);
    if (key) completionsByKey.set(key, [...(completionsByKey.get(key) ?? []), entry.completed_at]);
  }
  const promptFacts: ReviewR6PromptFact[] = ((promptResult.data ?? []) as PromptRow[]).map((prompt) => ({
    contractVersion: 3,
    promptVersionId: prompt.id,
    stablePromptKey: prompt.stable_prompt_key,
    challengeType: prompt.challenge_type,
    contentVersion: prompt.content_version,
    promptText: prompt.prompt_text,
    instructionText: prompt.instruction_text,
    configuration: prompt.configuration,
    reusePolicy: prompt.reuse_policy,
    authority: {
      releaseReference: prompt.release_reference,
      sourceFingerprint: prompt.source_fingerprint,
    },
    lastCompletedAt: (completionsByKey.get(prompt.stable_prompt_key) ?? []).sort().at(-1) ?? null,
  }));
  const latestReflectionKey = history
    .filter((entry) => historyTypeById.get(entry.selected_prompt_version_id) === "reflection")
    .map((entry) => ({ key: historyKeyById.get(entry.selected_prompt_version_id), at: entry.completed_at }))
    .filter((entry): entry is { key: string; at: string } => Boolean(entry.key))
    .sort((left, right) => right.at.localeCompare(left.at))[0]?.key ?? null;
  const selectedPrompts: ReviewR6PromptFact[] = [];
  for (const challengeType of ["conundrums", "stories", "fortunately_unfortunately", "persuasion"] as const) {
    const candidate = promptFacts.filter((prompt) =>
      prompt.challengeType === challengeType && !completionsByKey.has(prompt.stablePromptKey)
    ).sort((left, right) =>
      left.stablePromptKey.localeCompare(right.stablePromptKey) ||
      left.promptVersionId.localeCompare(right.promptVersionId)
    )[0];
    if (!candidate) return { outcome: "blocked", blockerCode: `review_r6_prompt_exhausted:${challengeType}` };
    selectedPrompts.push(candidate);
  }
  const reflection = selectLeastRecentlyUsedReflectionPrompt(promptFacts, latestReflectionKey);
  if (!reflection) return { outcome: "blocked", blockerCode: "review_r6_prompt_missing:reflection" };
  selectedPrompts.push(reflection);

  const identitySeed = [
    input.childId,
    input.assignmentDate,
    ...dueScheduleIds,
    ...selectedPrompts.map((prompt) => prompt.promptVersionId),
  ];
  const assignmentId = deterministicReviewR6Uuid("adle_review_r6_assignment_v1", ...identitySeed);
  const reviewItemId = deterministicReviewR6Uuid("adle_review_r6_item_v1", ...identitySeed);
  const reviewSessionId = deterministicReviewR6Uuid("adle_review_r6_session_v1", ...identitySeed);
  const compiled = compileReviewSnapshotR6({
    assignmentId,
    reviewItemId,
    childId: input.childId,
    assignmentDate: input.assignmentDate,
    dueWords,
    prompts: selectedPrompts,
  });
  if (!compiled.ok) return { outcome: "blocked", blockerCode: compiled.blockerCode };
  const persistence = await input.client.rpc("persist_adle_review_assignment_r6", {
    p_parent_user_id: input.parentUserId,
    p_child_id: input.childId,
    p_plan_date: input.assignmentDate,
    p_assignment_id: assignmentId,
    p_review_item_id: reviewItemId,
    p_review_session_id: reviewSessionId,
    p_snapshot: compiled.snapshot,
  });
  if (persistence.error) fail(persistence.error, "ensureReviewAssignmentR6:persist");
  const value = persistence.data as {
    outcome?: "created" | "reused_incomplete";
    assignmentId?: string;
    reviewSessionId?: string;
  } | null;
  if (!value?.outcome || !value.assignmentId || !value.reviewSessionId) {
    return { outcome: "blocked", blockerCode: "review_r6_persistence_contract_invalid" };
  }
  return {
    outcome: value.outcome,
    assignmentId: value.assignmentId,
    reviewSessionId: value.reviewSessionId,
  };
}
