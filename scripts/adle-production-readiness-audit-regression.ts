import { strict as assert } from "node:assert";

import {
  auditProductionReadiness,
  READINESS_AUDIT_STAGES,
} from "../lib/adle/composable-lesson/readiness-audit";
import { buildRepositoryReadinessInput } from "../lib/adle/composable-lesson/repository-readiness";
import {
  ADLE_PRODUCTION_SUPABASE_HOST,
  assertLiveReadinessSelectAllowed,
  resolveLiveReadinessAuditConfig,
} from "../lib/adle/composable-lesson/live-audit-config";

const first = auditProductionReadiness(
  buildRepositoryReadinessInput("repository/report"),
);
const second = auditProductionReadiness(
  buildRepositoryReadinessInput("repository/report"),
);
assert.equal(JSON.stringify(first), JSON.stringify(second));
assert.equal(first.summary.productionMicroSkillCount, 18);
assert.equal(first.summary.structurallyDeclaredCount, 18);
assert(first.microSkills.every((entry) => entry.stages.length === 11));
assert.deepEqual(
  first.microSkills[0]?.stages.map((stage) => stage.stage),
  READINESS_AUDIT_STAGES,
);
assert.equal(first.containsLearnerIdentity, false);
assert.equal(first.containsRawAttempts, false);
assert.equal(first.mutationPerformed, false);
assert(
  first.knownReportOnlyFindings.some(
    (finding) => finding.code === "answer_comparator_mismatch",
  ),
);
assert(
  first.knownReportOnlyFindings.some(
    (finding) => finding.code === "transfer_not_approved",
  ),
);

assert.deepEqual(
  resolveLiveReadinessAuditConfig({
    supabaseUrl: `https://${ADLE_PRODUCTION_SUPABASE_HOST}`,
    acknowledgedProductionHost: ADLE_PRODUCTION_SUPABASE_HOST,
  }),
  {
    supabaseUrl: `https://${ADLE_PRODUCTION_SUPABASE_HOST}`,
    productionHost: ADLE_PRODUCTION_SUPABASE_HOST,
  },
);
for (const unsafe of [
  {},
  { supabaseUrl: "not-a-url" },
  { supabaseUrl: "https://jlhotktspjvffslvuyfz.supabase.co" },
  { supabaseUrl: "https://unknown.supabase.co" },
  { supabaseUrl: `https://${ADLE_PRODUCTION_SUPABASE_HOST}` },
]) {
  assert.throws(() => resolveLiveReadinessAuditConfig(unsafe));
}
assert.doesNotThrow(() =>
  assertLiveReadinessSelectAllowed("select", "micro_skill_catalog"),
);
assert.throws(() =>
  assertLiveReadinessSelectAllowed("insert", "micro_skill_catalog"),
);
assert.throws(() =>
  assertLiveReadinessSelectAllowed("select", "adle_learning_items"),
);

console.log("ADLE production readiness audit regression passed.");
