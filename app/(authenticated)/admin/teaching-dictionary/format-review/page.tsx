import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { auditCanonicalMorphology } from "@/lib/teaching-dictionary-manager/canonical-morphology";
import { routeContentFromStoredRow } from "@/lib/teaching-dictionary-manager/contracts";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

const explanation: Record<string, string> = {
  missing_morphology: "Approved word has no morphology record",
  parts_or_joins_missing: "Parts or joins are missing",
  join_count: "Parts and joins need review",
  part_shape: "A part has an invalid shape",
  legacy_aliases: "Older part fields need review",
  unreviewed_part_fact: "A part needs its form or meaning reviewed",
  duplicate_part_id: "Part identities conflict",
  join_identity: "A join connects different parts",
  surface_spelling: "Visible parts do not spell the word",
  display_range: "Display positions conflict with the word",
  mixed_display_ranges: "Some display positions are missing",
  immutable_family_evidence: "Family evidence must be preserved during review",
  display_ranges_only: "Display positions can be derived exactly",
  exact: "Canonical format",
};

export default async function DictionaryFormatReviewPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminUser();
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isSafeInteger(requested) ? Math.max(1, requested) : 1;
  const db = createServiceRoleClient();
  const words = await db.from("canonical_teaching_dictionary_words")
    .select("id,display_word,row_status,review_status", { count: "exact" })
    .eq("row_status", "active").order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (words.error) throw new Error("DICTIONARY_FORMAT_REVIEW_WORD_READ_FAILED");
  const wordIds = (words.data ?? []).map((word) => word.id);
  const morphology = wordIds.length ? await db.from("canonical_teaching_dictionary_word_morphology")
    .select("id,canonical_word_id,morphology_parts,morphology_joins,word_sum")
    .eq("row_status", "active").in("canonical_word_id", wordIds)
    : { data: [], error: null };
  if (morphology.error) throw new Error("DICTIONARY_FORMAT_REVIEW_READ_FAILED");
  const rows = morphology.data ?? [];
  const morphologyIds = rows.map((row) => row.id);
  const [memberships, definitions, routes] = await Promise.all([
    morphologyIds.length ? db.from("canonical_teaching_dictionary_lexical_base_family_members")
      .select("canonical_morphology_id").in("canonical_morphology_id", morphologyIds)
      : Promise.resolve({ data: [], error: null }),
    wordIds.length ? db.from("teaching_dictionary_definition_versions")
      .select("canonical_word_id,definition").in("canonical_word_id", wordIds)
      .is("route_id", null).order("published_at", { ascending: false }).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    wordIds.length ? db.from("teaching_dictionary_route_content_versions")
      .select("id,canonical_word_id,route_id,route_version,micro_skill_key,content")
      .in("canonical_word_id", wordIds).order("published_at", { ascending: false }).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (memberships.error || definitions.error || routes.error)
    throw new Error("DICTIONARY_FORMAT_REVIEW_LINK_READ_FAILED");
  const morphologyByWord = new Map(rows.map((row) => [row.canonical_word_id, row]));
  const linked = new Set((memberships.data ?? []).map((member) => member.canonical_morphology_id));
  const definitionByWord = new Map<string, string>();
  for (const definition of definitions.data ?? [])
    if (!definitionByWord.has(definition.canonical_word_id))
      definitionByWord.set(definition.canonical_word_id, definition.definition);
  const latestRoute = new Set<string>();
  const routeConflicts = new Map<string, Set<string>>();
  for (const row of routes.data ?? []) {
    const key = `${row.canonical_word_id}:${row.route_id}:${row.micro_skill_key}`;
    if (latestRoute.has(key)) continue;
    latestRoute.add(key);
    const route = routeContentFromStoredRow(row);
    const morphologyRow = morphologyByWord.get(row.canonical_word_id);
    const sharedMeaning = definitionByWord.get(row.canonical_word_id);
    const sharedSum = morphologyRow?.word_sum;
    const conflicts = routeConflicts.get(row.canonical_word_id) ?? new Set<string>();
    if (sharedMeaning && route.wordMeaning.trim() && route.wordMeaning.trim() !== sharedMeaning.trim())
      conflicts.add("meaning");
    if (sharedSum && route.wordSum.trim() && route.wordSum.trim() !== sharedSum.trim())
      conflicts.add("word sum");
    if (conflicts.size) routeConflicts.set(row.canonical_word_id, conflicts);
  }
  const reviewed = (words.data ?? []).map((word) => {
    const row = morphologyByWord.get(word.id);
    const audit = row ? auditCanonicalMorphology({ parts: row.morphology_parts,
      joins: row.morphology_joins, displayWord: word.display_word,
      linkedToFamily: linked.has(row.id) }) : null;
    return { row, word, audit };
  });
  const needsReview = reviewed.filter(({ audit, word }) =>
    (word.review_status === "approved_for_first_exposure" && !audit) ||
    (audit !== null && audit.status !== "canonical") || routeConflicts.has(word.id));
  const total = words.count ?? 0;
  const href = (next: number) => `/admin/teaching-dictionary/format-review?page=${next}`;
  return <main className="mx-auto grid max-w-5xl gap-6 p-6 text-[color:var(--ink)]">
    <header><Link className="text-sm underline" href="/admin/teaching-dictionary">Teaching Dictionary Manager</Link>
      <h1 className="mt-3 text-3xl font-semibold">Dictionary format review</h1>
      <p className="mt-2 text-sm">Review historical word parts in Overview. Family evidence stays linked to its original record while a corrected version is approved.</p>
    </header>
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <p className="mb-4 text-sm">{needsReview.length} entries to review on this page · {total} active words · page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</p>
      <ul className="grid gap-2">{needsReview.map(({ word, audit }) =>
        <li key={word.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
          <span><strong>{word.display_word}</strong><span className="ml-2 text-[color:var(--mid)]">{!audit ? explanation.missing_morphology : audit.status === "canonical" ? "" : explanation[audit.reason] ?? audit.reason}
            {routeConflicts.has(word.id) && <span className="block text-amber-800">Saved route {Array.from(routeConflicts.get(word.id)!).join(" and ")} differs from Overview</span>}</span></span>
          <Link className="underline" href={`/admin/teaching-dictionary/${word.id}#td-canonical-parts`}>Review in Overview</Link>
        </li>)}</ul>
      {!needsReview.length && <p className="text-sm">No format reviews on this page.</p>}
      <nav className="mt-5 flex gap-4 text-sm">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
        {page * PAGE_SIZE < total && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>
    </section>
  </main>;
}
