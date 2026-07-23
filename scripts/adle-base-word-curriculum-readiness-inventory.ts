import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { resolveCurriculumReadinessInventory } from "../lib/adle/curriculum-readiness/resolver";
import { loadBaseWordCurriculumReadinessFacts } from "../lib/adle/loaders/base-word-curriculum-readiness";

type EnvironmentKey = "local" | "staging" | "production";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function readEnvironment(): EnvironmentKey {
  const value = process.argv.find((argument) => argument.startsWith("--environment="))?.split("=", 2)[1] ?? "local";
  if (value === "local" || value === "staging" || value === "production") return value;
  throw new Error("--environment must be local, staging, or production");
}

async function main(): Promise<void> {
  const environmentKey = readEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the read-only inventory");
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const loaded = await loadBaseWordCurriculumReadinessFacts({ client, environmentKey });
  const inventory = resolveCurriculumReadinessInventory(loaded.facts);
  const routeTargets = inventory.targets.map((target) => ({
    targetKey: target.targetKey,
    mappingIds: target.mappingIds,
    learningItemIds: target.learningItemIds,
    childIds: target.childIds,
    baseWordLab: target.routes.find((route) => route.routeId === "base_word_lab" && route.routeVersion === "v2") ?? null,
    assignmentReadinessByChild: target.assignmentReadinessByChild,
  }));
  const output = {
    schemaVersion: 1,
    readOnly: true,
    environmentKey,
    route: { routeId: "base_word_lab", routeVersion: "v2" },
    counts: {
      targetContentFacts: loaded.routeContent.length,
      childTargetSelectionFacts: loaded.routeSelections.length,
      observedActivationFacts: loaded.routeActivation.length,
      targetInspections: routeTargets.length,
    },
    inputHash: hash({ routeContent: loaded.routeContent, routeSelections: loaded.routeSelections, routeActivation: loaded.routeActivation }),
    integrity: inventory.integrity,
    targets: routeTargets,
    sharedWords: inventory.sharedWords,
  };
  process.stdout.write(`${JSON.stringify({ ...output, outputHash: hash(output) }, null, 2)}\n`);
}

void main();
