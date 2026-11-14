import Link from "next/link";
import { normaliseWrittenSyllableBreakdown } from "@/lib/teaching-dictionary-manager/authoring";
import { requireAdminUser } from "@/lib/admin/access";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isolatedPhonemeSymbols, morphemeParts, syllableCount, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { managerAssignedPairs } from "@/lib/teaching-dictionary-manager/bulk-review";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { BulkAssignWorkspace } from "./workspace";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import type { CandidateFamilyLink } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { candidateFactsForSense, type CandidateAnalysisRow, type CandidateLinkRow } from
  "@/lib/teaching-dictionary-manager/candidate-sense-facts";

export const dynamic = "force-dynamic";

type DictionaryWord = { id: string; normalised_word: string; display_word: string; row_status: string; review_status: string };
type Metadata = { id: string; canonical_word_id: string; row_status: string; created_at: string; has_schwa: boolean | null; syllables: string | null; written_syllable_breakdown: string | null; phoneme_hint: string | null };
type Morphology = { id: string; canonical_word_id: string; row_status: string; created_at: string; morphology_parts: unknown;
  morphology_joins: unknown; analysis_status: string; review_status: string; word_sum: string | null };
type Exclusion = { micro_skill_key: string; canonical_word_id: string };
type SenseRow = { canonical_word_id: string; sense_set: DictionarySenseSet };
type SenseBinding = { canonical_word_id: string; micro_skill_key: string; sense_id: string };

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const db = createServiceRoleClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from(table).select(columns).eq("row_status", "active")
      .order("id", { ascending: true }).range(start, start + 499);
    if (result.error) throw new Error(`TEACHING_BULK_READ_FAILED:${table}`);
    rows.push(...(result.data as T[]));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

