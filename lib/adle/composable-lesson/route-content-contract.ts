import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  type CurriculumRouteDefinition,
} from "../curriculum-readiness/route-registry";
import {
  ACTIVITY_REQUIREMENT_REGISTRY_VERSION,
  getActivityRequirement,
} from "./activity-requirements";
import {
  ACTIVITY_VARIANT_INVENTORY_VERSION,
  activityVariantsForRoute,
} from "./activity-variants";

/** A read-only description of the facts the registered route actually asks for.
 * The native compiler and release authority remain the admission gate. */
export const ROUTE_CONTENT_CONTRACT_VERSION = "adle_route_content_contract_v1" as const;

export type RouteContentContract = {
  contractVersion: typeof ROUTE_CONTENT_CONTRACT_VERSION;
  activityRequirementVersion: typeof ACTIVITY_REQUIREMENT_REGISTRY_VERSION;
  activityVariantVersion: typeof ACTIVITY_VARIANT_INVENTORY_VERSION;
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  runtimeAdapterKey: CurriculumRouteDefinition["runtimeAdapterKey"];
  activationAuthority: CurriculumRouteDefinition["activationAuthority"];
  wordSupportAuthority: NonNullable<CurriculumRouteDefinition["wordSupportAuthority"]>;
  canonicalContentAuthority: NonNullable<CurriculumRouteDefinition["canonicalContentAuthority"]>;
  requiresAuthenticSelectableItem: boolean;
  wordCounts: CurriculumRouteDefinition["wordCounts"];
  coverageRequirements: CurriculumRouteDefinition["coverageRequirements"];
  activities: Array<{
    position: number;
    kind: CurriculumRouteDefinition["requiredActivities"][number];
    variantKey: string;
    wordScope: ReturnType<typeof activityVariantsForRoute>[number]["wordScope"];
    conditional: boolean;
    enabled: boolean;
    requiredFacts: ReturnType<typeof activityVariantsForRoute>[number]["requiredFacts"];
    optionalFacts: ReturnType<typeof activityVariantsForRoute>[number]["optionalFacts"];
    roleRequirements: NonNullable<ReturnType<typeof getActivityRequirement>>["roleRequirements"];
    contradictionRules: NonNullable<ReturnType<typeof getActivityRequirement>>["contradictionRules"];
    compiledOnlyFields: NonNullable<ReturnType<typeof getActivityRequirement>>["compiledOnlyFields"];
  }>;
};

export function routeContentContractFor(
  routeId: string,
  microSkillKey: string,
): RouteContentContract | null {
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((item) => item.routeId === routeId
    && (item.compatibilityScope.kind === "generic_composer_fallback"
      || item.supportedMicroSkillKeys.includes(microSkillKey)));
  if (!route) return null;
  const variants = activityVariantsForRoute(routeId, microSkillKey);
  if (variants.length === 0) return null;
  return {
    contractVersion: ROUTE_CONTENT_CONTRACT_VERSION,
    activityRequirementVersion: ACTIVITY_REQUIREMENT_REGISTRY_VERSION,
    activityVariantVersion: ACTIVITY_VARIANT_INVENTORY_VERSION,
    routeId: route.routeId,
    routeVersion: route.routeVersion,
    microSkillKey,
    runtimeAdapterKey: route.runtimeAdapterKey,
    activationAuthority: route.activationAuthority,
    wordSupportAuthority: route.wordSupportAuthority ?? "canonical_word_support",
    canonicalContentAuthority: route.canonicalContentAuthority ?? "canonical_dictionary",
    requiresAuthenticSelectableItem: route.requiresAuthenticSelectableItem,
    wordCounts: route.wordCounts,
    coverageRequirements: route.coverageRequirements,
    activities: variants.map((variant, position) => {
      const definition = getActivityRequirement(variant.kind);
      if (!definition) throw new Error(`ACTIVITY_REQUIREMENT_MISSING:${variant.kind}`);
      return {
        position,
        kind: variant.kind,
        variantKey: variant.variantKey,
        wordScope: variant.wordScope,
        conditional: variant.conditional,
        enabled: variant.enabled,
        requiredFacts: variant.requiredFacts,
        optionalFacts: variant.optionalFacts,
        roleRequirements: definition.roleRequirements,
        contradictionRules: definition.contradictionRules,
        compiledOnlyFields: definition.compiledOnlyFields,
      };
    }),
  };
}

/** The generic contract uses a sentinel skill solely for documentation.
 * Runtime callers pass the actual skill to routeContentContractFor. */
export function routeContentContractInventory(): RouteContentContract[] {
  return ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap((route) => {
    const skills = route.compatibilityScope.kind === "generic_composer_fallback"
      ? ["generic_composer_fallback"] : route.supportedMicroSkillKeys;
    return skills.map((skill) => {
      const contract = routeContentContractFor(route.routeId, skill);
      if (!contract) throw new Error(`ROUTE_CONTENT_CONTRACT_MISSING:${route.routeId}:${skill}`);
      return contract;
    });
  });
}
