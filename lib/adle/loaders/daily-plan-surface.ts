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

import type { ComposedDailyPlan } from "../daily-assignment-composer";
import {
  ADLE_ASSIGNMENT_GENERATION_SOURCE,
  ADLE_DAILY_ASSIGNMENT_TITLE,
  planAssignmentPersistence,
  type AssignmentPersistencePlan,
  type AdleGenerationTrigger,
  type ExistingAssignmentHeaderFact,
} from "../assignment-persistence";
import type { IsoDate } from "../review-scheduler";
import { BASE_WORD_FAMILY_ASSIGNMENT_SOURCE, BASE_WORD_FAMILY_ASSIGNMENT_TITLE } from "../morphology/base-word-family-pilot-plan";
import { genericSnapshotMode } from "../composable-lesson/generic-snapshot-mode";
import {
  emitGenericSnapshotResolutionEvent,
  resolveGenericLessonSnapshot,
  type GenericSnapshotResolutionResult,
} from "../composable-lesson/generic-snapshot-reader";
import { isSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-validator";
import type { CanonicalActivitySpec } from "../canonical-activity-spec";
import {
  dailyPlanHeaderProjection,
  getCachedDailyPlanSnapshotCapability,
  type DailyPlanSnapshotCapability,
} from "./daily-plan-snapshot-capability";

type Client = SupabaseClient;

export interface AdleSessionItem {
  id: string;
  sourceEntityId: string;
  sectionKey: string;
  templateKey: string;
  position: number;
  status: string;
  targetWord: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  adleLearningItemRef: string | null;
  promptData: Record<string, unknown>;
  itemMetadata?: Record<string, unknown>;
  canonicalActivitySpec?: CanonicalActivitySpec;
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
  "lesson_reflection",
] as const;

export interface AdleDailyPlanReadModel {
  state: "empty" | "ready" | "completed";
  planDate: IsoDate;
  assignmentId: string | null;
  lessonRouteMetadata: unknown | null;
  assignmentGenerationSource: string | null;
  snapshotCapability: DailyPlanSnapshotCapability | null;
  compiledLessonSnapshot: unknown | null | undefined;
  genericSnapshotResolution: GenericSnapshotResolutionResult<AdleSessionItem> | null;
  partOne: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  partTwo: { items: AdleSessionItem[]; present: boolean; complete: boolean };
}

interface AssignmentItemRow {
  id: string;
  source_entity_id: string | null;
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
    sourceEntityId: row.source_entity_id ?? "",
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
    itemMetadata: metadata,
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
    .select("id, title, assignment_generation_source")
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

/** Read-only child session lookup. The explicit base-word pilot has its own
 * persistence path but is displayed on the same ADLE session surface. */
export async function getExistingAdleSessionPlanId(params: {
  userClient: Client;
  parentUserId: string;
  childId: string;
  planDate: IsoDate;
}): Promise<string | null> {
  const { data, error } = await params.userClient
    .from("daily_assignments")
    .select("id, title, assignment_generation_source")
    .eq("parent_user_id", params.parentUserId)
    .eq("child_id", params.childId)
    .eq("assignment_date", params.planDate)
    .limit(4);
  if (error) throw new Error(`getExistingAdleSessionPlanId: ${error.message}`);
  const rows = ((data ?? []) as { id: string; title: string | null; assignment_generation_source: string | null }[]).filter((row) =>
    (row.title === BASE_WORD_FAMILY_ASSIGNMENT_TITLE && row.assignment_generation_source === BASE_WORD_FAMILY_ASSIGNMENT_SOURCE)
    || (row.title === ADLE_DAILY_ASSIGNMENT_TITLE && row.assignment_generation_source === ADLE_ASSIGNMENT_GENERATION_SOURCE),
  );
  if (rows.length > 1) throw new Error("getExistingAdleSessionPlanId: multiple ADLE session assignments found for one day");
  return rows[0]?.id ?? null;
}

export interface EnsureAdleDailyPlanParams {
  userClient: Client;
  serviceClient: Client;
  parentUserId: string;
  childId: string;
  planDate: IsoDate;
}

export async function prepareComposedAdleDailyPlanPersistence(params: EnsureAdleDailyPlanParams & {
  plan: ComposedDailyPlan;
  generationTrigger?: AdleGenerationTrigger;
}): Promise<AssignmentPersistencePlan> {
  const { userClient, parentUserId, childId, planDate, plan } = params;
  const { data: headerRows, error: headersError } = await userClient.from("daily_assignments").select("child_id, assignment_date, title, status").eq("parent_user_id", parentUserId).eq("child_id", childId).eq("assignment_date", planDate);
  if (headersError) throw new Error(`prepareComposedAdleDailyPlanPersistence:headers: ${headersError.message}`);
  const existingHeaders: ExistingAssignmentHeaderFact[] = (headerRows ?? []).map((row) => ({ childId: (row as { child_id: string }).child_id, assignmentDate: (row as { assignment_date: string }).assignment_date, title: (row as { title: string | null }).title ?? "", status: (row as { status: string }).status }));
  return planAssignmentPersistence(plan, {
    parentUserId,
    existingHeaders,
    generationTrigger: params.generationTrigger,
  });
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
      lessonRouteMetadata: null,
      assignmentGenerationSource: null,
      snapshotCapability: null,
      compiledLessonSnapshot: null,
      genericSnapshotResolution: null,
      partOne: { items: [], present: false, complete: false },
      partTwo: { items: [], present: false, complete: false },
    };
  }
  const snapshotMode = genericSnapshotMode();
  const snapshotCapability = await getCachedDailyPlanSnapshotCapability({
    mode: snapshotMode,
    cacheKey: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "default",
    probe: async () => {
      const { error } = await userClient
        .from("daily_assignments")
        .select("compiled_lesson_snapshot")
        .limit(0);
      return { error };
    },
  });
  const [headerResult, itemsResult] = await Promise.all([
    userClient
      .from("daily_assignments")
      .select(dailyPlanHeaderProjection(snapshotCapability))
      .eq("id", assignmentId)
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .maybeSingle(),
    userClient
      .from("assignment_items")
      .select("id, source_entity_id, position, status, template_key, target_word, prompt_data, metadata")
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .eq("daily_assignment_id", assignmentId)
      .order("position", { ascending: true }),
  ]);
  if (headerResult.error) {
    throw new Error(`getAdleDailyPlanReadModel:header: ${headerResult.error.message}`);
  }
  if (itemsResult.error) {
    throw new Error(`getAdleDailyPlanReadModel:items: ${itemsResult.error.message}`);
  }
  if (!headerResult.data) {
    throw new Error("getAdleDailyPlanReadModel: assignment header not found");
  }
  const header = headerResult.data as unknown as {
    lesson_route_metadata: unknown | null;
    assignment_generation_source: string | null;
    compiled_lesson_snapshot?: unknown | null;
  };
  const rawItems = ((itemsResult.data ?? []) as unknown as AssignmentItemRow[]).map(sessionItemFromRow);
  const isExplicitGeneric =
    typeof header.lesson_route_metadata === "object" &&
    header.lesson_route_metadata !== null &&
    (header.lesson_route_metadata as { route?: { routeId?: unknown } }).route?.routeId === "generic_composer";
  const compiledLessonSnapshot = snapshotCapability.genericSnapshotColumn === "available"
    ? header.compiled_lesson_snapshot ?? null
    : undefined;
  const genericSnapshotResolution =
    isExplicitGeneric || (compiledLessonSnapshot !== null
      && compiledLessonSnapshot !== undefined
      && !isSpecialistSnapshotV3(compiledLessonSnapshot))
      ? resolveGenericLessonSnapshot({
          mode: snapshotMode,
          lessonRouteMetadata: header.lesson_route_metadata,
          assignmentGenerationSource: header.assignment_generation_source,
          compiledLessonSnapshot,
          items: rawItems,
          snapshotColumn: snapshotCapability.genericSnapshotColumn,
          requiresSnapshot: isExplicitGeneric && snapshotMode !== "off",
        })
      : null;
  if (genericSnapshotResolution) {
    emitGenericSnapshotResolutionEvent(
      genericSnapshotResolution,
      header.assignment_generation_source,
    );
  }
  const items = genericSnapshotResolution?.status === "resolved"
    ? genericSnapshotResolution.items
    : rawItems;
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
  return {
    state,
    planDate,
    assignmentId,
    lessonRouteMetadata: header.lesson_route_metadata,
    assignmentGenerationSource: header.assignment_generation_source,
    snapshotCapability,
    compiledLessonSnapshot,
    genericSnapshotResolution,
    partOne,
    partTwo,
  };
}
