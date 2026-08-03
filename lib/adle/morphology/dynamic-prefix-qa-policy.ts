export const DYNAMIC_PREFIX_QA_PATH = "/admin/adle-dynamic-prefix-qa";
export const DYNAMIC_PREFIX_QA_FEATURE_FLAG = "ADLE_DYNAMIC_PREFIX_QA_ENABLED";
export const DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF = "jlhotktspjvffslvuyfz";
export const DYNAMIC_PREFIX_QA_PRODUCTION_SUPABASE_REF = "wwohrqtunajrbwxyssjf";
export const DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT = "scarletts-spells-staged";
export const DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID = "prj_oJkffstOtacc4juYloXajHpjJUha";
export const DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL = "scarletts-spells-staged.vercel.app";
export const DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT = "scarletts-spells";
export const DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl";

type QaEnvironment = { [key: string]: string | undefined };

function csv(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

export function isPinnedDynamicPrefixQaEnvironment(env: QaEnvironment): boolean {
  if (
    env.ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID === DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT_ID
    || env.ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_NAME === DYNAMIC_PREFIX_QA_PRODUCTION_VERCEL_PROJECT
  ) return false;
  if (
    env.ADLE_DYNAMIC_PREFIX_QA_ENABLED !== "enabled"
    || env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT !== "staging"
    || env.ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_ID !== DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT_ID
    || env.ADLE_DYNAMIC_PREFIX_QA_VERCEL_PROJECT_NAME !== DYNAMIC_PREFIX_QA_STAGING_VERCEL_PROJECT
    || env.VERCEL_PROJECT_PRODUCTION_URL !== DYNAMIC_PREFIX_QA_STAGING_VERCEL_PRODUCTION_URL
  ) return false;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === `${DYNAMIC_PREFIX_QA_STAGING_SUPABASE_REF}.supabase.co`
      && !hostname.includes(DYNAMIC_PREFIX_QA_PRODUCTION_SUPABASE_REF);
  } catch {
    return false;
  }
}

function decodedPathname(pathname: string): string {
  let decoded = pathname;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  const withoutTrailingSlashes = decoded.replace(/\/+$/, "");
  return withoutTrailingSlashes || "/";
}

/** Exact launcher surface only; query/RSC variants retain this pathname. */
export function isDynamicPrefixQaLauncherPath(pathname: string): boolean {
  return decodedPathname(pathname) === DYNAMIC_PREFIX_QA_PATH;
}

/**
 * The staging project's stable alias also has VERCEL_ENV=production, so its
 * complete pinned identity takes precedence. Every other Vercel production
 * deployment denies the exact launcher surface before authentication.
 */
export function shouldPreAuthNotFoundDynamicPrefixQa(
  pathname: string,
  env: QaEnvironment,
): boolean {
  return isDynamicPrefixQaLauncherPath(pathname)
    && env.VERCEL_ENV === "production"
    && !isPinnedDynamicPrefixQaEnvironment(env);
}

export function isDynamicPrefixQaUserAuthorized(params: {
  userId: string;
  isAdmin: boolean;
  qaUserIds: string | undefined;
}): boolean {
  return params.isAdmin || csv(params.qaUserIds).has(params.userId);
}
