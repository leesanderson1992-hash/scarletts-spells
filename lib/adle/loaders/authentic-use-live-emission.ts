/**
 * ADLE Slice 6: live authentic-use emission from Review Work approval — the
 * hook Slice 4 open-question-3 deferred here. Runs inside
 * approveSubmissionReviewImpl AFTER the approved status write; the caller
 * wraps it so a failure can never block or fail the approval (the guarded
 * batch bridge remains the recovery path and is mutually idempotent with
 * this emission via the (child, word, piece, kind) uniqueness guard and the
 * shared `ws:{sample_id}` piece-ref convention).
 *
 * Semantics are exactly the Slice 4 bridge's: candidates are the approved
 * submission's linked writing samples' tokens minus flagged misspellings;
 * matching is normalised-word only via authenticUseBridge; no match ->
 * structured log line, never an event, never a guess. Unverified suggestions
 * never create evidence — approval (all spelling issues resolved,
 * classification finalised) is the parent gate that makes these pieces
 * verified truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { authenticUseBridge, extractAuthenticUseCandidates } from "../authentic-use";
import { persistAuthenticUseEvents } from "./session-completion-loader";

type Client = SupabaseClient;

export interface EmitAuthenticUseParams {
  /** Cookie-auth client (parent-scoped writing-engine reads). */
  userClient: Client;
  /** Service-role client (ADLE tables + canonical dictionary). */
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  submissionId: string;
}

export interface EmitAuthenticUseResult {
  insertedEvents: number;
  matchedEvents: number;
  unmatchedWords: number;
}

export async function emitAdleAuthenticUseFromApprovedSubmission(
  params: EmitAuthenticUseParams,
): Promise<EmitAuthenticUseResult> {
  const { userClient, serviceClient, parentUserId, childId, submissionId } = params;

  const { data: samples, error: samplesError } = await userClient
    .from("writing_samples")
    .select("id, child_id, sample_text, written_at, created_at")
    .eq("task_submission_id", submissionId)
    .eq("parent_user_id", parentUserId);
  if (samplesError) {
    throw new Error(`emitAdleAuthenticUse:samples: ${samplesError.message}`);
  }
  const sampleRows = (samples ?? []) as {
    id: string;
    child_id: string;
    sample_text: string | null;
    written_at: string | null;
    created_at: string;
  }[];
  if (sampleRows.length === 0) {
    return { insertedEvents: 0, matchedEvents: 0, unmatchedWords: 0 };
  }

  const sampleIds = sampleRows.map((sample) => sample.id);
  const { data: flaggedRows, error: flaggedError } = await userClient
    .from("misspelling_instances")
    .select("writing_sample_id, misspelled_word")
    .in("writing_sample_id", sampleIds)
    .eq("is_false_positive", false);
  if (flaggedError) {
    throw new Error(`emitAdleAuthenticUse:flagged: ${flaggedError.message}`);
  }
  const flaggedBySample = new Map<string, string[]>();
  for (const row of (flaggedRows ?? []) as { writing_sample_id: string; misspelled_word: string | null }[]) {
    const list = flaggedBySample.get(row.writing_sample_id) ?? [];
    list.push(row.misspelled_word ?? "");
    flaggedBySample.set(row.writing_sample_id, list);
  }

  const candidates = sampleRows.flatMap((sample) =>
    extractAuthenticUseCandidates({
      childId: sample.child_id || childId,
      writingSampleId: sample.id,
      sampleText: sample.sample_text ?? "",
      occurredOn: (sample.written_at ?? sample.created_at).slice(0, 10),
      flaggedMisspellings: flaggedBySample.get(sample.id) ?? [],
    }),
  );
  if (candidates.length === 0) {
    return { insertedEvents: 0, matchedEvents: 0, unmatchedWords: 0 };
  }

  const { data: dictionaryRows, error: dictionaryError } = await serviceClient
    .from("canonical_teaching_dictionary_words")
    .select("id, normalised_word")
    .eq("row_status", "active");
  if (dictionaryError) {
    throw new Error(`emitAdleAuthenticUse:dictionary: ${dictionaryError.message}`);
  }
  const activeWordIdByNormalisedWord = new Map(
    ((dictionaryRows ?? []) as { id: string; normalised_word: string }[]).map((row) => [
      row.normalised_word,
      row.id,
    ]),
  );

  const verifiedAtIso = new Date().toISOString();
  const bridged = authenticUseBridge(candidates, activeWordIdByNormalisedWord, verifiedAtIso);

  // Fail closed on no match: one structured log line per unmatched word,
  // never an event, never a guess (the batch bridge re-derives the full
  // report from the same truth at any time).
  for (const unmatched of bridged.unmatched) {
    console.info(
      `[adle-authentic-use] no canonical match (submission ${submissionId}, piece ${unmatched.pieceRef}): "${unmatched.observedWord}" — reported, not credited`,
    );
  }

  const insertedEvents = await persistAuthenticUseEvents(serviceClient, bridged.events, verifiedAtIso);
  return {
    insertedEvents,
    matchedEvents: bridged.events.length,
    unmatchedWords: bridged.unmatched.length,
  };
}
