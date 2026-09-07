import { createClient } from "@supabase/supabase-js";
import { buildCoherentReviewBatches, generateDeterministicEnrichmentCandidates } from "../lib/writing-engine/whole-writing/enrichment-generation";
import { loadDeterministicEnrichmentGenerationInputs } from "../lib/writing-engine/whole-writing/enrichment-generation-repository";
import { loadWritingEnrichmentInventory } from "../lib/writing-engine/whole-writing/enrichment-inventory-repository";

const value = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
async function main() {
  if (!process.argv.includes("--live")) throw new Error("Generation requires --live; use writing:enrichment-regression for fixtures");
  const environment = value("--environment");
  if (!environment || !["local", "staging", "production"].includes(environment)) throw new Error("Use --environment local|staging|production");
  if (environment === "production") throw new Error("WRITING_ENRICHMENT_PRODUCTION_GENERATION_FORBIDDEN");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const child = value("--child");
  const inventory = await loadWritingEnrichmentInventory({ client, environment: environment as "local" | "staging",
    corpusScope: child ? "explicit-child-cohort" : "all-captured-whole-writing", childIds: child ? [child] : undefined });
  const sourceInputs = await loadDeterministicEnrichmentGenerationInputs(client, environment as "local" | "staging");
  const generation = generateDeterministicEnrichmentCandidates({ observedGapWordIds: new Set(inventory.pilot.flatMap((row) => row.canonicalWordId ? [row.canonicalWordId] : [])),
    activeCanonicalWordIds: sourceInputs.activeCanonicalWordIds, activeMicroSkillKeys: sourceInputs.activeMicroSkillKeys,
    sources: sourceInputs.sources, governedPairs: sourceInputs.governedPairs, pendingPairs: sourceInputs.pendingPairs, history: sourceInputs.history });
  const batches = buildCoherentReviewBatches(generation.candidates);
  if (!process.argv.includes("--persist") && !process.argv.includes("--create-packages")) {
    console.log(JSON.stringify({ mode: "read_only", inventoryFingerprint: inventory.inputFingerprint, pilotGapCount: inventory.pilot.length,
      generatedCandidateCount: generation.candidates.length, findingCounts: Object.fromEntries([...new Set(generation.findings.map((row) => row.code))]
        .map((code) => [code, generation.findings.filter((row) => row.code === code).length])),
      batches: batches.map((batch) => ({ groupKey: batch.groupKey, candidateCount: batch.candidates.length })), ai: generation.ai }, null, 2));
    return;
  }
  const actor = value("--actor"), inventoryKey = value("--inventory-key");
  if (!actor || !inventoryKey) throw new Error("Persistence requires --actor UUID and --inventory-key");
  const persisted = await client.rpc("persist_writing_enrichment_inventory", { p_key: inventoryKey, p_environment: environment, p_report: inventory, p_actor: actor });
  if (persisted.error) throw new Error(`WRITING_ENRICHMENT_INVENTORY_PERSIST_FAILED:${persisted.error.code}`);
  const entryRows = await client.from("writing_enrichment_inventory_entries").select("id,canonical_word_id,gap_type").eq("run_id", persisted.data);
  if (entryRows.error) throw new Error("WRITING_ENRICHMENT_ENTRY_READ_FAILED");
  const entryByWord = new Map((entryRows.data ?? []).filter((row) => row.gap_type === "missing_governed_relationship" && row.canonical_word_id)
    .map((row) => [row.canonical_word_id, row.id]));
  const attemptByFingerprint = new Map<string, string>();
  for (const candidate of generation.candidates) {
    const entry = entryByWord.get(candidate.canonicalWordId);
    if (!entry) continue;
    const response = await client.rpc("record_writing_enrichment_attempt", {
      p_key: `e1:${inventory.inputFingerprint}:${candidate.sourceFingerprint}`, p_entry: entry, p_environment: environment,
      p_generator_version: generation.version, p_method: candidate.method, p_source_kind: candidate.sourceKind,
      p_source_fingerprint: candidate.sourceFingerprint, p_authority_references: [`${candidate.sourceKind}:${candidate.sourceId}@${candidate.sourceVersion}`],
      p_dictionary_fingerprint: inventory.identityFingerprint, p_relationship_fingerprint: inventory.relationshipFingerprint,
      p_candidate: candidate, p_findings: [], p_outcome: "candidate", p_actor: actor,
    });
    if (response.error) throw new Error(`WRITING_ENRICHMENT_ATTEMPT_PERSIST_FAILED:${response.error.code}`);
    attemptByFingerprint.set(candidate.sourceFingerprint, response.data);
  }
  const packages: string[] = [];
  if (process.argv.includes("--create-packages")) {
    const prefix = value("--package-prefix");
    if (!prefix) throw new Error("Package creation requires --package-prefix");
    for (const [index, batch] of batches.entries()) {
      const attemptIds = batch.candidates.map((candidate) => attemptByFingerprint.get(candidate.sourceFingerprint)).filter((id): id is string => Boolean(id));
      if (!attemptIds.length) continue;
      const created = await client.rpc("create_writing_enrichment_candidate_package", { p_attempts: attemptIds,
        p_package_key: `${prefix}-${String(index + 1).padStart(3, "0")}`, p_environment: environment, p_actor: actor });
      if (created.error) throw new Error(`WRITING_ENRICHMENT_PACKAGE_CREATE_FAILED:${created.error.code}`);
      packages.push(created.data);
    }
  }
  console.log(JSON.stringify({ mode: packages.length ? "packages_created_awaiting_human_review" : "inventory_and_attempts_persisted",
    inventoryRunId: persisted.data, attemptCount: attemptByFingerprint.size, packageIds: packages, ai: generation.ai }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
