import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { publicationBlockers, routeBlockers, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { publishTeachingDictionaryBatch } from "../../actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function failureCodes(value: string | undefined): Record<string, string> {
  if (!value || value.length > 3000) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, code]) => isUuid(id)
      && typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)).slice(0, 10));
  } catch { return {}; }
}

export default async function TeachingDictionaryImportPage({ params, searchParams }: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string; published?: string; failed?: string; scanned?: string; cursor?: string; finished?: string; failures?: string }>;
}) {
  await requireAdminUser();
  const { batchId } = await params;
  if (!isUuid(batchId)) notFound();
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const db = createServiceRoleClient();
  const replacement = await db.from("teaching_dictionary_manager_batch_replacements")
    .select("replacement_batch_id,reason").eq("original_batch_id", batchId).maybeSingle();
  if (replacement.error) throw new Error("TEACHING_BATCH_REPLACEMENT_READ_FAILED");
  const result = await db.from("teaching_dictionary_manager_drafts")
    .select("id,canonical_word_id,normalised_word,payload,created_at", { count: "exact" })
    .like("source_reference", `CSV batch ${batchId},%`).order("normalised_word")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (result.error) throw new Error("TEACHING_BATCH_READ_FAILED");
  if (!result.count) notFound();
  const drafts = result.data ?? [];
  const publications = await db.from("teaching_dictionary_manager_publications")
    .select("draft_id").in("draft_id", drafts.map((draft) => draft.id));
  if (publications.error) throw new Error("TEACHING_BATCH_PUBLICATION_READ_FAILED");
  const done = new Set((publications.data ?? []).map((item) => item.draft_id));
  const failures = failureCodes(query.failures);
  const failedIds = new Set(Object.keys(failures));
  const failedResult = failedIds.size ? await db.from("teaching_dictionary_manager_drafts")
    .select("id,canonical_word_id,normalised_word")
    .in("id", [...failedIds]).like("source_reference", `CSV batch ${batchId},%`) : { data: [], error: null };
  if (failedResult.error) throw new Error("TEACHING_BATCH_FAILURE_READ_FAILED");
  const href = (next: number) => `/admin/teaching-dictionary/imports/${batchId}?page=${next}`;
  return <main className="mx-auto grid max-w-6xl gap-5 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link className="underline" href="/admin/teaching-dictionary">← Teaching Dictionary Manager</Link></nav>
    <header><h1 className="text-3xl font-semibold">CSV import review</h1>
      <p className="mt-2 text-sm">{result.count} changed words · page {page} of {Math.ceil(result.count / PAGE_SIZE)}. Imported rows are drafts until published.</p>
    </header>
    {replacement.data && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      This import was replaced: {replacement.data.reason} <Link className="font-semibold underline"
        href={`/admin/teaching-dictionary/imports/${replacement.data.replacement_batch_id}`}>Open the corrected import</Link>.
    </p>}
    {query.published && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
      Published {query.published} ready drafts in this pass. Checked {query.scanned ?? "0"} drafts.
      {Number(query.failed) > 0 && ` ${query.failed} need individual review.`}
    </p>}
    {(failedResult.data ?? []).length > 0 && <p className="text-sm">Review failed publications: {(failedResult.data ?? []).map((draft, index) => <span key={draft.id}>
      {index > 0 ? ", " : ""}<Link className="underline" href={draft.canonical_word_id
        ? `/admin/teaching-dictionary/${draft.canonical_word_id}?draft=${draft.id}`
        : `/admin/teaching-dictionary/new?draft=${draft.id}`}>{draft.normalised_word}</Link> ({failures[draft.id].replaceAll("_", " ")})
    </span>)}</p>}
    {!replacement.data && <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">Publish complete drafts</h2>
      <p className="mt-1 text-sm">Runs the existing word and route validators, up to ten words per pass. Incomplete drafts stay available for editing. Evidence approval remains separate.</p>
      <form action={publishTeachingDictionaryBatch} className="mt-3">
        <input type="hidden" name="batch_id" value={batchId} />
        {query.cursor && isUuid(query.cursor) && <input type="hidden" name="cursor" value={query.cursor} />}
        {query.finished === "true" ? <p className="text-sm">This validation pass reached the end of the import.</p>
          : <button className="rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white">Publish next ten ready words</button>}
      </form>
    </section>}
    <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-4">
      <table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b">
        <th className="p-2">Word</th><th className="p-2">Draft status</th><th className="p-2">Remaining facts</th><th className="p-2">Action</th>
      </tr></thead><tbody>{drafts.map((draft) => {
        const payload = draft.payload as WordDraftPayload;
        const blockers = [...publicationBlockers(payload, draft.normalised_word),
          ...payload.routeContents.flatMap((route) => routeBlockers(route, payload))];
        const link = draft.canonical_word_id
          ? `/admin/teaching-dictionary/${draft.canonical_word_id}?draft=${draft.id}`
          : `/admin/teaching-dictionary/new?draft=${draft.id}`;
        return <tr key={draft.id} className="border-b align-top last:border-0">
          <td className="p-2 font-semibold">{payload.displayWord || draft.normalised_word}</td>
          <td className="p-2">{done.has(draft.id) ? "Facts published" : failedIds.has(draft.id) ? "Publication needs review"
            : blockers.length ? "Needs facts" : "Ready to validate"}</td>
          <td className="p-2">{blockers.length ? <details><summary>{blockers.length} missing or unreviewed</summary>
            <ul className="mt-1 list-disc pl-5">{blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul>
          </details> : "—"}</td>
          <td className="p-2"><Link className="font-semibold underline" href={link}>Open and edit</Link></td>
        </tr>;
      })}</tbody></table>
    </section>
    <nav className="flex gap-4 text-sm">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
      {page * PAGE_SIZE < result.count && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>
  </main>;
}
