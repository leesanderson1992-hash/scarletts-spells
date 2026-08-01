import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import {
  WORD_LAB_COMPILER_VERSION,
  WORD_LAB_SNAPSHOT_SCHEMA_VERSION,
  WORD_LAB_VALIDATOR_VERSION,
  WORD_LAB_WORD_ROLES,
  type CompiledWordLabSnapshotV1,
  type WordLabBlocker,
  type WordLabRecipeDefinitionV1,
  type WordLabSnapshotValidationResult,
  type WordLabWordRole,
  wordLabActivityContractKey,
} from "./contracts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function validSnapshotEnvelopeShape(value: unknown): value is CompiledWordLabSnapshotV1 {
  if (
    !record(value) ||
    !record(value.route) ||
    !record(value.recipe) ||
    !record(value.taxonomy) ||
    !record(value.resolvedWordRequirements) ||
    !record(value.resolvedWordRequirements.lesson) ||
    !record(value.resolvedWordRequirements.authentic) ||
    !record(value.resolvedWordRequirements.transfer) ||
    !record(value.resolvedWordRequirements.practice) ||
    !Array.isArray(value.resolvedWordRequirements.coverage) ||
    !Array.isArray(value.words) ||
    !Array.isArray(value.activities) ||
    !record(value.probe) ||
    !record(value.completion) ||
    !record(value.content) ||
    !record(value.policies) ||
    !record(value.provenance) ||
    typeof value.fingerprint !== "string"
  ) return false;
  if (value.words.some((word) =>
    !record(word) || !Array.isArray(word.roles) || !record(word.contentRef) ||
    !record(word.coverage) || !nonEmpty(word.slotId) || !nonEmpty(word.canonicalWordId) ||
    !nonEmpty(word.displayWord)
  )) return false;
  if (value.activities.some((activity) =>
    !record(activity) || !nonEmpty(activity.activityId) || !nonEmpty(activity.activityKey) ||
    !nonEmpty(activity.kind) || !Number.isInteger(activity.contractVersion) ||
    !Number.isInteger(activity.order) || !stringArray(activity.wordSlotIds) ||
    !stringArray(activity.assignmentItemIds) || !record(activity.config)
  )) return false;
  return true;
}

function countRole(snapshot: CompiledWordLabSnapshotV1, role: WordLabWordRole): number {
  return snapshot.words.filter((word) => word.roles.includes(role)).length;
}

function expectedRoleValue<T extends string>(
  roles: readonly WordLabWordRole[],
  values: Readonly<Partial<Record<WordLabWordRole, T>>>,
  fallback: T,
): T | null {
  const resolved = [...new Set(roles.map((role) => values[role]).filter((value): value is T => value !== undefined))];
  return resolved.length > 1 ? null : resolved[0] ?? fallback;
}

function snapshotWithoutFingerprint(snapshot: CompiledWordLabSnapshotV1): Omit<CompiledWordLabSnapshotV1, "fingerprint"> {
  const draft = { ...snapshot } as Partial<CompiledWordLabSnapshotV1>;
  delete draft.fingerprint;
  return draft as Omit<CompiledWordLabSnapshotV1, "fingerprint">;
}

