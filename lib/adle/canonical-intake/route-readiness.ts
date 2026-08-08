import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "../morphology/dynamic-suffix-profile-keys";

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
  return {
    routeId: GENERIC_ADLE_INTAKE_ROUTE_ID,
    routeVersion: GENERIC_ADLE_INTAKE_ROUTE_VERSION,
  };
}
