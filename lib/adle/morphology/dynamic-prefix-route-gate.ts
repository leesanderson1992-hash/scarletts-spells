/** Pure closed-by-default environment gate, shared by server runtime and CLI audits. */
export function isDynamicPrefixRouteEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") {
    return process.env.ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED === "enabled";
  }
  return process.env.VERCEL_ENV === "preview"
    && process.env.ADLE_DYNAMIC_PREFIX_STAGING_ENABLED === "enabled";
}
