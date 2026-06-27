import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const WORD_TREASURE_STATUSES = [
  "golden_nugget",
  "in_forge",
  "golden_bar",
] as const;

export type WordTreasureStatus = (typeof WORD_TREASURE_STATUSES)[number];

export const WORD_TREASURE_EVENT_TYPES = [
  "golden_nugget_created",
  "golden_nugget_updated",
  "entered_forge",
  "authentic_correct_use_recorded",
  "golden_bar_awarded",
] as const;

export type WordTreasureEventType = (typeof WORD_TREASURE_EVENT_TYPES)[number];

export type ChildWordTreasureRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  canonical_word_id: string | null;
  canonical_mapping_id: string | null;
  corrected_word: string;
  corrected_word_normalized: string;
  original_misspelling: string | null;
  source_issue_id: string | null;
  source_learning_item_id: string | null;
  source_submission_id: string | null;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string | null;
  status: WordTreasureStatus;
  discovered_at: string;
  correction_attempted_at: string | null;
  entered_forge_at: string | null;
  golden_bar_at: string | null;
  authentic_correct_uses_after_forge: number;
  required_uses_for_bar: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ChildWordTreasureEventRow = {
  id: string;
  treasure_id: string;
  child_id: string;
  parent_user_id: string;
  event_type: WordTreasureEventType;
  source_type: string;
  source_entity_id: string | null;
  previous_status: WordTreasureStatus | null;
  new_status: WordTreasureStatus | null;
  authentic_use_increment: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateOrUpdateGoldenNuggetInput = {
  childId: string;
  parentUserId: string;
  correctedWord: string;
  originalMisspelling?: string | null;
  sourceIssueId?: string | null;
  sourceLearningItemId?: string | null;
  sourceSubmissionId?: string | null;
  sourceMisspellingInstanceId?: string | null;
  canonicalMappingId?: string | null;
  microSkillKey?: string | null;
  correctionAttemptedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export function normaliseWordTreasureWord(word: string) {
  return word.trim().toLowerCase();
}

export function getWordTreasureCounts(
  treasures: Array<Pick<ChildWordTreasureRow, "status">>,
) {
  return treasures.reduce(
    (counts, treasure) => {
      if (treasure.status === "golden_nugget") {
        counts.goldenNuggets += 1;
      } else if (treasure.status === "in_forge") {
        counts.inForge += 1;
      } else if (treasure.status === "golden_bar") {
        counts.goldenBars += 1;
      }

      return counts;
    },
    {
      goldenNuggets: 0,
      inForge: 0,
      goldenBars: 0,
    },
  );
}

const WORD_TREASURE_SELECT = [
  "id",
  "child_id",
  "parent_user_id",
  "canonical_word_id",
  "canonical_mapping_id",
  "corrected_word",
  "corrected_word_normalized",
  "original_misspelling",
  "source_issue_id",
  "source_learning_item_id",
  "source_submission_id",
  "source_misspelling_instance_id",
  "micro_skill_key",
  "status",
  "discovered_at",
  "correction_attempted_at",
  "entered_forge_at",
  "golden_bar_at",
  "authentic_correct_uses_after_forge",
  "required_uses_for_bar",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const WORD_TREASURE_EVENT_SELECT = [
  "id",
  "treasure_id",
  "child_id",
  "parent_user_id",
  "event_type",
  "source_type",
  "source_entity_id",
  "previous_status",
  "new_status",
  "authentic_use_increment",
  "metadata",
  "created_at",
].join(", ");

export async function getChildWordTreasures(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  statuses?: WordTreasureStatus[];
}) {
  const { supabase, parentUserId, childId, statuses } = input;
  let query = supabase
    .from("child_word_treasures")
    .select(WORD_TREASURE_SELECT)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .order("updated_at", { ascending: false });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown) as ChildWordTreasureRow[];
}

export async function getChildWordTreasureByWord(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  correctedWord: string;
}) {
  const { supabase, parentUserId, childId, correctedWord } = input;
  const { data, error } = await supabase
    .from("child_word_treasures")
    .select(WORD_TREASURE_SELECT)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("corrected_word_normalized", normaliseWordTreasureWord(correctedWord))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as ChildWordTreasureRow | null) ?? null;
}

