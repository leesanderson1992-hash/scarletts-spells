import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isolatedPhonemeSymbols, morphemeParts, syllableCount, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { managerAssignedPairs } from "@/lib/teaching-dictionary-manager/bulk-review";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { BulkAssignWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

type DictionaryWord = { id: string; normalised_word: string; display_word: string; row_status: string; review_status: string };
type Metadata = { id: string; canonical_word_id: string; row_status: string; created_at: string; has_schwa: boolean | null; syllables: string | null; written_syllable_breakdown: string | null; phoneme_hint: string | null };
type Morphology = { id: string; canonical_word_id: string; row_status: string; morphology_parts: unknown };
type Exclusion = { micro_skill_key: string; canonical_word_id: string };

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

export default async function BulkAssignPage() {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment();
  const [wordRows, metadataRows, morphologyRows, familiesResult, skillsResult, controls, authority, exclusions] = await Promise.all([
    readAll<DictionaryWord>("canonical_teaching_dictionary_words", "id,normalised_word,display_word,row_status,review_status"),
    readAll<Metadata>("canonical_teaching_dictionary_word_metadata", "id,canonical_word_id,row_status,created_at,has_schwa,syllables,written_syllable_breakdown,phoneme_hint"),
    readAll<Morphology>("canonical_teaching_dictionary_word_morphology", "id,canonical_word_id,row_status,morphology_parts"),
    db.from("micro_skill_families").select("skill_family_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_family_key,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true)
      .neq("micro_skill_key", "D4_SCHWA_MEDIAL_NATURAL_ACTUAL").order("display_name"),
    environment ? loadWordSkillReviewControls(db, environment) : null,
    environment ? loadTeachingDictionaryEvidenceAuthority(db, environment) : null,
    environment ? readExclusions(environment) : [],
  ]);
  if (familiesResult.error || skillsResult.error) throw new Error("TEACHING_BULK_CATALOG_READ_FAILED");
  const metadataByWord = new Map<string, Metadata>();
  for (const row of metadataRows) {
    if (row.row_status !== "active") continue;
    const existing = metadataByWord.get(row.canonical_word_id);
    if (!existing || row.created_at > existing.created_at) metadataByWord.set(row.canonical_word_id, row);
  }
  const morphologyByWord = new Map(morphologyRows.filter((row) => row.row_status === "active")
    .map((row) => [row.canonical_word_id, row]));
  const words: BulkWord[] = wordRows.filter((row) => row.row_status === "active").map((row) => {
    const metadata = metadataByWord.get(row.id);
    return {
      id: row.id, normalisedWord: row.normalised_word, displayWord: row.display_word,
      approvable: row.review_status === "approved_for_first_exposure",
      hasSchwa: metadata?.has_schwa ?? null, syllableCount: syllableCount(metadata?.syllables),
      writtenSyllableBreakdown: metadata?.written_syllable_breakdown ?? null,
      morphemeParts: morphemeParts(morphologyByWord.get(row.id)?.morphology_parts),
      phonemeHint: metadata?.phoneme_hint ?? null,
      phonemeSymbols: isolatedPhonemeSymbols(metadata?.phoneme_hint),
    };
  }).sort((a, b) => a.normalisedWord.localeCompare(b.normalisedWord));
  const assignedPairs = managerAssignedPairs(authority?.relationships ?? []);
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
    }))} assignedPairs={assignedPairs} excludedPairs={exclusions.map((row) =>
      `${row.micro_skill_key}:${row.canonical_word_id}`)} approvalEnabled={enabled} />
  </main>;
}
