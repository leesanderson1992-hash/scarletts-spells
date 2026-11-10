import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadImportCandidateRequests } from "@/lib/teaching-dictionary-manager/import-candidate-queue";
import { publicationBlockers, routeBlockers, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { pendingImportDrafts, type ImportDraftSummary } from "@/lib/teaching-dictionary-manager/import-review";
import { workspaceErrorMessage } from "@/lib/teaching-dictionary-manager/workspace-errors";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import type { ImportCandidatePending } from "@/lib/teaching-dictionary-manager/import-candidate-handoff";
import { publishTeachingDictionaryBatch, recheckImportedTeachingCandidate } from "../../actions";

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

function candidatePending(value: string | undefined): ImportCandidatePending[] {
  if (!value || value.length > 3000) return [];
  try {
    const rows: unknown = JSON.parse(value);
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is ImportCandidatePending => Boolean(row)
      && typeof row === "object" && isUuid((row as ImportCandidatePending).wordId)
      && typeof (row as ImportCandidatePending).word === "string"
      && (row as ImportCandidatePending).word.length <= 100
      && typeof (row as ImportCandidatePending).skillKey === "string"
      && /^D[0-9]_[A-Z0-9_]+$/.test((row as ImportCandidatePending).skillKey)
      && typeof (row as ImportCandidatePending).reason === "string"
      && (row as ImportCandidatePending).reason.length <= 500).slice(0, 10);
  } catch { return []; }
}

export default async function TeachingDictionaryImportPage({ params, searchParams }: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string; published?: string; failed?: string; scanned?: string; cursor?: string; finished?: string; failures?: string;
    candidateApproved?: string; candidatePendingCount?: string; candidatePending?: string;
    recheck?: string; word?: string }>;
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
  const environment = resolveAdleRouteActivationEnvironment();
  const queued = environment === "staging" || environment === "production"
    ? await loadImportCandidateRequests(db, allDrafts.map(draft => draft.id), environment) : [];
  const outstanding = queued.filter(row => !row.current);
  const namesByWord = new Map(allDrafts.filter(row => row.canonical_word_id)
    .map(row => [row.canonical_word_id, row.normalised_word]));
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
  const pendingCandidates = candidatePending(query.candidatePending);
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
      {Number(query.candidateApproved) > 0 && ` ${query.candidateApproved} supported lesson candidates passed the shared approval checks.`}
    </p>}
    {Number(query.candidatePendingCount) > 0 && <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>{query.candidatePendingCount} supported lesson candidates still need review. Their dictionary facts were published, but candidate approval was not confirmed.</p>
      <ul className="mt-2 list-disc pl-5">{pendingCandidates.map((item) => <li key={`${item.wordId}:${item.skillKey}`}>
        <Link className="underline" href={`/admin/teaching-dictionary/${item.wordId}#td-skills`}>{item.word}</Link>
        {` · ${item.skillKey}: ${item.reason}`}
      </li>)}</ul>
    </div>}
    {query.recheck && isUuid(query.word ?? "") && <p role="status" className={query.recheck === "approved"
      ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
      : "rounded-lg bg-amber-50 p-3 text-sm text-amber-900"}>
      {query.recheck === "approved" ? "The candidate passed the current checks."
        : <>The candidate still needs facts. <Link className="underline" href={`/admin/teaching-dictionary/${query.word}#td-skills`}>Open the word’s lesson checks</Link>.</>}
    </p>}
    {queued.length > 0 && <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">Imported lesson candidates</h2>
      <p className="mt-1 text-sm">{queued.length - outstanding.length} current approvals · {outstanding.length} needing review. This queue remains available after leaving or reloading the import page.</p>
      {outstanding.length > 0 && <ul className="mt-3 grid gap-2 text-sm">{outstanding.slice(0, 50).map(item =>
        <li key={`${item.draft_id}:${item.micro_skill_key}:${item.sense_id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2">
          <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${item.canonical_word_id}#td-skills`}>
            {namesByWord.get(item.canonical_word_id) ?? item.canonical_word_id}</Link>
          <span>{item.micro_skill_key}</span>
          <form action={recheckImportedTeachingCandidate}>
            <input type="hidden" name="batch_id" value={batchId} />
            <input type="hidden" name="draft_id" value={item.draft_id} />
            <input type="hidden" name="word_id" value={item.canonical_word_id} />
            <input type="hidden" name="skill_key" value={item.micro_skill_key} />
            <input type="hidden" name="sense_id" value={item.sense_id} />
            <button className="rounded border border-[var(--border)] px-2 py-1 font-semibold">Recheck requirements</button>
          </form>
        </li>)}</ul>}
      {outstanding.length > 50 && <p className="mt-2 text-sm">Showing the first 50. Resolve these, then reload for the next candidates.</p>}
    </section>}
    {(failedResult.data ?? []).length > 0 && <p className="text-sm">Review failed publications: {(failedResult.data ?? []).map((draft, index) => <span key={draft.id}>
      {index > 0 ? ", " : ""}<Link className="underline" href={draft.canonical_word_id
        ? `/admin/teaching-dictionary/${draft.canonical_word_id}?draft=${draft.id}`
        : `/admin/teaching-dictionary/new?draft=${draft.id}`}>{draft.normalised_word}</Link> ({workspaceErrorMessage(failures[draft.id])})
    </span>)}</p>}
    {pending.length > 0 && <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">Publish complete drafts</h2>
      <p className="mt-1 text-sm">Runs the word and route validators, up to ten words per pass. Supported micro-skill candidates then pass the same fact checks as the word page and bulk assigner. A published word whose candidate still needs facts appears above with a direct review link.</p>
      <form action={publishTeachingDictionaryBatch} className="mt-3">
        <input type="hidden" name="batch_id" value={batchId} />
        {query.finished !== "true" && query.cursor && isUuid(query.cursor) && <input type="hidden" name="cursor" value={query.cursor} />}
        <label className="mb-3 flex items-start gap-2 text-sm"><input type="checkbox" name="reviewed_facts" value="confirmed" required />
          <span>I confirm that I have human-reviewed the facts, word parts and meanings in this import batch.</span></label>
        {query.finished === "true" && <p className="mb-2 text-sm">This validation pass reached the end of the import. Correct remaining drafts, then run another pass.</p>}
        <button className="rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white">
          {query.finished === "true" ? "Recheck remaining words" : "Publish next ten ready words"}
        </button>
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
          <td className="p-2">{failedIds.has(draft.id) ? "Publication needs review"
            : draft.canonical_word_id && latestDefinitions.get(draft.canonical_word_id) === payload.definition ? "Definition published; other facts pending"
            : blockers.length ? "Needs facts" : "Ready to validate"}</td>
          <td className="p-2">{failedIds.has(draft.id) ? workspaceErrorMessage(failures[draft.id]) : blockers.length ? <details><summary>{blockers.length} missing or unreviewed</summary>
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
