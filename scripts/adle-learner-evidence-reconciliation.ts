import { createClient } from "@supabase/supabase-js";

import { loadLearnerEvidenceProjection } from "../lib/adle/proficiency/evidence/repository";
import { formatLearnerEvidenceReconciliationReport } from "../lib/adle/proficiency/evidence/report";
import { loadCanonicalWordSkillRelationshipAuthority } from "../lib/adle/word-skill-relationships/repository";

async function main() {
  if (!process.argv.includes("--live")) {
    throw new Error("Phase C reconciliation is a guarded live read. Use --live --environment local|staging|production.");
  }
  const environmentArg = process.argv.indexOf("--environment");
  const environmentKey = process.argv[environmentArg + 1];
  if (environmentArg < 0 || !["local", "staging", "production"].includes(environmentKey)) {
    throw new Error("Use --live --environment local|staging|production");
  }
  if (environmentKey === "production" && !process.argv.includes("--acknowledge-read-only-production")) {
    throw new Error("Production reconciliation requires --acknowledge-read-only-production");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SB_SERVICE_ROLE_KEY are required");
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const relationshipAuthority = await loadCanonicalWordSkillRelationshipAuthority({
    client,
    environmentKey: environmentKey as "local" | "staging" | "production",
  });
  const result = await loadLearnerEvidenceProjection({ client, relationshipAuthority });
  console.log(formatLearnerEvidenceReconciliationReport(
    result,
    `${environmentKey} guarded SELECT-only facts (no learner identities or writing text)`,
  ));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
