/**
 * ADLE Slice 6/7P: explicit ensure-today's-plan and the session surface read model.
 *
 * Ensure: compose (pure) -> plan persistence (pure) -> insert only on
 * `action === "insert"`. Slice 7P pins ensure behind an explicit guarded
 * generation path only: the child-facing route must call read-only lookup +
 * read model, never lazy generation on page load. The daily_assignments unique
 * (child_id, assignment_date, title) guard makes concurrent explicit
 * generation safe: the losing insert conflicts and we re-read the winner.
 * Composer skip reasons are structured-logged at generation.
 *
 * The assignment header/items write through the caller's cookie-auth client
 * (parent-scoped RLS, same as the legacy daily practice); ADLE-owned tables
 * go through the service-role client. Assignment creation writes nothing
 * else — scheduler writes happen at completion (Slice 3 pin).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDailyPlan } from "../daily-assignment-composer";
import {
  ADLE_ASSIGNMENT_GENERATION_SOURCE,
  ADLE_DAILY_ASSIGNMENT_TITLE,
  planAssignmentPersistence,
  type ExistingAssignmentHeaderFact,
} from "../assignment-persistence";
import type { IsoDate } from "../review-scheduler";
import { loadDailyPlanFacts } from "./composer-facts-loader";
import { insertLearningItemIntakes } from "./session-completion-loader";

type Client = SupabaseClient;

export interface AdleSessionItem {
  id: string;
  sectionKey: string;
  templateKey: string;
  position: number;
  status: string;
  targetWord: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  adleLearningItemRef: string | null;
  promptData: Record<string, unknown>;
}

export const ADLE_PART_ONE_SECTION_KEYS = [
  "review_quick_sort",
  "review_production",
  "review_reflection",
] as const;

export const ADLE_PART_TWO_SECTION_KEYS = [
  "lesson_intro",
  "guided_practice",
  "lesson_production",
  "lesson_probe",
  "lesson_dictation",
] as const;

export interface AdleDailyPlanReadModel {
  state: "empty" | "ready" | "completed";
  planDate: IsoDate;
  assignmentId: string | null;
  partOne: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  partTwo: { items: AdleSessionItem[]; present: boolean; complete: boolean };
}

interface AssignmentItemRow {
  id: string;
  position: number;
  status: string;
  template_key: string | null;
  target_word: string | null;
  prompt_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

function sessionItemFromRow(row: AssignmentItemRow): AdleSessionItem {
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    sectionKey: typeof metadata.sectionKey === "string" ? metadata.sectionKey : "",
    templateKey: row.template_key ?? "",
    position: row.position,
    status: row.status,
    targetWord: row.target_word,
    canonicalWordId: typeof metadata.canonicalWordId === "string" ? metadata.canonicalWordId : null,
    microSkillKey: typeof metadata.microSkillKey === "string" ? metadata.microSkillKey : null,
    adleLearningItemRef:
      typeof metadata.adleLearningItemRef === "string" ? metadata.adleLearningItemRef : null,
    promptData: row.prompt_data ?? {},
  };
}

function partComplete(items: readonly AdleSessionItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === "completed");
}

export async function findAdleHeader(
  userClient: Client,
  parentUserId: string,
  childId: string,
  planDate: IsoDate,
): Promise<{ id: string } | null> {
  const { data, error } = await userClient
    .from("daily_assignments")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("assignment_date", planDate)
    .eq("title", ADLE_DAILY_ASSIGNMENT_TITLE)
    .eq("assignment_generation_source", ADLE_ASSIGNMENT_GENERATION_SOURCE)
    .maybeSingle();
  if (error) {
    throw new Error(`findAdleHeader: ${error.message}`);
  }
  return (data as { id: string } | null) ?? null;
}

export async function getExistingAdleDailyPlanId(params: {
  userClient: Client;
  parentUserId: string;
  childId: string;
  planDate: IsoDate;
}): Promise<string | null> {
  const existing = await findAdleHeader(
    params.userClient,
    params.parentUserId,
    params.childId,
    params.planDate,
  );
  return existing?.id ?? null;
}

export interface EnsureAdleDailyPlanParams {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  planDate: IsoDate;
}

/** Ensure today's ADLE plan exists; returns the header id or null when the
 * composed day is empty (nothing due, no lesson possible). Idempotent and
 * concurrency-safe via the header uniqueness guard. */
