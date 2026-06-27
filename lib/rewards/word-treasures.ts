import type { createClient } from "@/lib/supabase/server";

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