export async function getChildWordTreasureEvents(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  treasureId?: string;
}) {
  const { supabase, parentUserId, childId, treasureId } = input;
  let query = supabase
    .from("child_word_treasure_events")
    .select(WORD_TREASURE_EVENT_SELECT)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .order("created_at", { ascending: false });

  if (treasureId) {
    query = query.eq("treasure_id", treasureId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown) as ChildWordTreasureEventRow[];
}

function mergeDefined<T extends Record<string, unknown>>(base: T, patch: T) {
  return Object.fromEntries(
    Object.entries({
      ...base,
      ...patch,
    }).filter(([, value]) => value !== undefined),
  ) as T;
}

function getEventTypeForGoldenNuggetWrite(existing: ChildWordTreasureRow | null) {
  return existing ? "golden_nugget_updated" : "golden_nugget_created";
}

async function insertWordTreasureEventIfMissing(input: {
  supabase: SupabaseServerClient;
  treasureId: string;
  childId: string;
  parentUserId: string;
  eventType: WordTreasureEventType;
  sourceType: string;
  sourceEntityId: string | null;
  previousStatus: WordTreasureStatus | null;
  newStatus: WordTreasureStatus | null;
  metadata: Record<string, unknown>;
}) {
  const {
    supabase,
    treasureId,
    childId,
    parentUserId,
    eventType,
    sourceType,
    sourceEntityId,
    previousStatus,
    newStatus,
    metadata,
  } = input;

  if (sourceEntityId) {
    const { data: existingEvent, error: existingError } = await supabase
      .from("child_word_treasure_events")
      .select("id")
      .eq("treasure_id", treasureId)
      .eq("event_type", eventType)
      .eq("source_type", sourceType)
      .eq("source_entity_id", sourceEntityId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingEvent) {
      return false;
    }
  }

  const { error } = await supabase.from("child_word_treasure_events").insert({
    treasure_id: treasureId,
    child_id: childId,
    parent_user_id: parentUserId,
    event_type: eventType,
    source_type: sourceType,
    source_entity_id: sourceEntityId,
    previous_status: previousStatus,
    new_status: newStatus,
    authentic_use_increment: 0,
    metadata,
  });

  if (error) {
    throw error;
  }

  return true;
}

export async function createOrUpdateGoldenNuggetFromParentApproval(
  input: CreateOrUpdateGoldenNuggetInput,
) {
  const {
    childId,
    parentUserId,
    correctedWord,
    originalMisspelling,
    sourceIssueId,
    sourceLearningItemId,
    sourceSubmissionId,
    sourceMisspellingInstanceId,
    canonicalMappingId,
    microSkillKey,
    correctionAttemptedAt,
    metadata,
  } = input;
  const supabase = createServiceRoleClient();
  const safeCorrectedWord = correctedWord.trim();
  const correctedWordNormalized = normaliseWordTreasureWord(safeCorrectedWord);

  if (!correctedWordNormalized) {
    return {
      treasure: null,
      eventCreated: false,
      skippedReason: "missing_corrected_word" as const,
    };
  }

  const existing = await getChildWordTreasureByWord({
    supabase,
    parentUserId,
    childId,
    correctedWord: correctedWordNormalized,
  });
  const now = new Date().toISOString();
  const baseMetadata = mergeDefined(
    (existing?.metadata ?? {}) as Record<string, unknown>,
    {
      ...metadata,
      source: "parent_final_classification",
      source_issue_id: sourceIssueId ?? existing?.source_issue_id ?? null,
    },
  );

  if (existing) {
    const { data, error } = await supabase
      .from("child_word_treasures")
      .update({
        canonical_mapping_id:
          existing.canonical_mapping_id ?? canonicalMappingId ?? null,
        original_misspelling:
          existing.original_misspelling ?? originalMisspelling ?? null,
        source_issue_id: existing.source_issue_id ?? sourceIssueId ?? null,
        source_learning_item_id:
          existing.source_learning_item_id ?? sourceLearningItemId ?? null,
        source_submission_id:
          existing.source_submission_id ?? sourceSubmissionId ?? null,
        source_misspelling_instance_id:
          existing.source_misspelling_instance_id ??
          sourceMisspellingInstanceId ??
          null,
        micro_skill_key: existing.micro_skill_key ?? microSkillKey ?? null,
        correction_attempted_at:
          existing.correction_attempted_at ?? correctionAttemptedAt ?? now,
        metadata: baseMetadata,
      })
      .eq("id", existing.id)
      .select(WORD_TREASURE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    const treasure = data as unknown as ChildWordTreasureRow;
    const eventCreated = await insertWordTreasureEventIfMissing({
      supabase,
      treasureId: treasure.id,
      childId,
      parentUserId,
      eventType: getEventTypeForGoldenNuggetWrite(existing),
      sourceType: "writing_issue",
      sourceEntityId: sourceIssueId ?? null,
      previousStatus: existing.status,
      newStatus: treasure.status,
      metadata: baseMetadata,
    });

    return {
      treasure,
      eventCreated,
      skippedReason: null,
    };
  }

  const { data, error } = await supabase
    .from("child_word_treasures")
    .insert({
      child_id: childId,
      parent_user_id: parentUserId,
      canonical_mapping_id: canonicalMappingId ?? null,
      corrected_word: safeCorrectedWord,
      corrected_word_normalized: correctedWordNormalized,
      original_misspelling: originalMisspelling ?? null,
      source_issue_id: sourceIssueId ?? null,
      source_learning_item_id: sourceLearningItemId ?? null,
      source_submission_id: sourceSubmissionId ?? null,
      source_misspelling_instance_id: sourceMisspellingInstanceId ?? null,
      micro_skill_key: microSkillKey ?? null,
      status: "golden_nugget",
      discovered_at: now,
      correction_attempted_at: correctionAttemptedAt ?? now,
      metadata: baseMetadata,
    })
    .select(WORD_TREASURE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const treasure = data as unknown as ChildWordTreasureRow;
  const eventCreated = await insertWordTreasureEventIfMissing({
    supabase,
    treasureId: treasure.id,
    childId,
    parentUserId,
    eventType: getEventTypeForGoldenNuggetWrite(null),
    sourceType: "writing_issue",
    sourceEntityId: sourceIssueId ?? null,
    previousStatus: null,
    newStatus: "golden_nugget",
    metadata: baseMetadata,
  });

  return {
    treasure,
    eventCreated,
    skippedReason: null,
  };
}
