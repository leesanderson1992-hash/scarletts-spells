import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";
import { phaseBFixtureFacts, phaseBFixtureSkills, phaseBFixtureWords } from "../lib/adle/word-skill-relationships/fixtures";
import { formatCanonicalWordSkillReconciliationReport } from "../lib/adle/word-skill-relationships/report";
import { loadCanonicalWordSkillRelationshipAuthority } from "../lib/adle/word-skill-relationships/repository";
import type { CanonicalWordSkillRelationshipReadResult } from "../lib/adle/word-skill-relationships/contracts";

const REPRESENTATIVE_WORDS = ["careful", "playing", "dishonest", "hopeful"] as const;

async function formatLiveRepresentatives(
  client: SupabaseClient,
  result: CanonicalWordSkillRelationshipReadResult,
): Promise<string> {
  const specialistSources = new Set(["released_specialist_membership", "released_route_content"]);
  const specialistOnly = result.relationships.find((relationship) =>
    relationship.sourceProvenance.every((entry) => specialistSources.has(entry.sourceAuthority)));
  const resolverOnly = result.relationships.find((relationship) =>
    relationship.sourceProvenance.length > 0
    && relationship.sourceProvenance.every((entry) => entry.sourceAuthority === "approved_resolver_mapping"));
  const multiProvenance = result.relationships.find((relationship) =>
    relationship.sourceProvenance.length > 1 || relationship.sourceProvenance.some((entry) => entry.occurrenceCount > 1));
  const selectedIds = [specialistOnly, resolverOnly, multiProvenance]
    .filter((entry) => entry !== undefined)
    .map((entry) => entry.canonicalWordId);
  const { data, error } = await client
    .from("canonical_teaching_dictionary_words")
    .select("id,normalised_word")
    .or(`normalised_word.in.(${REPRESENTATIVE_WORDS.join(",")}),id.in.(${selectedIds.join(",")})`)
    .order("id", { ascending: true });
  if (error) throw new Error(`word-skill representative labels: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; normalised_word: string }>;
  const wordById = new Map(rows.map((row) => [row.id, row.normalised_word]));
  const idsByWord = new Map<string, string[]>();
  for (const row of rows) {
    idsByWord.set(row.normalised_word, [...(idsByWord.get(row.normalised_word) ?? []), row.id]);
  }
  const relationshipLine = (label: string, relationship: NonNullable<typeof specialistOnly>) => {
    const provenance = relationship.sourceProvenance.map((entry) =>
      `${entry.sourceAuthority}:${entry.provenanceId}@${entry.sourceAuthorityVersion}#${entry.occurrenceCount}`).join("; ");
    return `- ${label}: \`${wordById.get(relationship.canonicalWordId) ?? relationship.canonicalWordId}\` + \`${relationship.microSkillKey}\` — ${provenance}`;
  };
  const lines = ["", "## Representative live results", ""];
  for (const word of REPRESENTATIVE_WORDS) {
    const wordIds = new Set(idsByWord.get(word) ?? []);
    const relationships = result.relationships.filter((relationship) => wordIds.has(relationship.canonicalWordId));
    const decisions = result.decisions.filter((entry) => entry.canonicalWordId && wordIds.has(entry.canonicalWordId) && entry.disposition !== "ADMITTED");
    lines.push(`### \`${word}\``, "");
    if (relationships.length === 0) lines.push("- No admitted relationship.");
    for (const relationship of relationships) lines.push(relationshipLine("ADMITTED", relationship));
    for (const entry of decisions) lines.push(`- ${entry.disposition}: \`${entry.microSkillKey ?? "—"}\` — ${entry.reason} (${entry.sourceAuthority}:${entry.provenanceId ?? "—"})`);
    lines.push("");
  }
  if (specialistOnly) lines.push(relationshipLine("Specialist-only", specialistOnly));
  if (resolverOnly) lines.push(relationshipLine("Resolver-only", resolverOnly));
  if (multiProvenance) lines.push(relationshipLine("Multi-provenance", multiProvenance));
  return lines.join("\n");
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    const result = readCanonicalWordSkillRelationships({ words: phaseBFixtureWords, microSkills: phaseBFixtureSkills, facts: phaseBFixtureFacts });
    console.log(formatCanonicalWordSkillReconciliationReport(result, "deterministic regression fixture"));
    return;
  }
  const environmentArg = process.argv.indexOf("--environment");
  const environmentKey = process.argv[environmentArg + 1];
  if (!environmentArg || !["local", "staging", "production"].includes(environmentKey)) {
    throw new Error("Use --live --environment local|staging|production");
  }
  if (environmentKey === "production" && !process.argv.includes("--acknowledge-read-only-production")) {
    throw new Error("Production reconciliation requires --acknowledge-read-only-production");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SB_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SB_SERVICE_ROLE_KEY are required");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environmentKey as "local" | "staging" | "production" });
  const report = formatCanonicalWordSkillReconciliationReport(result, `${environmentKey} read-only source facts`);
  const representatives = await formatLiveRepresentatives(client, result);
  console.log(`${report}\n${representatives}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
