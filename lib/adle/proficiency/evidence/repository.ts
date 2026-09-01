import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables intentionally lead generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CanonicalWordSkillRelationshipReadResult } from "../../word-skill-relationships/contracts";
import {
  adaptAssignmentAttempt,
  adaptAuthenticUse,
  adaptLearningItemEvidence,
  adaptLegacyReviewOutcome,
  adaptPracticeAttempt,
  adaptReviewOutcomeRepresentation,
  adaptReviewRepairRepresentation,
  adaptSlippage,
  adaptTaughtHistory,
  adaptUnsupportedBoundarySource,
  adaptVerifiedSpellingOccurrence,
  adaptWritingIssueCorrection,
  causalSkillsForAttempt,
  classifyAssignmentAttempt,
  resolveCanonicalWordByText,
  type CanonicalWordLookup,
  type GovernedCausalMapping,
  type LinkedAttemptTruth,
} from "./adapters";
import { readLearnerEvidenceProjection } from "./classifier";
import type { LearnerEvidenceProjectionResult, RawLearnerEvidenceCandidate } from "./contracts";

const PAGE_SIZE = 500;

async function readAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  configure: (query: any) => any = (query) => query,
  key = "id",
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = configure(client.from(table).select(columns)).order(key, { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt(key, after);
    const { data, error } = await query;
    if (error) throw new Error(`learner-evidence read ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    const last = page[page.length - 1] as Record<string, unknown>;
    if (typeof last[key] !== "string" || !last[key]) {
      throw new Error(`learner-evidence read ${table}: paging identity missing`);
    }
    after = last[key] as string;
  }
}

function readString(record: unknown, key: string): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isoDateOrTimestamp(value: string | null | undefined): string {
  return value ?? "";
}

export async function loadLearnerEvidenceProjection(params: {
  client: SupabaseClient;
  relationshipAuthority: CanonicalWordSkillRelationshipReadResult;
}): Promise<LearnerEvidenceProjectionResult> {
  const client = params.client;
  const [
    wordRows,
    skillRows,
    resolverRows,
    assignmentRows,
    reviewEncounterRows,
    reviewOutcomeRows,
    repairRows,
    authenticRows,
    slippageRows,
    taughtRows,
    practiceRows,
    learningEvidenceRows,
    taskSubmissionRows,
    writingSampleRows,
    candidateMappingRows,
    verificationRows,
    reviewSessionRows,
    reviewIssueLinkRows,
    correctionAttemptRows,
    writingIssueRows,
    treasureRows,
    treasureCandidateRows,
  ] = await Promise.all([
    readAll<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,row_status"),
    readAll<any>(client, "micro_skill_catalog", "micro_skill_key,is_active", undefined, "micro_skill_key"),
    readAll<any>(client, "spelling_canonical_mappings", "id,correct_spelling_normalized,misspelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,normalization_version"),
    readAll<any>(client, "adle_assignment_attempt_events", "id,child_id,canonical_word_id,created_at,attempt_text,is_correct,attempt_kind,evidence_class,section_key,template_key,source_ref"),
    readAll<any>(client, "adle_review_word_encounters", "id,original_attempt_event_id,original_outcome,original_outcome_source,review_outcome_event_id"),
    readAll<any>(client, "adle_review_outcome_events", "id,child_id,canonical_word_id,event_type,occurred_on,created_at,review_encounter_id,original_result,result_source,original_attempted_at,attempt_text,source_provenance"),
    readAll<any>(client, "adle_review_repair_attempts", "id,review_encounter_id,assignment_attempt_event_id"),
    readAll<any>(client, "adle_authentic_use_events", "id,child_id,canonical_word_id,occurred_on,verified_at,use_kind,parent_verified,piece_ref,source_ref,row_status,provenance_kind,review_encounter_id"),
    readAll<any>(client, "adle_slippage_events", "id,child_id,canonical_word_id,occurred_on,context_kind,self_corrected,attempt_text,source_ref,row_status"),
    readAll<any>(client, "adle_taught_word_history", "id,child_id,canonical_word_id,occurred_on,source_ref,row_status"),
    readAll<any>(client, "practice_attempts", "id,child_id,target_word,submitted_word,is_correct,attempt_mode,attempted_at"),
    readAll<any>(client, "learning_item_evidence", "id,child_id,writing_issue_id,task_submission_id,evidence_type,source_context,metadata,created_at"),
    readAll<any>(client, "task_submissions", "id,child_id,submitted_at,parent_review_status"),
    readAll<any>(client, "writing_samples", "id,child_id,task_submission_id,written_at,created_at,review_completed_at"),
    readAll<any>(client, "parent_verified_spelling_candidate_mappings", "id,child_id,parent_verification_id,task_submission_id,writing_sample_id,source_adle_review_session_id,source_provenance,reviewed_event_source_entity_id,correct_spelling_normalized,micro_skill_key,candidate_status,created_at,authority_version,metadata"),
    readAll<any>(client, "parent_verifications", "id,decision,verified_at,source_entity_id"),
    readAll<any>(client, "adle_review_sessions", "id,writing_submitted_at"),
    readAll<any>(client, "adle_review_parent_issue_links", "id,candidate_mapping_id,related_review_encounter_id"),
    readAll<any>(client, "writing_issue_correction_attempts", "id,writing_issue_id,child_id,task_submission_id,attempted_correction,created_at"),
    readAll<any>(client, "writing_issues", "id,child_id,approved_replacement,suggested_replacement,task_submission_id,micro_skill_key"),
    readAll<any>(client, "child_word_treasures", "id,corrected_word"),
    readAll<any>(client, "child_word_treasure_evidence_candidates", "id,treasure_id,child_id,task_submission_id,confirmation_status,created_at,metadata"),
  ]);

  const activeWords = wordRows.filter((row) => row.row_status === "active");
  const byNormalisedWord = new Map<string, string[]>();
  for (const row of activeWords) {
    byNormalisedWord.set(row.normalised_word, [...(byNormalisedWord.get(row.normalised_word) ?? []), row.id]);
  }
  const wordLookup: CanonicalWordLookup = {
    byId: new Set(activeWords.map((row) => row.id)),
    byNormalisedWord,
  };
  const activeSkills = new Set(skillRows.filter((row) => row.is_active === true).map((row) => row.micro_skill_key));
  const causalMappings: GovernedCausalMapping[] = [];
  for (const row of resolverRows) {
    if (row.mapping_status !== "active" || row.resolver_visibility_status !== "visible" || !activeSkills.has(row.micro_skill_key)) continue;
    const resolved = resolveCanonicalWordByText(wordLookup, row.correct_spelling_normalized);
    if (!resolved.canonicalWordId) continue;
    causalMappings.push({
      mappingId: row.id,
      canonicalWordId: resolved.canonicalWordId,
      misspellingNormalised: row.misspelling_normalized,
      microSkillKey: row.micro_skill_key,
      authorityVersion: row.normalization_version,
    });
  }

  const candidates: RawLearnerEvidenceCandidate[] = [];
  const assignmentById = new Map<string, LinkedAttemptTruth>();
  for (const row of assignmentRows) {
    const adapted = adaptAssignmentAttempt({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      createdAt: row.created_at,
      attemptText: row.attempt_text,
      isCorrect: row.is_correct,
      attemptKind: row.attempt_kind,
      evidenceClass: row.evidence_class,
      sectionKey: row.section_key,
      templateKey: row.template_key,
      sourceRef: row.source_ref,
    }, causalMappings);
    candidates.push(adapted);
    if (!row.canonical_word_id) continue;
    const classification = classifyAssignmentAttempt({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      createdAt: row.created_at,
      attemptText: row.attempt_text,
      isCorrect: row.is_correct,
      attemptKind: row.attempt_kind,
      evidenceClass: row.evidence_class,
      sectionKey: row.section_key,
      templateKey: row.template_key,
      sourceRef: row.source_ref,
    });
    assignmentById.set(row.id, {
      attemptEventId: row.id,
      learnerId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      occurredAt: row.created_at,
      outcome: row.is_correct === true ? "correct" : row.is_correct === false ? "incorrect" : "unknown",
      environment: classification.environment,
      independence: classification.independence,
      causalMicroSkillKeys: row.is_correct === false
        ? causalSkillsForAttempt({ canonicalWordId: row.canonical_word_id, attemptText: row.attempt_text, mappings: causalMappings })
        : [],
    });
  }
  const encounterById = new Map(reviewEncounterRows.map((row) => [row.id as string, row]));
  for (const row of reviewOutcomeRows) {
    const encounter = row.review_encounter_id ? encounterById.get(row.review_encounter_id) : null;
    const attemptId = encounter?.original_attempt_event_id
      ?? readString(row.source_provenance, "originalAttemptEventId");
    if (attemptId) {
      candidates.push(adaptReviewOutcomeRepresentation({ id: row.id, linkedAttempt: assignmentById.get(attemptId) ?? null }));
    } else {
      candidates.push(adaptLegacyReviewOutcome({
        id: row.id,
        childId: row.child_id,
        canonicalWordId: row.canonical_word_id,
        occurredAt: isoDateOrTimestamp(row.original_attempted_at ?? row.occurred_on ?? row.created_at),
        eventType: row.event_type,
        attemptText: row.attempt_text,
      }, causalMappings));
    }
  }
  for (const row of repairRows) {
    candidates.push(adaptReviewRepairRepresentation({
      id: row.id,
      linkedAttempt: assignmentById.get(row.assignment_attempt_event_id) ?? null,
    }));
  }
  for (const row of authenticRows) {
    const encounter = row.review_encounter_id ? encounterById.get(row.review_encounter_id) : null;
    const linked = encounter?.original_attempt_event_id
      ? assignmentById.get(encounter.original_attempt_event_id) ?? null : null;
    candidates.push(adaptAuthenticUse({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      occurredOn: row.occurred_on,
      verifiedAt: row.verified_at,
      useKind: row.use_kind,
      parentVerified: row.parent_verified,
      pieceRef: row.piece_ref,
      sourceRef: row.source_ref,
      rowStatus: row.row_status,
      provenanceKind: row.provenance_kind,
      reviewEncounterId: row.review_encounter_id,
      linkedReviewAttempt: linked,
    }));
  }
  for (const row of slippageRows) candidates.push(adaptSlippage({
    id: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    occurredOn: row.occurred_on,
    contextKind: row.context_kind,
    selfCorrected: row.self_corrected,
    attemptText: row.attempt_text,
    sourceRef: row.source_ref,
    rowStatus: row.row_status,
  }, causalMappings));
  for (const row of taughtRows) candidates.push(adaptTaughtHistory({
    id: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    occurredOn: row.occurred_on,
    sourceRef: row.source_ref,
    rowStatus: row.row_status,
  }));
  for (const row of practiceRows) {
    const resolved = resolveCanonicalWordByText(wordLookup, row.target_word);
    candidates.push(adaptPracticeAttempt({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: resolved.canonicalWordId,
      canonicalWordResolution: resolved.resolution,
      attemptedAt: row.attempted_at,
      submittedWord: row.submitted_word,
      isCorrect: row.is_correct,
      attemptMode: row.attempt_mode,
    }, causalMappings));
  }

  const submissionById = new Map(taskSubmissionRows.map((row) => [row.id as string, row]));
  const writingSampleBySubmission = new Map<string, any>();
  for (const row of writingSampleRows) {
    if (row.task_submission_id) writingSampleBySubmission.set(row.task_submission_id, row);
  }
  const issueById = new Map(writingIssueRows.map((row) => [row.id as string, row]));
  const correctionByIssueAndTime = new Map(correctionAttemptRows.map((row) => [
    `${row.writing_issue_id}\u0000${row.created_at}`,
    row,
  ]));
  for (const row of learningEvidenceRows) {
    const issue = row.writing_issue_id ? issueById.get(row.writing_issue_id) : null;
    const wordText = readString(row.metadata, "matched_word")
      ?? readString(row.metadata, "target_word")
      ?? readString(row.metadata, "approved_replacement")
      ?? issue?.approved_replacement
      ?? issue?.suggested_replacement;
    const resolved = resolveCanonicalWordByText(wordLookup, wordText);
    const performanceSubmissionId = row.source_context === "finalised_issue_outcome" && issue?.task_submission_id
      ? issue.task_submission_id
      : row.task_submission_id;
    const submission = performanceSubmissionId ? submissionById.get(performanceSubmissionId) : null;
    const sample = performanceSubmissionId ? writingSampleBySubmission.get(performanceSubmissionId) : null;
    const authenticPieceKey = sample && resolved.canonicalWordId
      ? `authentic-writing-piece:${row.child_id}:${resolved.canonicalWordId}:ws:${sample.id}` : null;
    const correction = row.writing_issue_id && row.source_context === "child_correction_attempt"
      ? correctionByIssueAndTime.get(`${row.writing_issue_id}\u0000${row.created_at}`) ?? null
      : null;
    const issuePerformanceKey = row.writing_issue_id && row.source_context === "finalised_issue_outcome"
      ? `writing-issue:${row.writing_issue_id}` : null;
    candidates.push(adaptLearningItemEvidence({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: resolved.canonicalWordId,
      canonicalWordResolution: resolved.resolution,
      occurredAt: row.source_context === "authentic_submission_confirmation" || row.source_context === "finalised_issue_outcome"
        ? isoDateOrTimestamp(submission?.submitted_at ?? sample?.written_at ?? row.created_at)
        : row.created_at,
      evidenceType: row.evidence_type,
      sourceContext: row.source_context,
      microSkillKey: readString(row.metadata, "verified_micro_skill_key") ?? readString(row.metadata, "micro_skill_key"),
      sourceEntityId: readString(row.metadata, "source_entity_id") ?? readString(row.metadata, "confirmed_suggestion_id"),
      taskSubmissionId: performanceSubmissionId,
      exactPerformanceLineageKey: row.source_context === "authentic_submission_confirmation"
        ? authenticPieceKey
        : issuePerformanceKey ?? (correction ? `writing_issue_correction_attempt:${correction.id}` : null),
      possibleDuplicateLineageKey: !authenticPieceKey && !issuePerformanceKey && !correction
        && performanceSubmissionId && resolved.canonicalWordId
        ? `submission-word:${performanceSubmissionId}:${resolved.canonicalWordId}` : null,
      outcomeOverride: correction?.attempted_correction && wordText
        ? correction.attempted_correction.trim().toLocaleLowerCase("en-GB") === wordText.trim().toLocaleLowerCase("en-GB")
          ? "correct" : "incorrect"
        : null,
    }));
  }

  const verificationById = new Map(verificationRows.map((row) => [row.id as string, row]));
  const sessionById = new Map(reviewSessionRows.map((row) => [row.id as string, row]));
  const issueLinkByCandidate = new Map(reviewIssueLinkRows.filter((row) => row.candidate_mapping_id).map((row) => [row.candidate_mapping_id as string, row]));
  for (const row of candidateMappingRows) {
    const resolved = resolveCanonicalWordByText(wordLookup, row.correct_spelling_normalized);
    const verification = verificationById.get(row.parent_verification_id);
    const originalWritingIssueId = readString(row.metadata, "original_writing_issue_id")
      ?? readString(row.metadata, "writing_issue_id");
    const originalIssue = originalWritingIssueId ? issueById.get(originalWritingIssueId) : null;
    const originalSubmissionId = originalIssue?.task_submission_id
      ?? readString(row.metadata, "original_task_submission_id")
      ?? row.task_submission_id;
    const submission = originalSubmissionId ? submissionById.get(originalSubmissionId) : null;
    const session = row.source_adle_review_session_id ? sessionById.get(row.source_adle_review_session_id) : null;
    const issueLink = issueLinkByCandidate.get(row.id) ?? null;
    const inactive = ["rejected", "superseded"].includes(row.candidate_status);
    const rejected = row.candidate_status === "rejected" || ["false_positive", "not_a_learning_issue"].includes(verification?.decision ?? "");
    candidates.push(adaptVerifiedSpellingOccurrence({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: resolved.canonicalWordId,
      canonicalWordResolution: resolved.resolution,
      occurredAt: isoDateOrTimestamp(submission?.submitted_at ?? session?.writing_submitted_at ?? row.created_at),
      microSkillKey: row.micro_skill_key,
      verificationId: row.parent_verification_id,
      verifiedAt: verification?.verified_at ?? row.created_at,
      sourceOccurrenceId: originalWritingIssueId
        ? `writing-issue:${originalWritingIssueId}`
        : issueLink?.id ?? row.reviewed_event_source_entity_id,
      sourceKind: row.source_provenance === "adle_review_submitted_writing_parent_identified" ? "review_writing" : "task_submission",
      relatedReviewEncounterId: issueLink?.related_review_encounter_id ?? null,
      sourceState: rejected ? "rejected" : inactive ? "inactive" : "active",
    }));
  }

  for (const row of correctionAttemptRows) {
    const issue = issueById.get(row.writing_issue_id);
    const resolved = resolveCanonicalWordByText(wordLookup, issue?.approved_replacement ?? issue?.suggested_replacement);
    candidates.push(adaptWritingIssueCorrection({
      id: row.id,
      childId: row.child_id,
      canonicalWordId: resolved.canonicalWordId,
      canonicalWordResolution: resolved.resolution,
      occurredAt: row.created_at,
      attemptedCorrection: row.attempted_correction,
      canonicalSpelling: issue?.approved_replacement ?? issue?.suggested_replacement ?? null,
    }));
  }
  const treasureById = new Map(treasureRows.map((row) => [row.id as string, row]));
  for (const row of treasureCandidateRows) {
    const treasure = treasureById.get(row.treasure_id);
    const resolved = resolveCanonicalWordByText(wordLookup, treasure?.corrected_word);
    candidates.push(adaptUnsupportedBoundarySource({
      sourceKind: "word_treasure_evidence_candidate",
      id: row.id,
      childId: row.child_id,
      canonicalWordId: resolved.canonicalWordId,
      canonicalWordResolution: resolved.resolution,
      occurredAt: submissionById.get(row.task_submission_id)?.submitted_at ?? row.created_at,
      performanceLineageKey: `word_treasure_candidate:${row.id}`,
      reason: "Word Treasure candidate/reward state is downstream verification metadata, not Phase C evidence authority",
    }));
  }

  const blockedRelationshipCanonicalWordIds = new Set(params.relationshipAuthority.decisions
    .filter((decision) => decision.disposition === "BLOCKED" && decision.canonicalWordId && wordLookup.byId.has(decision.canonicalWordId))
    .map((decision) => decision.canonicalWordId!));
  return readLearnerEvidenceProjection({
    candidates,
    relationshipAuthority: params.relationshipAuthority,
    adapterAuthorityEstablished: true,
    blockedRelationshipCanonicalWordIds,
  });
}
