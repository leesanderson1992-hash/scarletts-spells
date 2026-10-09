import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../curriculum-readiness/route-registry";
import { getSharedAffixProfileMapping } from "../morphology/shared-affix-profile-registry";
import {
  getActivityRequirement,
  type ActivityFactRequirement,
} from "./activity-requirements";
import type { LessonActivityKind } from "./contracts";

/**
 * The route's actual question plan is more precise than a list of activity
 * kinds. In particular, conditional meaning tasks and the words chosen for
 * Cleaver or Build must never be treated as requirements on every word.
 */
export const ACTIVITY_VARIANT_INVENTORY_VERSION =
  "adle_activity_variant_inventory_v1" as const;

export type ActivityWordScope =
  | "no_word"
  | "all_lesson_words"
  | "selected_examples"
  | "independent_words";

export type ActivityVariant = {
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  kind: LessonActivityKind;
  variantKey: string;
  wordScope: ActivityWordScope;
  conditional: boolean;
  enabled: boolean;
  requiredFacts: readonly ActivityFactRequirement[];
  /** The current specialist compiler owns answer construction and validation. */
  compilerAdapter: string;
  validatorAdapter: string;
};

const NO_WORD = new Set<LessonActivityKind>(["introduction", "reflection"]);
const INDEPENDENT = new Set<LessonActivityKind>([
  "cover_check", "dictation", "must_use_writing", "diagnostic_probe",
]);
const SELECTED = new Set<LessonActivityKind>([
  "cleaver", "word_build", "guided_prompt", "family_reveal",
]);

function scope(kind: LessonActivityKind): ActivityWordScope {
  if (NO_WORD.has(kind)) return "no_word";
  if (INDEPENDENT.has(kind)) return "independent_words";
  if (SELECTED.has(kind)) return "selected_examples";
  return "all_lesson_words";
}

function variantKey(
  routeId: string,
  microSkillKey: string,
  kind: LessonActivityKind,
): string {
  if (routeId === "dynamic_prefix_word_lab") {
    const mapping = getSharedAffixProfileMapping(microSkillKey);
    if (kind === "meaning_sort" && mapping?.prefixPedagogy?.meaningCheckKind === "prefix_form") {
      return "prefix_form_choice";
    }
    if (kind === "cleaver") return "prefix_boundary";
    if (kind === "word_build") return "prefix_choice_and_build";
  }
  if (routeId === "dynamic_affix_word_lab") {
    if (kind === "cleaver") return "suffix_boundary";
    if (kind === "word_build") return "suffix_build";
    if (kind === "meaning_sort") return "suffix_meaning";
  }
  if (routeId === "base_word_lab") {
    if (kind === "cleaver") return microSkillKey.endsWith("PRESERVE_BASE")
      ? "preserve_base" : microSkillKey.endsWith("IDENTIFY_BASE")
        ? "identify_base" : "base_with_affix";
  }
  if (routeId === "compound_word_lab" && kind === "compound_jigsaw") {
    return microSkillKey.endsWith("SEPARATED_HYPHENATED")
      ? "spaced_or_hyphenated" : "closed";
  }
  if (routeId === "ing_endings_word_lab" && ["cleaver", "word_build"].includes(kind)) {
    return microSkillKey.replace(/^D4_INF_ING_ENDINGS_/, "").toLowerCase();
  }
  if (routeId === "comparative_superlative_word_lab"
    && ["cleaver", "word_build", "meaning_sort"].includes(kind)) {
    return microSkillKey.replace(/^D4_INF_COMPARATIVE_SUPERLATIVE_/, "").toLowerCase();
  }
  return "default";
}

export function activityVariantsForRoute(
  routeId: string,
  microSkillKey: string,
): readonly ActivityVariant[] {
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((candidate) =>
    candidate.routeId === routeId
    && (candidate.compatibilityScope.kind === "generic_composer_fallback"
      || candidate.supportedMicroSkillKeys.includes(microSkillKey)));
  if (!route) return [];
  const mapping = getSharedAffixProfileMapping(microSkillKey);
  const kinds = [...route.requiredActivities];
  if (routeId === "dynamic_affix_word_lab") {
    kinds.splice(kinds.indexOf("word_build"), 0, "meaning_sort");
  }
  return kinds.map((kind) => {
    const definition = getActivityRequirement(kind);
    if (!definition) throw new Error(`ACTIVITY_REQUIREMENT_MISSING:${kind}`);
    const conditional = routeId === "dynamic_affix_word_lab" && kind === "meaning_sort";
    return {
      routeId: route.routeId,
      routeVersion: route.routeVersion,
      microSkillKey,
      kind,
      variantKey: variantKey(routeId, microSkillKey, kind),
      wordScope: scope(kind),
      conditional,
      enabled: !conditional || mapping?.policy.meaning.kind === "sort_all_words",
      requiredFacts: route.compatibilityScope.kind === "generic_composer_fallback"
        ? definition.requiredFacts
        : definition.requiredFacts.map((fact) => fact.factKey === "word_micro_skill_support"
          ? { ...fact, factKey: "route_applicability" as const, owner: "reviewed_word_route_facts" as const }
          : fact),
      compilerAdapter: route.runtimeAdapterKey,
      validatorAdapter: route.runtimeAdapterKey,
    };
  });
}

export function validateActivityVariantInventory(): string[] {
  const errors: string[] = [];
  for (const route of ADLE_CURRICULUM_ROUTE_REGISTRY) {
    const skills = route.compatibilityScope.kind === "generic_composer_fallback"
      ? ["generic_composer_fallback"] : route.supportedMicroSkillKeys;
    for (const skill of skills) {
      const variants = activityVariantsForRoute(route.routeId, skill);
      if (variants.length === 0) errors.push(`route_without_activity_variants:${route.routeId}:${skill}`);
      if (new Set(variants.map((item) => item.kind)).size !== variants.length) {
        errors.push(`duplicate_activity_variant:${route.routeId}:${skill}`);
      }
      for (const variant of variants) {
        if (!variant.requiredFacts.length && variant.wordScope !== "no_word") {
          errors.push(`activity_without_facts:${route.routeId}:${skill}:${variant.kind}`);
        }
      }
    }
  }
  return errors;
}