export function validateCompiledWordLabSnapshot(
  value: unknown,
  context: {
    recipe?: WordLabRecipeDefinitionV1;
    supportedActivityContracts?: ReadonlySet<string>;
  } = {},
): WordLabSnapshotValidationResult {
  if (!validSnapshotEnvelopeShape(value)) {
    return { ok: false, blockers: [{ code: "snapshot_shape_invalid" }] };
  }
  const snapshot = value;
  const blockers: WordLabBlocker[] = [];
  if (
    snapshot.schemaVersion !== WORD_LAB_SNAPSHOT_SCHEMA_VERSION ||
    snapshot.compilerVersion !== WORD_LAB_COMPILER_VERSION ||
    snapshot.validatorVersion !== WORD_LAB_VALIDATOR_VERSION ||
    snapshot.route?.rendererKey !== "common_word_lab" ||
    !nonEmpty(snapshot.assignmentId) || !nonEmpty(snapshot.childId) || !nonEmpty(snapshot.assignmentDate)
  ) blockers.push({ code: "snapshot_shape_invalid" });

  const recipe = context.recipe;
  if (recipe) {
    if (snapshot.route.routeKey !== recipe.compatibility.routeKey || snapshot.route.routeVersion !== recipe.compatibility.routeVersion) {
      blockers.push({ code: "recipe_route_mismatch" });
    }
    if (snapshot.recipe.recipeKey !== recipe.identity.recipeKey || snapshot.recipe.recipeVersion !== recipe.identity.recipeVersion) {
      blockers.push({ code: "recipe_route_mismatch" });
    }
    if (snapshot.recipe.definitionFingerprint !== fingerprintSnapshotValue(recipe)) {
      blockers.push({ code: "snapshot_fingerprint_mismatch", detail: "recipe_definition" });
    }
  }

  const requirements = snapshot.resolvedWordRequirements;
  if (!requirements || snapshot.words.length < requirements.lesson.min || snapshot.words.length > requirements.lesson.max) {
    blockers.push({ code: "invalid_word_count" });
  } else {
    const ranges: readonly [WordLabWordRole, { min: number; max: number }][] = [
      ["authentic_target", requirements.authentic],
      ["transfer", requirements.transfer],
      ["practice", requirements.practice],
    ];
    for (const [role, range] of ranges) {
      const count = countRole(snapshot, role);
      if (count < range.min || count > range.max) blockers.push({ code: "invalid_word_role_count", detail: role });
    }
    for (const coverage of requirements.coverage) {
      const distinct = new Set(snapshot.words.map((word) => word.coverage?.[coverage.key]).filter(Boolean));
      if (distinct.size < coverage.minDistinct) blockers.push({ code: "coverage_requirement_failed", detail: coverage.key });
    }
  }

  const slotIds = new Set<string>();
  for (const word of snapshot.words) {
    if (!nonEmpty(word.slotId) || slotIds.has(word.slotId) || !nonEmpty(word.canonicalWordId) || !nonEmpty(word.displayWord)) {
      blockers.push({ code: "snapshot_shape_invalid", detail: "word" });
    }
    slotIds.add(word.slotId);
    if (!Array.isArray(word.roles) || word.roles.some((role) => !WORD_LAB_WORD_ROLES.includes(role))) {
      blockers.push({ code: "word_role_conflict", detail: word.slotId });
    }
    const primary = word.roles.filter((role) => ["authentic_target", "transfer", "practice"].includes(role));
    if (primary.length !== 1 || new Set(word.roles).size !== word.roles.length) {
      blockers.push({ code: "word_role_conflict", detail: word.slotId });
    }
    if (recipe) {
      const schedulingRole = expectedRoleValue(word.roles, recipe.scheduling.roles, "none");
      const rewardRole = expectedRoleValue(word.roles, recipe.rewards.roles, "ineligible");
      if (schedulingRole === null || rewardRole === null || schedulingRole !== word.schedulingRole || rewardRole !== word.rewardRole) {
        blockers.push({ code: "word_role_conflict", detail: word.slotId });
      }
    }
  }

  const activityIds = new Set<string>();
  const orders = new Set<number>();
  const itemBindings = new Set<string>();
  for (const activity of snapshot.activities) {
    if (activityIds.has(activity.activityId)) blockers.push({ code: "duplicate_activity_id", detail: activity.activityId });
    if (orders.has(activity.order)) blockers.push({ code: "duplicate_activity_order", detail: `${activity.order}` });
    activityIds.add(activity.activityId);
    orders.add(activity.order);
    if (activity.wordSlotIds.some((slotId) => !slotIds.has(slotId))) {
      blockers.push({ code: "missing_word_binding", detail: activity.activityId });
    }
    if (!Array.isArray(activity.assignmentItemIds) || activity.assignmentItemIds.length === 0) {
      blockers.push({ code: "missing_item_binding", detail: activity.activityId });
    }
    for (const itemId of activity.assignmentItemIds) {
      if (itemBindings.has(itemId)) blockers.push({ code: "duplicate_item_binding", detail: itemId });
      itemBindings.add(itemId);
    }
    const contractKey = wordLabActivityContractKey(activity.kind, activity.contractVersion);
    if (context.supportedActivityContracts && !context.supportedActivityContracts.has(contractKey)) {
      blockers.push({ code: "unknown_activity_plugin", detail: contractKey });
    }
    if (recipe) {
      const definition = recipe.activities.find((candidate) => candidate.activityKey === activity.activityKey);
      if (!definition || definition.kind !== activity.kind || definition.contractVersion !== activity.contractVersion) {
        blockers.push({ code: "activity_contract_mismatch", detail: activity.activityKey });
      } else {
        const matchingSlots = snapshot.words
          .filter((word) => word.roles.some((role) => definition.words.roles.includes(role)))
          .map((word) => word.slotId);
        if (
          activity.wordSlotIds.length < definition.words.min ||
          activity.wordSlotIds.length > definition.words.max ||
          activity.wordSlotIds.some((slotId) => !matchingSlots.includes(slotId)) ||
          (definition.words.includeAllMatching === true && (
            activity.wordSlotIds.length !== matchingSlots.length ||
            matchingSlots.some((slotId) => !activity.wordSlotIds.includes(slotId))
          ))
        ) blockers.push({ code: "activity_selector_failed", detail: activity.activityKey });
      }
    }
  }
  if (recipe) {
    for (const required of recipe.activities.filter((activity) => activity.requiredForCompletion)) {
      if (!snapshot.activities.some((activity) => activity.activityKey === required.activityKey)) {
        blockers.push({ code: "activity_contract_mismatch", detail: required.activityKey });
      }
    }
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.fingerprint) || fingerprintSnapshotValue(snapshotWithoutFingerprint(snapshot)) !== snapshot.fingerprint) {
    blockers.push({ code: "snapshot_fingerprint_mismatch" });
  }
  return blockers.length === 0 ? { ok: true, snapshot } : { ok: false, blockers };
}
