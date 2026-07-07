import {
  extractSpellcheckFieldsFromDraftPayload,
  stripNonSpellingSections,
  type SpellcheckSourceField,
} from "@/lib/courses/spelling-analysis-text";
import type { createClient } from "@/lib/supabase/server";

import {
  type ChildWordTreasureRow,
  normaliseWordTreasureWord,
} from "./word-treasures";
import { loadAdleCountedSampleKeys } from "./adle-reward-bridge";
import { authenticUseDedupKey } from "./adle-reward-bridge-core";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const LEGACY_FREE_WRITING_FIELD_KEY = "legacy_submission_text";
export const FREE_WRITING_EVIDENCE_SOURCE_TYPE = "free_writing_task_field";

export type FreeWritingEvidenceDuplicateStatus =
  | "unique_candidate"
  | "confirmed_duplicate"
  | "candidate_duplicate";

export type FreeWritingEvidenceConfirmationStatus =
  | "pending_parent_confirmation"
  | "confirmed"
  | "dismissed"
  | "duplicate";

export type FreeWritingEvidenceCandidateRow = {
  id: string;
  treasure_id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string;
  task_id: string;
  task_type: "lesson" | "test";
  source_field_key: string;
  writing_sample_id: string | null;
  matched_word: string;
  matched_word_normalized: string;
  occurrence_count: number;
  duplicate_status: FreeWritingEvidenceDuplicateStatus;
  confirmation_status: FreeWritingEvidenceConfirmationStatus;
  would_award_golden_bar: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_event_id: string | null;
  confirmed_awarded_golden_bar: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FreeWritingEvidenceReviewCandidate = FreeWritingEvidenceCandidateRow & {
  canConfirm: boolean;
};

const CANDIDATE_SELECT = [
  "id",
  "treasure_id",
  "child_id",
  "parent_user_id",
  "task_submission_id",
  "task_id",
  "task_type",
  "source_field_key",
  "writing_sample_id",
  "matched_word",
  "matched_word_normalized",
  "occurrence_count",
  "duplicate_status",
  "confirmation_status",
  "would_award_golden_bar",
  "confirmed_at",
  "confirmed_by",
  "confirmed_event_id",
  "confirmed_awarded_golden_bar",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function isMissingEvidenceCandidateTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";

  return (
    code === "PGRST205" &&
    message.includes("child_word_treasure_evidence_candidates")
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOccurrenceCount(text: string, word: string) {
  const normalizedWord = normaliseWordTreasureWord(word);
  if (!normalizedWord) {
    return 0;
  }

  const pattern =
    normalizedWord.includes(" ")
      ? new RegExp(`(^|[^\\p{L}])${escapeRegExp(normalizedWord)}(?=$|[^\\p{L}])`, "giu")
      : new RegExp(`(^|[^\\p{L}])${escapeRegExp(normalizedWord)}(?=$|[^\\p{L}])`, "giu");

  return Array.from(text.matchAll(pattern)).length;
}

function getFreeWritingFields(input: {
  draftPayload?: unknown;
  submissionText?: string;
}) {
  const fields = extractSpellcheckFieldsFromDraftPayload(input.draftPayload);

  if (fields.length > 0) {
    return fields;
  }

  const fallbackText = stripNonSpellingSections(input.submissionText ?? "");
  if (!fallbackText) {
    return [] as SpellcheckSourceField[];
  }

  return [
    {
      key: LEGACY_FREE_WRITING_FIELD_KEY,
      text: fallbackText,
      label: "Written response",
      type: "textarea",
    },
  ];
}

export function getFreeWritingEvidenceSourceEntityId(input: {
  taskId: string;
  sourceFieldKey: string;
}) {
  return `${input.taskId}:${input.sourceFieldKey}`;
}

async function getConfirmedEvidenceFieldKeys(input: {
  supabase: SupabaseServerClient;
  treasureIds: string[];
}) {
  if (input.treasureIds.length === 0) {
    return new Set<string>();
  }

  const { data } = await input.supabase
    .from("child_word_treasure_events")
    .select("treasure_id, source_entity_id")
    .in("treasure_id", input.treasureIds)
    .eq("event_type", "authentic_correct_use_recorded")
    .eq("source_type", FREE_WRITING_EVIDENCE_SOURCE_TYPE);

  return new Set(
    ((data ?? []) as Array<{ treasure_id: string; source_entity_id: string | null }>)
      .filter((row) => typeof row.source_entity_id === "string")
      .map((row) => `${row.treasure_id}:${row.source_entity_id}`),
  );
}

export async function detectAndStoreFreeWritingEvidenceCandidates(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
  taskId: string;
  taskType: "lesson" | "test";
  draftPayload?: unknown;
  submissionText?: string;
  writingSampleId?: string | null;
}) {
  const fields = getFreeWritingFields({
    draftPayload: input.draftPayload,
    submissionText: input.submissionText,
  });

  if (fields.length === 0) {
    return [] as FreeWritingEvidenceCandidateRow[];
  }

  const { data: treasureRows } = await input.supabase
    .from("child_word_treasures")
    .select(
      "id, child_id, parent_user_id, corrected_word, corrected_word_normalized, status, authentic_correct_uses_after_forge, required_uses_for_bar",
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("status", "in_forge");

  const treasures = (treasureRows ?? []) as Pick<
    ChildWordTreasureRow,
    | "id"
    | "child_id"
    | "parent_user_id"
    | "corrected_word"
    | "corrected_word_normalized"
    | "status"
    | "authentic_correct_uses_after_forge"
    | "required_uses_for_bar"
  >[];

  if (treasures.length === 0) {
    return [] as FreeWritingEvidenceCandidateRow[];
  }

  const confirmedKeys = await getConfirmedEvidenceFieldKeys({
    supabase: input.supabase,
    treasureIds: treasures.map((treasure) => treasure.id),
  });
  const rows: Array<Record<string, unknown>> = [];
  const seenCandidateKeys = new Set<string>();

  for (const field of fields) {
    for (const treasure of treasures) {
      const occurrenceCount = getOccurrenceCount(field.text, treasure.corrected_word);
      if (occurrenceCount <= 0) {
        continue;
      }

      const sourceEntityId = getFreeWritingEvidenceSourceEntityId({
        taskId: input.taskId,
        sourceFieldKey: field.key,
      });
      const confirmedKey = `${treasure.id}:${sourceEntityId}`;
      const candidateKey = `${treasure.id}:${field.key}`;
      const duplicateStatus: FreeWritingEvidenceDuplicateStatus = confirmedKeys.has(
        confirmedKey,
      )
        ? "confirmed_duplicate"
        : seenCandidateKeys.has(candidateKey)
          ? "candidate_duplicate"
          : "unique_candidate";

      seenCandidateKeys.add(candidateKey);
      rows.push({
        treasure_id: treasure.id,
        child_id: input.childId,
        parent_user_id: input.parentUserId,
        task_submission_id: input.taskSubmissionId,
        task_id: input.taskId,
        task_type: input.taskType,
        source_field_key: field.key,
        writing_sample_id: input.writingSampleId ?? null,
        matched_word: treasure.corrected_word,
        matched_word_normalized: treasure.corrected_word_normalized,
        occurrence_count: occurrenceCount,
        duplicate_status: duplicateStatus,
        confirmation_status:
          duplicateStatus === "unique_candidate"
            ? "pending_parent_confirmation"
            : "duplicate",
        would_award_golden_bar:
          duplicateStatus === "unique_candidate" &&
          treasure.authentic_correct_uses_after_forge + 1 >=
            treasure.required_uses_for_bar,
        metadata: {
          source: "free_writing_evidence_detection",
          source_field_label: field.label,
          source_field_type: field.type,
          source_entity_id: sourceEntityId,
        },
      });
    }
  }

  if (rows.length === 0) {
    return [] as FreeWritingEvidenceCandidateRow[];
  }

  const { data, error } = await input.supabase
    .from("child_word_treasure_evidence_candidates")
    .upsert(rows, {
      onConflict: "treasure_id,task_submission_id,source_field_key",
    })
    .select(CANDIDATE_SELECT);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown) as FreeWritingEvidenceCandidateRow[];
}

export async function getFreeWritingEvidenceCandidatesForReview(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
}) {
  const { data, error } = await input.supabase
    .from("child_word_treasure_evidence_candidates")
    .select(CANDIDATE_SELECT)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("task_submission_id", input.taskSubmissionId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingEvidenceCandidateTableError(error)) {
      console.warn(
        "Free-writing evidence candidate table is missing; Review Work will continue without candidate confirmations.",
      );
      return [] as FreeWritingEvidenceReviewCandidate[];
    }

    throw error;
  }

  return (((data ?? []) as unknown) as FreeWritingEvidenceCandidateRow[]).map(
    (candidate) => ({
      ...candidate,
      canConfirm:
        candidate.confirmation_status === "pending_parent_confirmation" &&
        candidate.duplicate_status === "unique_candidate",
    }),
  );
}

