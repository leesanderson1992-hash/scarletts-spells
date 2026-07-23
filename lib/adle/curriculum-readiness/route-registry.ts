/**
 * Declarative implementation inventory for the central curriculum-readiness
 * reader. This is not an activation switch: observed activation facts are
 * supplied separately. New assignment writers must not consume this file as
 * permission to write.
 */

export type CurriculumRouteImplementationState =
  | "registered"
  | "legacy_render_only";

export interface CurriculumRouteDefinition {
  routeId: string;
  routeVersion: string;
  supportedMicroSkillKeys: readonly string[];
  implementationState: CurriculumRouteImplementationState;
  /** Route code can compile new assignments only after observed gates allow it. */
  newAssignmentCapable: boolean;
  requiresAuthenticSelectableItem: boolean;
}

export const ADLE_CURRICULUM_ROUTE_REGISTRY: readonly CurriculumRouteDefinition[] = [
  {
    routeId: "base_word_lab",
    routeVersion: "v2",
    supportedMicroSkillKeys: [
      "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
      "D4_MOR_BASE_WORDS_PRESERVE_BASE",
    ],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
  },
  {
    routeId: "dynamic_prefix_word_lab",
    routeVersion: "v2",
    supportedMicroSkillKeys: [
      "D4_MOR_PREFIXES_DIS_MIS",
      "D4_MOR_PREFIXES_IN_IM_IL_IR",
      "D4_MOR_PREFIXES_RE_PRE",
      "D4_MOR_PREFIXES_SUB_INTER_SUPER",
      "D4_MOR_PREFIXES_UN",
    ],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
  },
  {
    routeId: "fixed_un_prefix_word_lab",
    routeVersion: "v1",
    supportedMicroSkillKeys: ["D4_MOR_PREFIXES_UN"],
    implementationState: "legacy_render_only",
    newAssignmentCapable: false,
    requiresAuthenticSelectableItem: false,
  },
] as const;

export function validateCurriculumRouteRegistry(
  routes: readonly CurriculumRouteDefinition[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.routeId}\u0000${route.routeVersion}`;
    if (!route.routeId || !route.routeVersion || seen.has(key)) {
      errors.push(`invalid_or_duplicate_route:${key}`);
    }
    seen.add(key);
    if (route.supportedMicroSkillKeys.length === 0) {
      errors.push(`route_without_supported_skills:${key}`);
    }
    if (
      [...route.supportedMicroSkillKeys].some(
        (skill, index, skills) => !skill || (index > 0 && skills[index - 1] >= skill),
      )
    ) {
      errors.push(`route_skills_not_strictly_sorted:${key}`);
    }
    if (
      !["registered", "legacy_render_only"].includes(
        route.implementationState,
      )
    ) {
      errors.push(`unknown_route_implementation_state:${key}`);
    }
  }
  return errors.sort();
}
