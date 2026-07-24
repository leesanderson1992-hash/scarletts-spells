export type AdleRouteActivationEnvironment = "local" | "staging" | "production";

const ENVIRONMENTS = new Set<AdleRouteActivationEnvironment>([
  "local",
  "staging",
  "production",
]);

/** An absent or malformed setting is deliberately equivalent to no activation. */
export function parseAdleRouteActivationEnvironment(
  value: string | undefined,
): AdleRouteActivationEnvironment | null {
  return ENVIRONMENTS.has(value as AdleRouteActivationEnvironment)
    ? value as AdleRouteActivationEnvironment
    : null;
}

export function resolveAdleRouteActivationEnvironment(): AdleRouteActivationEnvironment | null {
  return parseAdleRouteActivationEnvironment(
    process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,
  );
}