export async function countConfirmedFreeWritingGoldBarsForSubmission(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
}) {
  const { count } = await input.supabase
    .from("child_word_treasure_evidence_candidates")
    .select("*", { count: "exact", head: true })
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("task_submission_id", input.taskSubmissionId)
    .eq("confirmation_status", "confirmed")
    .eq("confirmed_awarded_golden_bar", true);

  return count ?? 0;
}

type ConfirmationSummary = {
  confirmedCount: number;
  duplicateCount: number;
  goldenBarsAwardedCount: number;
};

const CONFIRMATION_TREASURE_SELECT = [
  "id",
  "child_id",
  "parent_user_id",
  "status",
  "authentic_correct_uses_after_forge",
  "required_uses_for_bar",
  "metadata",
].join(", ");

async function insertTreasureEventIfMissing(input: {
  supabase: SupabaseServerClient;
  treasureId: string;
  childId: string;
  parentUserId: string;
  eventType: "authentic_correct_use_recorded" | "golden_bar_awarded";
  sourceType: string;
  sourceEntityId: string;
  previousStatus: string | null;
  newStatus: string | null;
  authenticUseIncrement: number;
  metadata: Record<string, unknown>;
}) {
  const { data: existingEvent, error: existingError } = await input.supabase
    .from("child_word_treasure_events")
    .select("id")
    .eq("treasure_id", input.treasureId)
    .eq("event_type", input.eventType)
    .eq("source_type", input.sourceType)
    .eq("source_entity_id", input.sourceEntityId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingEvent?.id) {
    return { inserted: false, eventId: existingEvent.id as string };
  }

  const { data, error } = await input.supabase
    .from("child_word_treasure_events")
    .insert({
      treasure_id: input.treasureId,
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      event_type: input.eventType,
      source_type: input.sourceType,
      source_entity_id: input.sourceEntityId,
      previous_status: input.previousStatus,
      new_status: input.newStatus,
      authentic_use_increment: input.authenticUseIncrement,
      metadata: input.metadata,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return { inserted: true, eventId: data.id as string };
}

export async function confirmFreeWritingEvidenceCandidates(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  candidateIds: string[];
  confirmedByUserId: string;
}) {
  const candidateIds = Array.from(new Set(input.candidateIds)).filter(Boolean);
  const summary: ConfirmationSummary = {
    confirmedCount: 0,
    duplicateCount: 0,
    goldenBarsAwardedCount: 0,
  };

  if (candidateIds.length === 0) {
    return summary;
  }

  const { data: candidateRows, error: candidateError } = await input.supabase
    .from("child_word_treasure_evidence_candidates")
    .select(CANDIDATE_SELECT)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", candidateIds);

  if (candidateError) {
    throw candidateError;
  }

  const candidates = ((candidateRows ?? []) as unknown) as FreeWritingEvidenceCandidateRow[];
  const nowIso = new Date().toISOString();

  // ADLE Slice 7a (7a-C): cross-path dedup. The ADLE reward bridge may already
  // have credited a Golden-Bar use for a (word, writing sample); count it once
  // across both paths by skipping any candidate ADLE already recorded. Keyed on
  // the writing sample, so free-writing's own dedup is untouched.
  const adleCountedKeys = await loadAdleCountedSampleKeys(
    input.supabase,
    Array.from(new Set(candidates.map((candidate) => candidate.treasure_id).filter(Boolean))),
  );

  for (const candidate of candidates) {
    if (candidate.confirmation_status === "confirmed") {
      summary.confirmedCount += 1;
      if (candidate.confirmed_awarded_golden_bar) {
        summary.goldenBarsAwardedCount += 1;
      }
      continue;
    }

    if (
      candidate.confirmation_status !== "pending_parent_confirmation" ||
      candidate.duplicate_status !== "unique_candidate"
    ) {
      await input.supabase
        .from("child_word_treasure_evidence_candidates")
        .update({
          confirmation_status: "duplicate",
        })
        .eq("id", candidate.id)
        .eq("parent_user_id", input.parentUserId);
      summary.duplicateCount += 1;
      continue;
    }

    const { data: treasureRow, error: treasureError } = await input.supabase
      .from("child_word_treasures")
      .select(CONFIRMATION_TREASURE_SELECT)
      .eq("id", candidate.treasure_id)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .maybeSingle();

    if (treasureError) {
      throw treasureError;
    }

    const treasure = treasureRow as
      | {
          id: string;
          child_id: string;
          parent_user_id: string;
          status: "golden_nugget" | "in_forge" | "golden_bar";
          authentic_correct_uses_after_forge: number;
          required_uses_for_bar: number;
          metadata: Record<string, unknown> | null;
        }
      | null;

    if (!treasure || treasure.status !== "in_forge") {
      await input.supabase
        .from("child_word_treasure_evidence_candidates")
        .update({
          confirmation_status: "duplicate",
          duplicate_status: "confirmed_duplicate",
        })
        .eq("id", candidate.id)
        .eq("parent_user_id", input.parentUserId);
      summary.duplicateCount += 1;
      continue;
    }

    // Cross-path dedup: ADLE already credited this (word, writing sample).
    if (
      candidate.writing_sample_id &&
      adleCountedKeys.has(authenticUseDedupKey(treasure.id, candidate.writing_sample_id))
    ) {
      await input.supabase
        .from("child_word_treasure_evidence_candidates")
        .update({
          confirmation_status: "duplicate",
          duplicate_status: "confirmed_duplicate",
        })
        .eq("id", candidate.id)
        .eq("parent_user_id", input.parentUserId);
      summary.duplicateCount += 1;
      continue;
    }

    const sourceEntityId = getFreeWritingEvidenceSourceEntityId({
      taskId: candidate.task_id,
      sourceFieldKey: candidate.source_field_key,
    });
    const eventMetadata = {
      ...candidate.metadata,
      source: "parent_confirmed_free_writing_evidence",
      evidence_candidate_id: candidate.id,
      task_submission_id: candidate.task_submission_id,
      task_id: candidate.task_id,
      task_type: candidate.task_type,
      source_field_key: candidate.source_field_key,
      writing_sample_id: candidate.writing_sample_id,
      matched_word: candidate.matched_word,
      occurrence_count: candidate.occurrence_count,
    };
    const eventResult = await insertTreasureEventIfMissing({
      supabase: input.supabase,
      treasureId: treasure.id,
      childId: input.childId,
      parentUserId: input.parentUserId,
      eventType: "authentic_correct_use_recorded",
      sourceType: FREE_WRITING_EVIDENCE_SOURCE_TYPE,
      sourceEntityId,
      previousStatus: treasure.status,
      newStatus: treasure.status,
      authenticUseIncrement: 1,
      metadata: eventMetadata,
    });

    if (!eventResult.inserted) {
      await input.supabase
        .from("child_word_treasure_evidence_candidates")
        .update({
          confirmation_status: "duplicate",
          duplicate_status: "confirmed_duplicate",
          confirmed_event_id: eventResult.eventId,
        })
        .eq("id", candidate.id)
        .eq("parent_user_id", input.parentUserId);
      summary.duplicateCount += 1;
      continue;
    }

    const nextUseCount = treasure.authentic_correct_uses_after_forge + 1;
    const awardsGoldenBar = nextUseCount >= treasure.required_uses_for_bar;
    const nextStatus = awardsGoldenBar ? "golden_bar" : treasure.status;

    const { error: updateError } = await input.supabase
      .from("child_word_treasures")
      .update({
        authentic_correct_uses_after_forge: nextUseCount,
        status: nextStatus,
        golden_bar_at: awardsGoldenBar ? nowIso : null,
        metadata: {
          ...((treasure.metadata as Record<string, unknown> | null) ?? {}),
          latest_free_writing_evidence_candidate_id: candidate.id,
        },
      })
      .eq("id", treasure.id)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId);

    if (updateError) {
      throw updateError;
    }

    if (awardsGoldenBar) {
      const barEventResult = await insertTreasureEventIfMissing({
        supabase: input.supabase,
        treasureId: treasure.id,
        childId: input.childId,
        parentUserId: input.parentUserId,
        eventType: "golden_bar_awarded",
        sourceType: "word_treasure",
        sourceEntityId: treasure.id,
        previousStatus: treasure.status,
        newStatus: "golden_bar",
        authenticUseIncrement: 0,
        metadata: {
          ...eventMetadata,
          authentic_correct_uses_after_forge: nextUseCount,
          required_uses_for_bar: treasure.required_uses_for_bar,
        },
      });

      if (barEventResult.inserted) {
        summary.goldenBarsAwardedCount += 1;
      }
    }

    await input.supabase
      .from("child_word_treasure_evidence_candidates")
      .update({
        confirmation_status: "confirmed",
        confirmed_at: nowIso,
        confirmed_by: input.confirmedByUserId,
        confirmed_event_id: eventResult.eventId,
        confirmed_awarded_golden_bar: awardsGoldenBar,
      })
      .eq("id", candidate.id)
      .eq("parent_user_id", input.parentUserId);

    summary.confirmedCount += 1;
  }

  return summary;
}
