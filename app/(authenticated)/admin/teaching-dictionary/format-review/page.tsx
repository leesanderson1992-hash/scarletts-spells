import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { auditCanonicalMorphology } from "@/lib/teaching-dictionary-manager/canonical-morphology";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

const explanation: Record<string, string> = {
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
  const morphology = await db.from("canonical_teaching_dictionary_word_morphology")
    .select("id,canonical_word_id,morphology_parts,morphology_joins", { count: "exact" })
    .eq("row_status", "active").order("canonical_word_id").order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (morphology.error) throw new Error("DICTIONARY_FORMAT_REVIEW_READ_FAILED");
  const rows = morphology.data ?? [];
  const wordIds = [...new Set(rows.map((row) => row.canonical_word_id))];
  const morphologyIds = rows.map((row) => row.id);
  const [words, memberships] = await Promise.all([
    wordIds.length ? db.from("canonical_teaching_dictionary_words")
      .select("id,display_word,row_status").in("id", wordIds) : Promise.resolve({ data: [], error: null }),
    morphologyIds.length ? db.from("canonical_teaching_dictionary_lexical_base_family_members")
      .select("canonical_morphology_id").in("canonical_morphology_id", morphologyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (words.error || memberships.error) throw new Error("DICTIONARY_FORMAT_REVIEW_LINK_READ_FAILED");
  const wordById = new Map((words.data ?? []).map((word) => [word.id, word]));
  const linked = new Set((memberships.data ?? []).map((member) => member.canonical_morphology_id));
  const reviewed = rows.flatMap((row) => {
    const word = wordById.get(row.canonical_word_id);
    if (!word || word.row_status !== "active") return [];
    return [{ row, word, audit: auditCanonicalMorphology({ parts: row.morphology_parts,
      joins: row.morphology_joins, displayWord: word.display_word,
      linkedToFamily: linked.has(row.id) }) }];
  });
  const needsReview = reviewed.filter(({ audit }) => audit.status !== "canonical");
  const total = morphology.count ?? 0;
  const href = (next: number) => `/admin/teaching-dictionary/format-review?page=${next}`;
  return <main className="mx-auto grid max-w-5xl gap-6 p-6 text-[color:var(--ink)]">
    <header><Link className="text-sm underline" href="/admin/teaching-dictionary">Teaching Dictionary Manager</Link>
      <h1 className="mt-3 text-3xl font-semibold">Dictionary format review</h1>
      <p className="mt-2 text-sm">Review historical word parts in Overview. Family evidence stays linked to its original record while a corrected version is approved.</p>
    </header>
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <p className="mb-4 text-sm">{needsReview.length} entries to review on this page · {total} active morphology rows · page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</p>
      <ul className="grid gap-2">{needsReview.map(({ row, word, audit }) =>
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
          <span><strong>{word.display_word}</strong><span className="ml-2 text-[color:var(--mid)]">{explanation[audit.reason] ?? audit.reason}</span></span>
          <Link className="underline" href={`/admin/teaching-dictionary/${word.id}#td-canonical-parts`}>Review in Overview</Link>
        </li>)}</ul>
      {!needsReview.length && <p className="text-sm">No format reviews on this page.</p>}
      <nav className="mt-5 flex gap-4 text-sm">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
        {page * PAGE_SIZE < total && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>
    </section>
  </main>;
}