async function readExclusions(environment: string): Promise<Exclusion[]> {
  const db = createServiceRoleClient();
  const rows: Exclusion[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_bulk_review_exclusions")
      .select("micro_skill_key,canonical_word_id").eq("environment_key", environment)
      .order("micro_skill_key").order("canonical_word_id").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_REVIEW_READ_FAILED");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

async function readSenseSets(): Promise<SenseRow[]> {
  const db = createServiceRoleClient();
  const rows: SenseRow[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_reviewed_sense_sets")
      .select("canonical_word_id,sense_set").order("canonical_word_id").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_SENSE_READ_FAILED");
    rows.push(...(result.data as SenseRow[]));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

async function readSenseBindings(environment: string): Promise<SenseBinding[]> {
  const db = createServiceRoleClient();
  const rows: SenseBinding[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_effective_lesson_sense_bindings")
      .select("canonical_word_id,micro_skill_key,sense_id")
      .eq("environment_key", environment)
      .order("canonical_word_id").order("micro_skill_key").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_BINDING_READ_FAILED");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

async function readFamilyLinks(): Promise<CandidateLinkRow[]> {
  const db = createServiceRoleClient();
  const rows: CandidateLinkRow[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_current_sense_family_links")
      .select("id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind")
      .order("canonical_word_id").order("sense_id").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_FAMILY_LINK_READ_FAILED");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

async function readSenseFactRows<T>(table: string, columns: string): Promise<T[]> {
  const db = createServiceRoleClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from(table).select(columns).order("canonical_word_id")
      .order("sense_id").order("id").range(start, start + 499);
    if (result.error) throw new Error(`TEACHING_BULK_SENSE_FACT_READ_FAILED:${table}`);
    rows.push(...(result.data as T[]));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export default async function BulkAssignPage() {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment();
  const [wordRows, metadataRows, morphologyRows, familiesResult, skillsResult, controls, authority, exclusions, senseRows, senseBindings, familyLinks, senseAnalyses, senseFamilyLinks] = await Promise.all([
    readAll<DictionaryWord>("canonical_teaching_dictionary_words", "id,normalised_word,display_word,row_status,review_status"),
    readAll<Metadata>("canonical_teaching_dictionary_word_metadata", "id,canonical_word_id,row_status,created_at,has_schwa,syllables,written_syllable_breakdown,phoneme_hint"),
    readAll<Morphology>("canonical_teaching_dictionary_word_morphology", "id,canonical_word_id,row_status,created_at,morphology_parts,morphology_joins,analysis_status,review_status,word_sum"),
    db.from("micro_skill_families").select("skill_family_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_family_key,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true)
      .neq("micro_skill_key", "D4_SCHWA_MEDIAL_NATURAL_ACTUAL").order("display_name"),
    environment ? loadWordSkillReviewControls(db, environment) : null,
    environment ? loadTeachingDictionaryEvidenceAuthority(db, environment) : null,
    environment ? readExclusions(environment) : [],
    readSenseSets(),
    environment ? readSenseBindings(environment) : [],
    readFamilyLinks(),
    readSenseFactRows<CandidateAnalysisRow>("teaching_dictionary_current_sense_morphology",
      "id,canonical_word_id,sense_id,morphology_parts,morphology_joins,word_sum"),
    readSenseFactRows<CandidateLinkRow>("teaching_dictionary_current_sense_family_memberships",
      "id,canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind,base_meaning"),
  ]);
  if (familiesResult.error || skillsResult.error) throw new Error("TEACHING_BULK_CATALOG_READ_FAILED");
  const metadataByWord = new Map<string, Metadata>();
  for (const row of metadataRows) {
    if (row.row_status !== "active") continue;
    const existing = metadataByWord.get(row.canonical_word_id);
    if (!existing || row.created_at > existing.created_at) metadataByWord.set(row.canonical_word_id, row);
  }
  const morphologyByWord = new Map<string, Morphology>();
  for (const row of morphologyRows) {
    const existing = morphologyByWord.get(row.canonical_word_id);
    if (!existing || row.created_at > existing.created_at) morphologyByWord.set(row.canonical_word_id, row);
  }
  const sensesByWord = new Map(senseRows.map(row => [row.canonical_word_id, row.sense_set]));
  const linksByWord = new Map<string, CandidateFamilyLink[]>();
  const legacyLinksByWord = new Map<string, CandidateLinkRow[]>();
  for (const link of familyLinks) linksByWord.set(link.canonical_word_id,
    [...(linksByWord.get(link.canonical_word_id) ?? []), link]);
  for (const link of familyLinks) legacyLinksByWord.set(link.canonical_word_id,
    [...(legacyLinksByWord.get(link.canonical_word_id) ?? []), link]);
  const analysesByWord = new Map<string, CandidateAnalysisRow[]>();
  for (const row of senseAnalyses) analysesByWord.set(row.canonical_word_id,
    [...(analysesByWord.get(row.canonical_word_id) ?? []), row]);
  const senseLinksByWord = new Map<string, CandidateLinkRow[]>();
  for (const row of senseFamilyLinks) senseLinksByWord.set(row.canonical_word_id,
    [...(senseLinksByWord.get(row.canonical_word_id) ?? []), row]);
  const words: BulkWord[] = wordRows.filter((row) => row.row_status === "active").map((row) => {
    const metadata = metadataByWord.get(row.id);
    return {
      id: row.id, normalisedWord: row.normalised_word, displayWord: row.display_word,
      approvable: row.review_status === "approved_for_first_exposure",
      hasSchwa: metadata?.has_schwa ?? null, syllableCount: syllableCount(metadata?.syllables),
      writtenSyllableBreakdown: metadata?.written_syllable_breakdown
        ? normaliseWrittenSyllableBreakdown(metadata.written_syllable_breakdown) : null,
      morphemeParts: morphemeParts(morphologyByWord.get(row.id)?.morphology_parts),
      phonemeHint: metadata?.phoneme_hint ?? null,
      phonemeSymbols: isolatedPhonemeSymbols(metadata?.phoneme_hint),
      senseSet: sensesByWord.get(row.id) ?? null,
      candidateMorphology: morphologyByWord.has(row.id) ? {
        parts: morphologyByWord.get(row.id)!.morphology_parts,
        joins: morphologyByWord.get(row.id)!.morphology_joins,
        analysisStatus: morphologyByWord.get(row.id)!.analysis_status,
        reviewStatus: morphologyByWord.get(row.id)!.review_status,
        wordSum: morphologyByWord.get(row.id)!.word_sum,
      } : null,
      candidateFamilyLinks: linksByWord.get(row.id) ?? [],
      candidateSenseFacts: Object.fromEntries((sensesByWord.get(row.id)?.senses ?? []).map(sense => {
        const legacy = morphologyByWord.get(row.id);
        const facts = candidateFactsForSense({ wordId: row.id, senseId: sense.id,
          senseSet: sensesByWord.get(row.id) ?? null,
          legacyMorphology: legacy ? { id: legacy.id, parts: legacy.morphology_parts,
            joins: legacy.morphology_joins, analysisStatus: legacy.analysis_status,
            reviewStatus: legacy.review_status, wordSum: legacy.word_sum } : null,
          legacyLinks: legacyLinksByWord.get(row.id) ?? [],
          senseAnalyses: analysesByWord.get(row.id) ?? [],
          senseLinks: senseLinksByWord.get(row.id) ?? [] });
        return [sense.id, { morphology: facts.morphology, familyLinks: facts.familyLinks }];
      })),
    };
  }).sort((a, b) => a.normalisedWord.localeCompare(b.normalisedWord));
  const assignedPairs = managerAssignedPairs(authority?.relationships ?? []);
  const bindingIds = new Map<string, string[]>();
  for (const row of senseBindings) {
    const key = `${row.micro_skill_key}:${row.canonical_word_id}`;
    bindingIds.set(key, [...(bindingIds.get(key) ?? []), row.sense_id]);
  }
  const enabled = Boolean(environment && controls?.review_enabled && controls.publication_enabled && controls.withdrawal_enabled);

  return <main className="mx-auto grid max-w-7xl gap-6 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link className="underline" href="/admin/teaching-dictionary">← Teaching Dictionary Manager</Link></nav>
    <header><h1 className="text-3xl font-semibold">Assign words to a micro-skill</h1>
      <p className="mt-2 text-sm">Approve multiple canonical words as evidence for one micro-skill. ADLE lesson content is managed separately.</p>
    </header>
    <BulkAssignWorkspace words={words} families={(familiesResult.data ?? []).map((row) => ({
      key: row.skill_family_key, label: row.display_name,
    }))} skills={(skillsResult.data ?? []).map((row) => ({
      key: row.micro_skill_key, label: row.display_name, familyKey: row.skill_family_key,
      clusterKey: row.skill_cluster_key,
    }))} assignedPairs={assignedPairs} assignedSenseIds={Object.fromEntries([...bindingIds]
      .filter(([, ids]) => ids.length === 1).map(([key, ids]) => [key, ids[0]]))}
    approvedSenseIdsByPair={Object.fromEntries(bindingIds)} excludedPairs={exclusions.map((row) =>
      `${row.micro_skill_key}:${row.canonical_word_id}`)} approvalEnabled={enabled} />
  </main>;
}
