export const DYNAMIC_PREFIX_INTAKE_ROUTE_ID = "dynamic_prefix_word_lab";
export const DYNAMIC_PREFIX_INTAKE_ROUTE_VERSION = "v2";
export const GENERIC_ADLE_INTAKE_ROUTE_ID = "adle_word_level";
export const GENERIC_ADLE_INTAKE_ROUTE_VERSION = "v1";

export function isDynamicPrefixIntakeSkill(microSkillKey: string): boolean {
  return microSkillKey.startsWith("D4_MOR_PREFIXES_");
}

export function resolveCanonicalIntakeRoute(microSkillKey: string): {
  routeId: string;
  routeVersion: string;
} {
  return isDynamicPrefixIntakeSkill(microSkillKey)
    ? {
        routeId: DYNAMIC_PREFIX_INTAKE_ROUTE_ID,
        routeVersion: DYNAMIC_PREFIX_INTAKE_ROUTE_VERSION,
      }
    : {
        routeId: GENERIC_ADLE_INTAKE_ROUTE_ID,
        routeVersion: GENERIC_ADLE_INTAKE_ROUTE_VERSION,
      };
}
