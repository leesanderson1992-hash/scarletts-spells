export const ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION = 1 as const;

export type AdleChildAllowlistActivationScopeV1 = {
  schemaVersion: typeof ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION;
  scope: {
    kind: "child_allowlist";
    childIds: readonly string[];
  };
  emergencyDisableAvailable: true;
};

export type AdleAllEligibleActivationScopeV1 = {
  schemaVersion: typeof ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION;
  scope: {
    kind: "all_eligible";
  };
  emergencyDisableAvailable: true;
};

export type AdleRouteActivationScopeV1 =
  | AdleChildAllowlistActivationScopeV1
  | AdleAllEligibleActivationScopeV1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Shared fail-closed operational scope. Release authority and route
 * capability remain independent requirements. */
export function activationAllowsChild(
  readinessReport: unknown,
  childId: string,
): boolean {
  if (!UUID.test(childId) || !readinessReport || typeof readinessReport !== "object" || Array.isArray(readinessReport)) return false;
  const report = readinessReport as Partial<AdleRouteActivationScopeV1>;
  if (
    report.schemaVersion !== ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION ||
    report.emergencyDisableAvailable !== true ||
    !report.scope
  ) return false;
  if (report.scope.kind === "all_eligible") {
    return Object.keys(report.scope).length === 1;
  }
  return report.scope.kind === "child_allowlist" &&
    Array.isArray(report.scope.childIds) &&
    report.scope.childIds.length > 0 &&
    report.scope.childIds.every((id) => typeof id === "string" && UUID.test(id)) &&
    new Set(report.scope.childIds).size === report.scope.childIds.length &&
    report.scope.childIds.includes(childId);
}

export function allEligibleActivationReport(): AdleAllEligibleActivationScopeV1 {
  return {
    schemaVersion: ADLE_CHILD_ALLOWLIST_SCOPE_SCHEMA_VERSION,
    scope: { kind: "all_eligible" },
    emergencyDisableAvailable: true,
  };
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
