/** Closed-by-default, independently deployable Suffix Word Lab gate. */
export function isDynamicSuffixRouteEnabled(): boolean {
  return process.env.VERCEL_ENV === "production"
    ? process.env.ADLE_DYNAMIC_SUFFIX_PRODUCTION_ENABLED === "enabled"
    : process.env.VERCEL_ENV === "preview" && process.env.ADLE_DYNAMIC_SUFFIX_STAGING_ENABLED === "enabled";
}
