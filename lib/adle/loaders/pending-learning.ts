import "server-only";

import {
  getPendingAdleLifecycleLabel,
  PENDING_ADLE_ITEM_STATUSES,
  sortPendingAdleLearningRoutes,
  type PendingAdleLearningResult,
} from "@/lib/adle/pending-learning";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type {
  PendingAdleLearningResult,
  PendingAdleLearningRoute,
} from "@/lib/adle/pending-learning";

type LearningItemRow = {
  id: string;
  canonical_word_id: string;
  micro_skill_key: string;
  item_status: string;
  intake_on: string | null;
};

type LineageRow = {
  id: string;
  learning_item_id: string;
  misspelling_normalized: string | null;
  created_at: string;
};

function selectLatestLineageByItemId(rows: LineageRow[]) {
  const latestByItemId = new Map<string, LineageRow>();

  for (const row of rows) {
    const current = latestByItemId.get(row.learning_item_id);
    if (
      !current ||
      row.created_at > current.created_at ||
      (row.created_at === current.created_at && row.id > current.id)
    ) {
      latestByItemId.set(row.learning_item_id, row);
    }
  }

  return latestByItemId;
}

/**
 * Parent Insights calls this only after its normal authenticated parent and
 * selected-child ownership checks. The service role is deliberately limited to
 * this server-side read model so the parent UI never receives another child's
 * routes through a client query.
 */
export async function loadPendingAdleLearningForChild(
  childId: string,
): Promise<PendingAdleLearningResult> {
  try {
    const serviceClient = createServiceRoleClient();
    const { data: itemData, error: itemError } = await serviceClient
      .from("adle_learning_items")
      .select("id, canonical_word_id, micro_skill_key, item_status, intake_on")
      .eq("child_id", childId)
      .eq("row_status", "active")
      .in("item_status", PENDING_ADLE_ITEM_STATUSES);

    if (itemError) {
      console.error("Unable to load pending ADLE learning items", itemError);
      return { status: "unavailable" };
    }

    const items = (itemData ?? []) as LearningItemRow[];
    if (items.length === 0) {
      return { status: "ready", routes: [] };
    }

    const itemIds = items.map((item) => item.id);
    const wordIds = Array.from(new Set(items.map((item) => item.canonical_word_id)));
    const microSkillKeys = Array.from(new Set(items.map((item) => item.micro_skill_key)));
    const [lineageResult, wordResult, skillResult] = await Promise.all([
      serviceClient
        .from("adle_learning_item_sources")
        .select("id, learning_item_id, misspelling_normalized, created_at")
        .in("learning_item_id", itemIds)
        .eq("row_status", "active"),
      serviceClient
        .from("canonical_teaching_dictionary_words")
        .select("id, display_word")
        .in("id", wordIds),
      serviceClient
        .from("micro_skill_catalog")
        .select("micro_skill_key, display_name")
        .in("micro_skill_key", microSkillKeys),
    ]);

    if (lineageResult.error || wordResult.error || skillResult.error) {
      console.error("Unable to load pending ADLE learning details", {
        lineageError: lineageResult.error,
        wordError: wordResult.error,
        skillError: skillResult.error,
      });
      return { status: "unavailable" };
    }

    const latestLineageByItemId = selectLatestLineageByItemId(
      (lineageResult.data ?? []) as LineageRow[],
    );
    const wordById = new Map(
      ((wordResult.data ?? []) as { id: string; display_word: string }[]).map((row) => [
        row.id,
        row.display_word,
      ]),
    );
    const skillByKey = new Map(
      ((skillResult.data ?? []) as {
        micro_skill_key: string;
        display_name: string | null;
      }[]).map((row) => [row.micro_skill_key, row.display_name]),
    );

    return {
      status: "ready",
      routes: sortPendingAdleLearningRoutes(
        items.map((item) => ({
          learningItemId: item.id,
          canonicalWordId: item.canonical_word_id,
          canonicalWord:
            wordById.get(item.canonical_word_id) ?? item.canonical_word_id,
          learnerSpelling:
            latestLineageByItemId.get(item.id)?.misspelling_normalized ?? null,
          microSkillKey: item.micro_skill_key,
          microSkillName: skillByKey.get(item.micro_skill_key) ?? null,
          itemStatus: item.item_status,
          lifecycleLabel: getPendingAdleLifecycleLabel(item.item_status),
          intakeOn: item.intake_on,
        })),
      ),
    };
  } catch (error) {
    console.error("Unable to initialise pending ADLE learning loader", error);
    return { status: "unavailable" };
  }
}
