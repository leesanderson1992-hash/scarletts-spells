import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { publicationBlockers, routeBlockers, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { pendingImportDrafts, type ImportDraftSummary } from "@/lib/teaching-dictionary-manager/import-review";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { publishTeachingDictionaryBatch } from "../../actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const FETCH_SIZE = 500;

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
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const db = createServiceRoleClient();
  const replacement = await db.from("teaching_dictionary_manager_batch_replacements")
    .select("replacement_batch_id,reason").eq("original_batch_id", batchId).maybeSingle();
  if (replacement.error) throw new Error("TEACHING_BATCH_REPLACEMENT_READ_FAILED");
  if (replacement.data) return <main className="mx-auto grid max-w-6xl gap-5 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link className="underline" href="/admin/teaching-dictionary">← Teaching Dictionary Manager</Link></nav>
    <h1 className="text-3xl font-semibold">CSV import replaced</h1>
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{replacement.data.reason}</p>
    <p><Link className="font-semibold underline" href={`/admin/teaching-dictionary/imports/${replacement.data.replacement_batch_id}`}>
      Open the corrected import to see the words left to do
    </Link></p>
  </main>;
  const allDrafts: ImportDraftSummary[] = [];
  for (let offset = 0; ; offset += FETCH_SIZE) {
    const result = await db.from("teaching_dictionary_manager_drafts")
      .select("id,canonical_word_id,normalised_word,created_at")
      .like("source_reference", `CSV batch ${batchId},%`).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(offset, offset + FETCH_SIZE - 1);
    if (result.error) throw new Error("TEACHING_BATCH_READ_FAILED");
    allDrafts.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < FETCH_SIZE) break;
  }
  if (!allDrafts.length) notFound();
  const done = new Set<string>();
  const publicationQueries = Array.from({ length: Math.ceil(allDrafts.length / 100) }, (_, index) =>
    allDrafts.slice(index * 100, (index + 1) * 100).map((draft) => draft.id));
  for (let offset = 0; offset < publicationQueries.length; offset += 5) {
    const results = await Promise.all(publicationQueries.slice(offset, offset + 5).map((ids) =>
      db.from("teaching_dictionary_manager_publications").select("draft_id").in("draft_id", ids)));
    for (const publications of results) {
      if (publications.error) throw new Error("TEACHING_BATCH_PUBLICATION_READ_FAILED");
      for (const publication of publications.data ?? []) done.add(publication.draft_id);
    }
  }
  const pending = pendingImportDrafts(allDrafts, done);
  const pageCount = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageIds = pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((draft) => draft.id);
  const result = pageIds.length ? await db.from("teaching_dictionary_manager_drafts")
    .select("id,canonical_word_id,normalised_word,payload,created_at").in("id", pageIds)
    .order("normalised_word") : { data: [], error: null };
  if (result.error) throw new Error("TEACHING_BATCH_READ_FAILED");
  const drafts = result.data ?? [];
  const wordIds = drafts.flatMap((draft) => draft.canonical_word_id ? [draft.canonical_word_id] : []);
  const definitions = wordIds.length ? await db.from("teaching_dictionary_definition_versions")
    .select("canonical_word_id,definition,published_at").in("canonical_word_id", wordIds)
    .is("route_id", null).order("published_at", { ascending: false }) : { data: [], error: null };
  if (definitions.error || (definitions.data?.length ?? 0) >= 1000) throw new Error("TEACHING_BATCH_DEFINITION_READ_FAILED");
  const latestDefinitions = new Map<string, string>();
  for (const definition of definitions.data ?? []) {
    if (!latestDefinitions.has(definition.canonical_word_id)) latestDefinitions.set(definition.canonical_word_id, definition.definition);
  }
  const failures = failureCodes(query.failures);
  const pendingIds = new Set(pending.map((draft) => draft.id));
  const failedIds = new Set(Object.keys(failures).filter((id) => pendingIds.has(id)));
  const failedResult = failedIds.size ? await db.from("teaching_dictionary_manager_drafts")
    .select("id,canonical_word_id,normalised_word")
    .in("id", [...failedIds]).like("source_reference", `CSV batch ${batchId},%`) : { data: [], error: null };
  if (failedResult.error) throw new Error("TEACHING_BATCH_FAILURE_READ_FAILED");
  const href = (next: number) => `/admin/teaching-dictionary/imports/${batchId}?page=${next}`;
  return <main className="mx-auto grid max-w-6xl gap-5 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link className="underline" href="/admin/teaching-dictionary">← Teaching Dictionary Manager</Link></nav>
    <header><h1 className="text-3xl font-semibold">CSV import review</h1>
      <p className="mt-2 text-sm">{pending.length} words left to do of {new Set(allDrafts.map((draft) => draft.canonical_word_id ?? draft.normalised_word)).size} imported · page {page} of {pageCount}. Completed words leave this list automatically.</p>
    </header>
    {query.published && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
      Published {query.published} ready drafts in this pass. Checked {query.scanned ?? "0"} drafts.
      {Number(query.failed) > 0 && ` ${query.failed} need individual review.`}
    </p>}
    {(failedResult.data ?? []).length > 0 && <p className="text-sm">Review failed publications: {(failedResult.data ?? []).map((draft, index) => <span key={draft.id}>
      {index > 0 ? ", " : ""}<Link className="underline" href={draft.canonical_word_id
        ? `/admin/teaching-dictionary/${draft.canonical_word_id}?draft=${draft.id}`
        : `/admin/teaching-dictionary/new?draft=${draft.id}`}>{draft.normalised_word}</Link> ({failures[draft.id].replaceAll("_", " ")})
    </span>)}</p>}
    {pending.length > 0 && <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">Publish complete drafts</h2>
      <p className="mt-1 text-sm">Runs the existing word and route validators, up to ten words per pass. Incomplete drafts stay available for editing. Evidence approval remains separate.</p>
      <form action={publishTeachingDictionaryBatch} className="mt-3">
        <input type="hidden" name="batch_id" value={batchId} />
        {query.cursor && isUuid(query.cursor) && <input type="hidden" name="cursor" value={query.cursor} />}
        {query.finished === "true" ? <p className="text-sm">This validation pass reached the end of the import.</p>
          : <button className="rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white">Publish next ten ready words</button>}
      </form>
    </section>}
    {pending.length === 0 ? <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">Every imported word has been published.</p>
      : <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-4">
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
          <td className="p-2">{draft.canonical_word_id && latestDefinitions.get(draft.canonical_word_id) === payload.definition ? "Definition published; other facts pending"
            : failedIds.has(draft.id) ? "Publication needs review"
            : blockers.length ? "Needs facts" : "Ready to validate"}</td>
          <td className="p-2">{blockers.length ? <details><summary>{blockers.length} missing or unreviewed</summary>
            <ul className="mt-1 list-disc pl-5">{blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul>
          </details> : draft.canonical_word_id && latestDefinitions.get(draft.canonical_word_id) === payload.definition
            ? "Route or shared-fact release needed" : "—"}</td>
          <td className="p-2"><Link className="font-semibold underline" href={link}>Open and edit</Link></td>
        </tr>;
      })}</tbody></table>
    </section>}
    <nav className="flex gap-4 text-sm">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
      {page < pageCount && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>
  </main>;
}
