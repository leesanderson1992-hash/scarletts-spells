import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "../morphology/dynamic-suffix-profile-keys";
import { getNewAssignmentCurriculumRouteForMicroSkill } from "../curriculum-readiness/route-registry";

export const DYNAMIC_PREFIX_INTAKE_ROUTE_ID = "dynamic_prefix_word_lab";
export const DYNAMIC_PREFIX_INTAKE_ROUTE_VERSION = "v2";
export const DYNAMIC_AFFIX_INTAKE_ROUTE_ID = "dynamic_affix_word_lab";
export const DYNAMIC_AFFIX_INTAKE_ROUTE_VERSION = "v3";
export const GENERIC_ADLE_INTAKE_ROUTE_ID = "adle_word_level";
export const GENERIC_ADLE_INTAKE_ROUTE_VERSION = "v1";

export function isDynamicPrefixIntakeSkill(microSkillKey: string): boolean {
  return microSkillKey.startsWith("D4_MOR_PREFIXES_");
}

/** Only the reviewed, compiler-supported suffix profiles own the Affix V3 route. */
export function isDynamicAffixIntakeSkill(microSkillKey: string): boolean {
  return (DYNAMIC_SUFFIX_PROFILE_KEYS as readonly string[]).includes(microSkillKey);
}

/** Base Word ownership is declared only by the central route registry. */
export function isBaseWordIntakeSkill(microSkillKey: string): boolean {
  const route = getNewAssignmentCurriculumRouteForMicroSkill(microSkillKey);
  return route?.payloadKind === "base_word_family_snapshot_v1" &&
    route.activationAuthority === "database_route_activation";
}

export function resolveCanonicalIntakeRoute(microSkillKey: string): {
  routeId: string;
  routeVersion: string;
} {
  if (isDynamicPrefixIntakeSkill(microSkillKey)) {
    return {
        routeId: DYNAMIC_PREFIX_INTAKE_ROUTE_ID,
        routeVersion: DYNAMIC_PREFIX_INTAKE_ROUTE_VERSION,
      };
  }
  if (isDynamicAffixIntakeSkill(microSkillKey)) {
    return {
      routeId: DYNAMIC_AFFIX_INTAKE_ROUTE_ID,
      routeVersion: DYNAMIC_AFFIX_INTAKE_ROUTE_VERSION,
    };
  }
  if (isBaseWordIntakeSkill(microSkillKey)) {
    const route = getNewAssignmentCurriculumRouteForMicroSkill(microSkillKey);
    if (!route) throw new Error(`Base Word route disappeared for ${microSkillKey}`);
    return { routeId: route.routeId, routeVersion: route.routeVersion };
  }
  return {
    routeId: GENERIC_ADLE_INTAKE_ROUTE_ID,
    routeVersion: GENERIC_ADLE_INTAKE_ROUTE_VERSION,
  };
}
