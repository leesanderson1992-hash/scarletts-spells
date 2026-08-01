import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import {
  WORD_LAB_COMPILER_VERSION,
  WORD_LAB_RESUME_SCHEMA_VERSION,
  WORD_LAB_SNAPSHOT_SCHEMA_VERSION,
  WORD_LAB_VALIDATOR_VERSION,
  type CompileWordLabInputV1,
  type CompiledWordLabSnapshotV1,
  type WordLabBlocker,
  type WordLabCompileResult,
  type WordLabDeclarativeCondition,
  type WordLabRecipeDefinitionV1,
  type WordLabSelectedWordV1,
  type WordLabWordRole,
  type WordLabWordSelector,
} from "./contracts";
import { validateWordLabRecipeRegistry } from "./recipe-registry";
import { validateCompiledWordLabSnapshot } from "./snapshot-validator";

function selectWords(words: readonly WordLabSelectedWordV1[], selector: WordLabWordSelector) {
  return words.filter((word) => word.roles.some((role) => selector.roles.includes(role)));
}

function conditionMet(
  condition: WordLabDeclarativeCondition,
  words: readonly WordLabSelectedWordV1[],
  recipe: WordLabRecipeDefinitionV1,
): boolean {
  switch (condition.kind) {
    case "always": return true;
    case "word_count_at_least": return words.length >= condition.count;
    case "coverage_present": return words.some((word) => Boolean(word.coverage[condition.coverageKey]));
    case "recipe_flag": return recipe.flags?.[condition.key] === condition.equals;
  }
}

function roleCount(words: readonly WordLabSelectedWordV1[], role: WordLabWordRole): number {
  return words.filter((word) => word.roles.includes(role)).length;
}

function roleValue<T extends string>(
  roles: readonly WordLabWordRole[],
  values: Readonly<Partial<Record<WordLabWordRole, T>>>,
  fallback: T,
): T | null {
  const resolved = [...new Set(roles.map((role) => values[role]).filter((value): value is T => value !== undefined))];
  return resolved.length > 1 ? null : resolved[0] ?? fallback;
}

function validateSelection(input: CompileWordLabInputV1): WordLabBlocker[] {
  const blockers: WordLabBlocker[] = [];
  const requirements = input.recipe.wordRequirements;
  if (input.selectedWords.length < requirements.lesson.min || input.selectedWords.length > requirements.lesson.max) {
    blockers.push({ code: "invalid_word_count", detail: `${input.selectedWords.length}` });
  }
  const roleRanges: readonly [WordLabWordRole, { min: number; max: number }][] = [
    ["authentic_target", requirements.authentic],
    ["transfer", requirements.transfer],
    ["practice", requirements.practice],
  ];
  for (const [role, range] of roleRanges) {
    const count = roleCount(input.selectedWords, role);
    if (count < range.min || count > range.max) blockers.push({ code: "invalid_word_role_count", detail: `${role}:${count}` });
  }
  for (const word of input.selectedWords) {
    const primaryRoles = word.roles.filter((role) => ["authentic_target", "transfer", "practice"].includes(role));
    if (primaryRoles.length !== 1 || new Set(word.roles).size !== word.roles.length) {
      blockers.push({ code: "word_role_conflict", detail: word.canonicalWordId });
    }
  }
  for (const coverage of requirements.coverage) {
    const distinct = new Set(input.selectedWords.map((word) => word.coverage[coverage.key]).filter(Boolean));
    if (distinct.size < coverage.minDistinct) {
      blockers.push({ code: "coverage_requirement_failed", detail: `${coverage.key}:${distinct.size}` });
    }
  }
  return blockers;
}

export function fingerprintWordLabRecipe(recipe: WordLabRecipeDefinitionV1): string {
  return fingerprintSnapshotValue(recipe);
}

export function fingerprintCompiledWordLabSnapshot(
  snapshot: Omit<CompiledWordLabSnapshotV1, "fingerprint">,
): string {
  return fingerprintSnapshotValue(snapshot);
}

