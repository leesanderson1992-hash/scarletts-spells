import { createClient } from "@supabase/supabase-js";

import { loadLearnerEvidenceProjection } from "../lib/adle/proficiency/evidence/repository";
import { formatSchedulerSimulationReport } from "../lib/adle/proficiency/scheduler-simulation/report";
import { loadSchedulerSimulation } from "../lib/adle/proficiency/scheduler-simulation/repository";
import { loadCanonicalWordSkillRelationshipAuthority } from "../lib/adle/word-skill-relationships/repository";

async function main() {
  if (!process.argv.includes("--live")) throw new Error("C2 reconciliation is a guarded live read. Use --live --environment local|staging|production --as-of YYYY-MM-DD.");
  const environmentArg = process.argv.indexOf("--environment");
  const environmentKey = process.argv[environmentArg + 1];
  const asOfArg = process.argv.indexOf("--as-of");
  const asOfOn = process.argv[asOfArg + 1];
  if (environmentArg < 0 || !["local", "staging", "production"].includes(environmentKey)) throw new Error("Use --environment local|staging|production");
  if (asOfArg < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(asOfOn ?? "")) throw new Error("Use --as-of YYYY-MM-DD");
  if (environmentKey === "production" && !process.argv.includes("--acknowledge-read-only-production")) throw new Error("Production simulation requires --acknowledge-read-only-production");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and a service-role read credential are required");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const relationshipAuthority = await loadCanonicalWordSkillRelationshipAuthority({
    client,
    environmentKey: environmentKey as "local" | "staging" | "production",
  });
  const phaseC = await loadLearnerEvidenceProjection({ client, relationshipAuthority });
  const result = await loadSchedulerSimulation({ client, phaseC, asOfOn });
  console.log(formatSchedulerSimulationReport(result, `${environmentKey} guarded SELECT-only facts as of ${asOfOn}`));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