export async function ensureAdleDailyPlan(params: EnsureAdleDailyPlanParams): Promise<string | null> {
  const { userClient, serviceClient, parentUserId, childId, planDate } = params;

  const existing = await findAdleHeader(userClient, parentUserId, childId, planDate);
  if (existing !== null) {
    return existing.id;
  }

  const { facts } = await loadDailyPlanFacts(serviceClient, { childId, today: planDate });
  const plan = composeDailyPlan(facts, planDate);

  const skips = [...plan.partOne.skips, ...plan.partTwo.skips];
  if (skips.length > 0) {
    console.info(
      `[adle-composer] ${childId} ${planDate} skips: ${JSON.stringify(skips.map((skip) => skip.reason))}`,
    );
  }

  const { data: headerRows, error: headersError } = await userClient
    .from("daily_assignments")
    .select("child_id, assignment_date, title, status")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("assignment_date", planDate);
  if (headersError) {
    throw new Error(`ensureAdleDailyPlan:headers: ${headersError.message}`);
  }
  const existingHeaders: ExistingAssignmentHeaderFact[] = (headerRows ?? []).map((row) => ({
    childId: (row as { child_id: string }).child_id,
    assignmentDate: (row as { assignment_date: string }).assignment_date,
    title: (row as { title: string | null }).title ?? "",
    status: (row as { status: string }).status,
  }));

  const persistence = planAssignmentPersistence(plan, { parentUserId, existingHeaders });
  if (persistence.action === "noop") {
    if (persistence.noopReason === "existing_active_plan") {
      return (await findAdleHeader(userClient, parentUserId, childId, planDate))?.id ?? null;
    }
    return null; // empty_plan -> explicit "nothing today" state
  }

  const header = persistence.header;
  if (header === null) {
    return null;
  }
  const { data: insertedHeader, error: insertError } = await userClient
    .from("daily_assignments")
    .insert({
      child_id: header.childId,
      parent_user_id: header.parentUserId,
      assignment_date: header.assignmentDate,
      title: header.title,
      status: header.status,
      target_words: header.targetWords,
      review_words: header.reviewWords,
      assignment_generation_source: header.assignmentGenerationSource,
    })
    .select("id")
    .maybeSingle();
  if (insertError) {
    // Unique-violation = a concurrent first visit won the insert; re-read.
    if (`${insertError.code ?? ""}`.startsWith("23505")) {
      return (await findAdleHeader(userClient, parentUserId, childId, planDate))?.id ?? null;
    }
    throw new Error(`ensureAdleDailyPlan:insertHeader: ${insertError.message}`);
  }
  const assignmentId = (insertedHeader as { id: string } | null)?.id ?? null;
  if (assignmentId === null) {
    throw new Error("ensureAdleDailyPlan: header insert returned no id");
  }

  const { error: itemsError } = await userClient.from("assignment_items").insert(
    persistence.items.map((item) => ({
      daily_assignment_id: assignmentId,
      child_id: item.childId,
      parent_user_id: item.parentUserId,
      domain_module: item.domainModule,
      item_type: item.itemType,
      source_type: item.sourceType,
      source_entity_id: item.sourceEntityId,
      learning_item_id: null,
      template_key: item.templateKey,
      target_word: item.targetWord,
      position: item.position,
      status: item.status,
      prompt_data: item.promptData,
      metadata: item.metadata,
    })),
  );
  if (itemsError) {
    throw new Error(`ensureAdleDailyPlan:insertItems: ${itemsError.message}`);
  }

  // Stretch-word learning items ride the same ensure (composer contract:
  // every generated item traces to an active adle_learning_items row).
  await insertLearningItemIntakes(serviceClient, persistence.learningItemIntakes);

  return assignmentId;
}

export async function getAdleDailyPlanReadModel(params: {
  userClient: Client;
  parentUserId: string;
  childId: string;
  planDate: IsoDate;
  assignmentId: string | null;
}): Promise<AdleDailyPlanReadModel> {
  const { userClient, parentUserId, childId, planDate, assignmentId } = params;
  if (assignmentId === null) {
    return {
      state: "empty",
      planDate,
      assignmentId: null,
      partOne: { items: [], present: false, complete: false },
      partTwo: { items: [], present: false, complete: false },
    };
  }
  const { data, error } = await userClient
    .from("assignment_items")
    .select("id, position, status, template_key, target_word, prompt_data, metadata")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("daily_assignment_id", assignmentId)
    .order("position", { ascending: true });
  if (error) {
    throw new Error(`getAdleDailyPlanReadModel: ${error.message}`);
  }
  const items = ((data ?? []) as unknown as AssignmentItemRow[]).map(sessionItemFromRow);
  const partOneItems = items.filter((item) =>
    (ADLE_PART_ONE_SECTION_KEYS as readonly string[]).includes(item.sectionKey),
  );
  const partTwoItems = items.filter((item) =>
    (ADLE_PART_TWO_SECTION_KEYS as readonly string[]).includes(item.sectionKey),
  );
  const partOne = {
    items: partOneItems,
    present: partOneItems.length > 0,
    complete: partComplete(partOneItems),
  };
  const partTwo = {
    items: partTwoItems,
    present: partTwoItems.length > 0,
    complete: partComplete(partTwoItems),
  };
  const allPresent = [...partOneItems, ...partTwoItems];
  const state =
    allPresent.length === 0
      ? "empty"
      : (partOne.present ? partOne.complete : true) && (partTwo.present ? partTwo.complete : true)
        ? "completed"
        : "ready";
  return { state, planDate, assignmentId, partOne, partTwo };
}
