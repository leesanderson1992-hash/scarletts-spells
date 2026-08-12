export const ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION = 1 as const;

export type AdleChildAllowlistActivationScopeV1 = {
  schemaVersion: typeof ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION;
  scope: {
    kind: "child_allowlist";
    childIds: readonly string[];
  };
  emergencyDisableAvailable: true;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Shared fail-closed operational scope. Release authority and route
 * capability remain independent requirements. */
export function activationAllowsChild(
  readinessReport: unknown,
  childId: string,
): boolean {
  if (!readinessReport || typeof readinessReport !== "object" || Array.isArray(readinessReport)) return false;
  const report = readinessReport as Partial<AdleChildAllowlistActivationScopeV1>;
  return report.schemaVersion === ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION &&
    report.emergencyDisableAvailable === true &&
    report.scope?.kind === "child_allowlist" &&
    Array.isArray(report.scope.childIds) &&
    report.scope.childIds.length > 0 &&
    report.scope.childIds.every((id) => typeof id === "string" && UUID.test(id)) &&
    new Set(report.scope.childIds).size === report.scope.childIds.length &&
    report.scope.childIds.includes(childId);
}

export function childAllowlistActivationReport(
  childIds: readonly string[],
): AdleChildAllowlistActivationScopeV1 {
  const unique = [...new Set(childIds)];
  if (unique.length === 0 || unique.some((id) => !UUID.test(id))) {
    throw new Error("ADLE activation requires a valid non-empty child allowlist.");
  }
  return {
    schemaVersion: ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION,
    scope: { kind: "child_allowlist", childIds: unique },
    emergencyDisableAvailable: true,
  };
}
