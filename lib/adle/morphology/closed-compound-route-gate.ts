/**
 * The staging project is deployed through Vercel's production target, so
 * VERCEL_ENV cannot distinguish it from the real production application.
 * The real production application needs its own explicit release marker.
 */
export function isClosedCompoundRouteEnabled(): boolean {
  if (process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT === "staging") {
    return true;
  }
  return process.env.VERCEL_ENV === "production"
    && process.env.ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED === "enabled";
}
