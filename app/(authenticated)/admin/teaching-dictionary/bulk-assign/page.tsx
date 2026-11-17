import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadTeachingDictionaryEvidenceAuthorityForSkill } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { loadBulkWordDirectory, readSpellingCandidatePage } from "./candidate-page";
import { managerAssignedPairs } from "@/lib/teaching-dictionary-manager/bulk-review";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { BulkAssignWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

type Exclusion = { micro_skill_key: string; canonical_word_id: string };
type SenseBinding = { canonical_word_id: string; micro_skill_key: string; sense_id: string };

async function readExclusions(environment: string, skill: string): Promise<Exclusion[]> {
  const db = createServiceRoleClient();
  const rows: Exclusion[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_bulk_review_exclusions")
      .select("micro_skill_key,canonical_word_id").eq("environment_key", environment).eq("micro_skill_key", skill)
      .order("micro_skill_key").order("canonical_word_id").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_REVIEW_READ_FAILED");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

async function readSenseBindings(environment: string, skill: string): Promise<SenseBinding[]> {
  const db = createServiceRoleClient();
  const rows: SenseBinding[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("teaching_dictionary_effective_lesson_sense_bindings")
      .select("canonical_word_id,micro_skill_key,sense_id")
      .eq("environment_key", environment).eq("micro_skill_key", skill)
      .order("canonical_word_id").order("micro_skill_key").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_BULK_BINDING_READ_FAILED");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

export default async function BulkAssignPage({ searchParams }: {
  searchParams: Promise<{ skill?: string; child?: string }>;
}) {
  await requireAdminUser();
  const { skill, child } = await searchParams;
  const db = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment();
  const [clusterRows, skillRows] = await Promise.all([
    db.from("micro_skill_clusters").select("skill_cluster_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_cluster_key")
      .eq("is_active", true).eq("is_assignable", true)
      .neq("micro_skill_key", "D4_SCHWA_MEDIAL_NATURAL_ACTUAL").order("display_name"),
  ]);
  if (clusterRows.error || skillRows.error) throw new Error("TEACHING_BULK_CATALOG_READ_FAILED");
  const skills = skillRows.data.map(row => ({
    key: row.micro_skill_key, label: row.display_name, clusterKey: row.skill_cluster_key ?? "other",
  }));
  const clusterLabels = new Map(clusterRows.data.map(row => [row.skill_cluster_key, row.display_name]));
  const clusters = [...new Set(skills.map(row => row.clusterKey))].map(key => ({
    key, label: clusterLabels.get(key) ?? (key === "D4_INF_ING_ENDINGS" ? "-ing endings"
      : key === "other" ? "Other micro-skills" : key.replace(/^D\d+_/u, "").replaceAll("_", " ")),
  })).sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  const selected = skills.find(row => row.key === skill);
  const header = <>
    <nav className="text-sm"><Link className="underline" prefetch={false} href="/admin/teaching-dictionary">← Catalogue</Link></nav>
    <header><h1 className="text-3xl font-semibold">Assign words to a micro-skill</h1>
      <p className="mt-2 text-sm">Select words for one micro-skill. Words that need work are saved in Bulk review.</p>
    </header>
  </>;
  if (!selected) return <main className="mx-auto grid max-w-7xl gap-6 p-6 text-[color:var(--ink)]">
    {header}
    <BulkAssignWorkspace key="picker" initialSkillKey="" child={typeof child === "string" ? child : undefined}
      clusters={clusters} skills={skills} assignedWords={[]} assignedPairs={[]} assignedSenseIds={{}}
      approvedSenseIdsByPair={{}} excludedPairs={[]} approvalEnabled={false} />
  </main>;

  const directoryPromise = loadBulkWordDirectory();
  const firstPage = directoryPromise.then(directory => readSpellingCandidatePage(directory, "", 1, selected.key));
  const [directory, initialPage, controls, authority, exclusions, senseBindings] = await Promise.all([
    directoryPromise, firstPage,
    environment ? loadWordSkillReviewControls(db, environment) : null,
    environment ? loadTeachingDictionaryEvidenceAuthorityForSkill(db, environment, selected.key) : null,
    environment ? readExclusions(environment, selected.key) : [],
    environment ? readSenseBindings(environment, selected.key) : [],
  ]);
  const assignedPairs = managerAssignedPairs(authority ?? []);
  const bindingIds = new Map<string, string[]>();
  for (const row of senseBindings) {
    const key = `${row.micro_skill_key}:${row.canonical_word_id}`;
    bindingIds.set(key, [...(bindingIds.get(key) ?? []), row.sense_id]);
  }
  const assignedSenseIds = Object.fromEntries([...bindingIds]
    .filter(([, ids]) => ids.length === 1).map(([key, ids]) => [key, ids[0]]));
  const assignedIds = new Set(assignedPairs.map(pair => pair.wordId));
  const assignedWords = directory.filter(word => assignedIds.has(word.id))
    .map(({ id, display_word, normalised_word }) => ({ id, displayWord: display_word, normalisedWord: normalised_word }));
  const enabled = Boolean(environment && controls?.review_enabled && controls.publication_enabled && controls.withdrawal_enabled);

  return <main className="mx-auto grid max-w-7xl gap-6 p-6 text-[color:var(--ink)]">
    {header}
    <BulkAssignWorkspace key={selected.key} initialSkillKey={selected.key} child={typeof child === "string" ? child : undefined}
      initialPage={initialPage} assignedWords={assignedWords} clusters={clusters} skills={skills}
      assignedPairs={assignedPairs} assignedSenseIds={assignedSenseIds}
      approvedSenseIdsByPair={Object.fromEntries(bindingIds)} excludedPairs={exclusions.map((row) =>
      `${row.micro_skill_key}:${row.canonical_word_id}`)} approvalEnabled={enabled} />
  </main>;
}
