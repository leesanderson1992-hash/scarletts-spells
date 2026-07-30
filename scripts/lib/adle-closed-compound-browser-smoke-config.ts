export const ADLE_STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
export const ADLE_STAGING_SUPABASE_HOST = `${ADLE_STAGING_PROJECT_REF}.supabase.co`;
export const ADLE_PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";

export type ClosedCompoundBrowserSmokeMode = "setup" | "cleanup";

export interface ClosedCompoundBrowserSmokeConfig {
  mode: ClosedCompoundBrowserSmokeMode;
  password: string;
  serviceRoleKey: string;
  url: string;
}

export function assertClosedCompoundBrowserSmokeStagingProject(
  rawUrl: string | undefined,
): string {
  if (!rawUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL; refusing to start the staging browser smoke.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL; refusing to start the staging browser smoke.");
  }

  if (url.hostname !== ADLE_STAGING_SUPABASE_HOST) {
    throw new Error(
      `Closed Compound staging browser smoke requires ${ADLE_STAGING_PROJECT_REF}; received ${url.hostname}.`,
    );
  }

  return url.toString();
}

/**
 * Resolve and validate the complete fixture configuration before a Supabase
 * client is created or either mutating mode can be dispatched.
 */
export function resolveClosedCompoundBrowserSmokeConfig(
  environment: NodeJS.ProcessEnv,
  rawMode: string | undefined,
): ClosedCompoundBrowserSmokeConfig {
  const url = assertClosedCompoundBrowserSmokeStagingProject(
    environment.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceRoleKey =
    environment.SB_SERVICE_ROLE_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  const password = environment.ADLE_BROWSER_SMOKE_PASSWORD;

  if (!serviceRoleKey || !password) {
    throw new Error(
      "Set SUPABASE_SERVICE_ROLE_KEY and ADLE_BROWSER_SMOKE_PASSWORD for the verified staging project.",
    );
  }
  if (rawMode !== "setup" && rawMode !== "cleanup") {
    throw new Error("Use setup or cleanup.");
  }

  return { mode: rawMode, password, serviceRoleKey, url };
}