/** Pure boundary: the caller has already selected the microskill and words. */
export function compileWordLabSnapshot(input: CompileWordLabInputV1): WordLabCompileResult {
  const blockers: WordLabBlocker[] = validateWordLabRecipeRegistry([input.recipe]).map((detail) => ({
    code: "malformed_recipe" as const,
    detail,
  }));
  if (
    input.recipe.compatibility.familyKey !== input.taxonomy.familyKey ||
    (!input.recipe.compatibility.clusterKeys.includes(input.taxonomy.clusterKey) && input.recipe.compatibility.clusterKeys.length > 0) ||
    (input.recipe.compatibility.microSkillKeys !== undefined && !input.recipe.compatibility.microSkillKeys.includes(input.taxonomy.microSkillKey))
  ) blockers.push({ code: "recipe_taxonomy_mismatch" });
  blockers.push(...validateSelection(input));

  const words: CompiledWordLabSnapshotV1["words"][number][] = [];
  for (const [index, word] of input.selectedWords.entries()) {
    const schedulingRole = roleValue(word.roles, input.recipe.scheduling.roles, "none");
    const rewardRole = roleValue(word.roles, input.recipe.rewards.roles, "ineligible");
    if (schedulingRole === null || rewardRole === null) {
      blockers.push({ code: "word_role_conflict", detail: word.canonicalWordId });
      continue;
    }
    words.push({
      slotId: `word:${index + 1}:${word.canonicalWordId}`,
      ...word,
      schedulingRole,
      rewardRole,
    });
  }

  const activities: CompiledWordLabSnapshotV1["activities"][number][] = [];
  const usedItemBindings = new Set<string>();
  for (const activity of [...input.recipe.activities].sort((left, right) => left.order - right.order)) {
    if (!conditionMet(activity.condition, input.selectedWords, input.recipe)) continue;
    const selected = selectWords(input.selectedWords, activity.words);
    if (selected.length < activity.words.min || selected.length > activity.words.max) {
      blockers.push({ code: "activity_selector_failed", detail: activity.activityKey });
      continue;
    }
    const assignmentItemIds = input.assignmentItemIdsByActivityKey[activity.activityKey];
    if (!assignmentItemIds || assignmentItemIds.length === 0) {
      blockers.push({ code: "missing_item_binding", detail: activity.activityKey });
      continue;
    }
    if (assignmentItemIds.some((id) => usedItemBindings.has(id))) {
      blockers.push({ code: "duplicate_item_binding", detail: activity.activityKey });
      continue;
    }
    assignmentItemIds.forEach((id) => usedItemBindings.add(id));
    const selectedIds = new Set(selected.map((word) => word.canonicalWordId));
    activities.push({
      activityId: `activity:${activity.order}:${activity.activityKey}`,
      activityKey: activity.activityKey,
      kind: activity.kind,
      contractVersion: activity.contractVersion,
      order: activity.order,
      wordSlotIds: words.filter((word) => selectedIds.has(word.canonicalWordId)).map((word) => word.slotId),
      assignmentItemIds: [...assignmentItemIds],
      config: activity.config,
      answerVisibility: activity.answerVisibility,
      evidenceMode: activity.evidenceMode,
      requiredForCompletion: activity.requiredForCompletion,
    });
  }
  if (blockers.length > 0) return { ok: false, blockers };

  const draft: Omit<CompiledWordLabSnapshotV1, "fingerprint"> = {
    schemaVersion: WORD_LAB_SNAPSHOT_SCHEMA_VERSION,
    compilerVersion: WORD_LAB_COMPILER_VERSION,
    validatorVersion: WORD_LAB_VALIDATOR_VERSION,
    assignmentId: input.assignmentId,
    childId: input.childId,
    assignmentDate: input.assignmentDate,
    route: {
      routeKey: input.recipe.compatibility.routeKey,
      routeVersion: input.recipe.compatibility.routeVersion,
      rendererKey: "common_word_lab",
    },
    recipe: {
      recipeKey: input.recipe.identity.recipeKey,
      recipeVersion: input.recipe.identity.recipeVersion,
      definitionFingerprint: fingerprintWordLabRecipe(input.recipe),
    },
    taxonomy: input.taxonomy,
    resolvedWordRequirements: input.recipe.wordRequirements,
    words,
    activities,
    probe: input.recipe.probe,
    completion: input.recipe.completion,
    content: input.content,
    policies: {
      selectionPolicyVersion: input.selectionPolicyVersion,
      bandingPolicyVersion: input.recipe.wordRequirements.bandingPolicyVersion,
      taughtHistoryPolicyVersion: input.recipe.wordRequirements.taughtHistoryPolicyVersion,
      evidencePolicyVersion: input.evidencePolicyVersion,
      schedulingPolicyVersion: input.recipe.scheduling.policyVersion,
      rewardPolicyVersion: input.recipe.rewards.policyVersion,
      resumeSchemaVersion: WORD_LAB_RESUME_SCHEMA_VERSION,
    },
    provenance: {
      selectedLearningItemIds: [...new Set(input.selectedWords.map((word) => word.learningItemId).filter((id): id is string => id !== null))].sort(),
      compiledAt: input.compiledAt,
    },
  };
  const snapshot: CompiledWordLabSnapshotV1 = { ...draft, fingerprint: fingerprintCompiledWordLabSnapshot(draft) };
  return validateCompiledWordLabSnapshot(snapshot, { recipe: input.recipe });
}
