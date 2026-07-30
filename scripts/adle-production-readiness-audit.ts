import {
  auditProductionReadiness,
  readinessAuditMarkdown,
  type ReadinessAuditMode,
} from "../lib/adle/composable-lesson/readiness-audit";
import { buildRepositoryReadinessInput } from "../lib/adle/composable-lesson/repository-readiness";
import { resolveLiveReadinessAuditConfig } from "../lib/adle/composable-lesson/live-audit-config";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const mode = (option("--mode") ?? "repository/report") as ReadinessAuditMode;
  const format = option("--format") ?? "json";
  if (!["repository/report", "live/report", "live/strict"].includes(mode)) {
    throw new Error(`Unsupported audit mode: ${mode}`);
  }
  if (!["json", "markdown"].includes(format)) {
    throw new Error(`Unsupported audit format: ${format}`);
  }
  const source =
    mode === "repository/report"
      ? buildRepositoryReadinessInput(mode)
      : await loadLive(mode);
  const audit = auditProductionReadiness(source);
  process.stdout.write(
    format === "markdown"
      ? readinessAuditMarkdown(audit)
      : `${JSON.stringify(audit, null, 2)}\n`,
  );
  if (
    mode === "live/strict" &&
    (audit.summary.blockedCount > 0 || audit.summary.notAssessedCount > 0)
  ) {
    process.exitCode = 1;
  }
}

async function loadLive(
  mode: Extract<ReadinessAuditMode, "live/report" | "live/strict">,
) {
  const config = resolveLiveReadinessAuditConfig({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    acknowledgedProductionHost:
      process.env.ADLE_READINESS_AUDIT_PRODUCTION_HOST,
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  const { buildLiveReadinessInput } = await import(
    "../lib/adle/composable-lesson/live-readiness-adapter"
  );
  return buildLiveReadinessInput({ config, serviceRoleKey, mode });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
