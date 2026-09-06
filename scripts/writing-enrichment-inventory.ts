import { createClient } from "@supabase/supabase-js";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import { phaseBFixtureFacts, phaseBFixtureSkills, phaseBFixtureWords } from "../lib/adle/word-skill-relationships/fixtures";
import { buildEnrichmentInventory, privateEnrichmentOccurrenceSelection, publicEnrichmentInventory } from "../lib/writing-engine/whole-writing/enrichment-inventory";
import { loadWritingEnrichmentInventory } from "../lib/writing-engine/whole-writing/enrichment-inventory-repository";

async function main() {
  if (!process.argv.includes("--live")) {
    const authority = readCanonicalWordSkillRelationships({ words: phaseBFixtureWords, microSkills: phaseBFixtureSkills, facts: phaseBFixtureFacts });
    const inventory = buildEnrichmentInventory({ corpusScope: "redacted-empty-fixture", scannedAt: "2026-09-06T00:00:00.000Z", observations: [],
      canonicalWords: phaseBFixtureWords.map((word) => ({ id: word.canonicalWordId, normalizedForm: word.normalisedWord, dialect: "en-GB", rowStatus: word.state })),
      microSkills: phaseBFixtureSkills.map((skill) => ({ microSkillKey: skill.microSkillKey, active: skill.state === "active" })),
      relationshipAuthority: authority, mappingSignals: [], pendingCandidates: [], sourcesComplete: true });
    console.log(JSON.stringify(publicEnrichmentInventory(inventory), null, 2));
    return;
  }
  const environmentIndex = process.argv.indexOf("--environment");
  const environment = process.argv[environmentIndex + 1];
  if (!environmentIndex || !["local", "staging", "production"].includes(environment)) throw new Error("Use --live --environment local|staging|production");
  if (environment === "production" && !process.argv.includes("--acknowledge-read-only-production")) {
    throw new Error("Production inventory requires --acknowledge-read-only-production");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  const childIndex = process.argv.indexOf("--child");
  const childIds = childIndex >= 0 ? [process.argv[childIndex + 1]] : undefined;
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const inventory = await loadWritingEnrichmentInventory({ client, environment: environment as "local" | "staging" | "production",
    corpusScope: childIds ? "explicit-child-cohort" : "all-captured-whole-writing", childIds });
  if (process.argv.includes("--identity-demand-csv")) {
    const quote = (entry: string | number) => `"${String(entry).replaceAll('"', '""')}"`;
    const rows = inventory.entries.filter((entry) => entry.gapType === "missing_canonical_identity")
      .map((entry) => [entry.normalizedForm ?? "", entry.dialect ?? "", entry.occurrenceCount, entry.submissionCount, entry.reasons.join("|")]);
    console.log([["normalised_form", "dialect_code", "occurrence_count", "submission_count", "reason"], ...rows]
      .map((row) => row.map(quote).join(",")).join("\n"));
    return;
  }
  console.log(JSON.stringify(process.argv.includes("--include-private-occurrence-ids")
    ? { report: publicEnrichmentInventory(inventory), privateSelection: privateEnrichmentOccurrenceSelection(inventory) }
    : publicEnrichmentInventory(inventory), null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
