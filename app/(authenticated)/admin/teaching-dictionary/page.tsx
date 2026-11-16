import Link from "next/link";
import { normaliseWrittenSyllableBreakdown } from "@/lib/teaching-dictionary-manager/authoring";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadCachedTeachingDictionaryEvidenceAuthority, loadCachedTeachingDictionaryEvidenceAuthorityForWords } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { routeForSkill } from "@/lib/teaching-dictionary-manager/contracts";
import { CATALOGUE_FILTERS, CATALOGUE_PAGE_SIZE, CATALOGUE_PATH, catalogueHref, catalogueWordHref,
  readCatalogueQuery, type CatalogueQuery } from "@/lib/teaching-dictionary-manager/catalogue-navigation";
import { CatalogueRowFocus } from "./catalogue-row-focus";

export const dynamic = "force-dynamic";
const MEMBER_CHECK_ROUTES = new Set(["dynamic_prefix_word_lab", "dynamic_affix_word_lab", "base_word_lab"]);

type Word = { id: string; normalised_word: string; display_word: string; age_band: string | null; frequency_band: string | null; row_status: string };
type SearchParams = CatalogueQuery & { saved?: string; error?: string; resume?: string };

type Metadata = { canonical_word_id: string; row_status: string; review_status: string; syllables: string | null; written_syllable_breakdown: string | null; phoneme_hint: string | null; stress_pattern: string | null; has_schwa: boolean | null; morphemes: string | null; morphology_notes: string | null };
type PageFacts = { metadata: Metadata[]; dictation: { canonical_word_id: string; row_status: string; review_status: string }[]; route_members: { canonical_word_id: string; micro_skill_key: string }[]; route_content: { canonical_word_id: string; micro_skill_key: string }[] };

function displayRouteFacts(facts: PageFacts) {
  const routeMembers = new Set(facts.route_members.map(row => `${row.canonical_word_id}:${row.micro_skill_key}`));
  const routeKeysByWord = new Map<string, string[]>();
  for (const content of facts.route_content) routeKeysByWord.set(content.canonical_word_id,
    [...new Set([...(routeKeysByWord.get(content.canonical_word_id) ?? []), content.micro_skill_key])]);
  return { routeMembers, routeKeysByWord };
}

function memberMissing(wordId: string, key: string, routeMembers: ReadonlySet<string>) {
  const route = routeForSkill(key);
  if (!route || !MEMBER_CHECK_ROUTES.has(route.routeId)) return false;
  return !routeMembers.has(`${wordId}:${key}`) && !(route.routeId === "base_word_lab" && routeMembers.has(`${wordId}:base_word_lab`));
}

export default async function TeachingDictionaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminUser();
  const params = await searchParams;
  const location = readCatalogueQuery(params);
  const { q, filter, page, child } = location;
  const environment = resolveAdleRouteActivationEnvironment();
  const db = createServiceRoleClient();
  const needsGlobalAuthority = filter === "evidence_approved" || filter === "route_blocked";
  const globalAuthorityPromise = environment && needsGlobalAuthority
    ? loadCachedTeachingDictionaryEvidenceAuthority(environment) : Promise.resolve(null);
  const initialPagePromise = !needsGlobalAuthority && filter !== "awaiting_british_recording" ? db.rpc("teaching_dictionary_admin_filtered_page", {
    p_filter: filter, p_search: q, p_word_ids: null,
    p_limit: CATALOGUE_PAGE_SIZE, p_offset: (page - 1) * CATALOGUE_PAGE_SIZE,
  }) : null;
  const globalAuthority = await globalAuthorityPromise;
  const globalApprovedIds = [...new Set((globalAuthority?.relationships ?? []).map((row) => row.canonicalWordId))];
  const routeBlockedResult = filter === "route_blocked" ? await db.rpc("teaching_dictionary_admin_route_blocked_ids", {
    p_approved_pairs: (globalAuthority?.relationships ?? []).flatMap((relationship) => {
      const routeId = routeForSkill(relationship.microSkillKey)?.routeId;
      return routeId && MEMBER_CHECK_ROUTES.has(routeId)
        ? [{ wordId: relationship.canonicalWordId, microSkillKey: relationship.microSkillKey, routeId }]
        : [];
    }),
  }) : null;
  if (routeBlockedResult?.error) throw new Error(`TEACHING_DICTIONARY_ROUTE_FILTER_FAILED:${routeBlockedResult.error.message}`);
  const awaitingResult = filter === "awaiting_british_recording"
    ? await db.rpc("teaching_dictionary_awaiting_british_recording_ids") : null;
  if (awaitingResult?.error) throw new Error(`TEACHING_DICTIONARY_AUDIO_FILTER_FAILED:${awaitingResult.error.message}`);
  const candidateIds = filter === "evidence_approved" ? globalApprovedIds
    : filter === "route_blocked" ? routeBlockedResult?.data as string[] ?? []
      : filter === "awaiting_british_recording" ? awaitingResult?.data as string[] ?? [] : null;
  const pageResult = await (initialPagePromise ?? db.rpc("teaching_dictionary_admin_filtered_page", {
    p_filter: filter, p_search: q, p_word_ids: candidateIds,
    p_limit: CATALOGUE_PAGE_SIZE, p_offset: (page - 1) * CATALOGUE_PAGE_SIZE,
  }));
  if (pageResult.error) throw new Error(`TEACHING_DICTIONARY_WORD_READ_FAILED:${pageResult.error.message}`);
  const pageData = pageResult.data as { words: Word[]; total: number } | null;
  const shown = pageData?.words ?? [];
  const total = pageData?.total ?? 0;
  const wordIds = shown.map((word) => word.id);
  const authorityPromise = needsGlobalAuthority ? globalAuthorityPromise
    : environment && wordIds.length ? loadCachedTeachingDictionaryEvidenceAuthorityForWords(environment, wordIds)
      : Promise.resolve(null);
  const [authority, pageFactsResult, reviewedWords] = await Promise.all([
    authorityPromise,
    wordIds.length ? db.rpc("teaching_dictionary_admin_page_facts", { p_word_ids: wordIds })
      : Promise.resolve({ data: { metadata: [], dictation: [], route_members: [], route_content: [] }, error: null }),
    wordIds.length ? db.from("teaching_dictionary_reviewed_sense_sets")
      .select("canonical_word_id").in("canonical_word_id", wordIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reviewedWords.error) throw new Error("TEACHING_REVIEWED_WORDS_READ_FAILED");
  const csvWordIds = new Set(reviewedWords.data?.map(row => row.canonical_word_id));
  if (pageFactsResult.error || !pageFactsResult.data) throw new Error("TEACHING_DICTIONARY_PAGE_FACTS_READ_FAILED");
  const facts = pageFactsResult.data as PageFacts;
  const { metadata, dictation } = facts;
  const skillsByWord = new Map<string, string[]>();
  for (const relationship of authority?.relationships ?? []) {
    skillsByWord.set(relationship.canonicalWordId, [...(skillsByWord.get(relationship.canonicalWordId) ?? []), relationship.microSkillKey]);
  }
  const { routeKeysByWord, routeMembers } = displayRouteFacts(facts);
  const metadataReady = new Set(metadata.filter((row) => row.row_status === "active" && row.review_status === "approved_for_first_exposure"
    && row.syllables?.trim() && row.phoneme_hint?.trim() && row.stress_pattern?.trim()
    && typeof row.has_schwa === "boolean" && row.morphemes?.trim() && row.morphology_notes != null).map((row) => row.canonical_word_id));
  const metadataByWord = new Map(metadata.filter((row) => row.row_status === "active")
    .map((row) => [row.canonical_word_id, row]));
  const dictationReady = new Set(dictation.filter((row) => row.row_status === "active" && row.review_status === "approved_for_first_exposure").map((row) => row.canonical_word_id));
  const pageCount = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));
  const pageHref = (next: number) => catalogueHref({ ...location, page: next });
  const resetHref = catalogueHref(readCatalogueQuery({ child }));

  return <main className="mx-auto grid max-w-7xl gap-5 p-4 text-[color:var(--ink)] sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[color:var(--mid)]">Teaching Dictionary</p>
        <h1 className="text-3xl font-semibold">Catalogue</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link id="word-csv-import" className="scroll-mt-16 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold"
          prefetch={false} href={`${CATALOGUE_PATH}/import`}>Import words</Link>
        <Link className="rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
          prefetch={false} href={`${CATALOGUE_PATH}/new`}>Add word</Link>
      </div>
    </header>
    {params.saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">Saved.</p>}
    {typeof params.error === "string" && params.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-900">{params.error.replaceAll("_", " ")}</p>}
    <section id="dictionary-word-search" aria-labelledby="dictionary-word-search-heading"
      className="scroll-mt-16 rounded-xl border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
      <h2 id="dictionary-word-search-heading" className="mb-3 text-lg font-semibold">Find existing words</h2>
      <form action={`${CATALOGUE_PATH}#dictionary-word-search`} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {child && <input type="hidden" name="child" value={child} />}
        <label className="grid gap-1 text-sm font-medium">
          Search words
          <input aria-label="Search dictionary words" className="min-w-0 rounded-lg border border-[var(--border)] px-3 py-2"
            type="search" name="q" placeholder="Enter a spelling, e.g. boxing" defaultValue={q} maxLength={100} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Filter
          <select aria-label="Filter words" className="min-w-0 rounded-lg border border-[var(--border)] px-3 py-2" name="filter" defaultValue={filter}>
            {Object.entries(CATALOGUE_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold">Search</button>
      </form>
      <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{total.toLocaleString("en-GB")} {total === 1 ? "word" : "words"} · page {page} of {pageCount}</p>
        {(q || filter !== "all" || page > 1) && <Link className="underline" prefetch={false} href={resetHref}>Clear search and filters</Link>}
      </div>
      {typeof params.resume === "string" && !wordIds.includes(params.resume) && <p role="status" className="mb-3 text-sm">
        The word you opened is no longer on this page of results.
      </p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th scope="col" className="p-2">Word</th>
              <th scope="col" className="p-2">Dictionary facts</th>
              <th scope="col" className="p-2">ADLE route</th>
              <th scope="col" className="p-2">Meaning review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {shown.map((word) => {
              const keys = skillsByWord.get(word.id) ?? [];
              const missing = !metadataReady.has(word.id) || !dictationReady.has(word.id) || !word.age_band || !word.frequency_band;
              const routeKeys = routeKeysByWord.get(word.id) ?? [];
              const missingRoute = [...new Set([...keys, ...routeKeys])].some((key) => memberMissing(word.id, key, routeMembers));
              const fact = metadataByWord.get(word.id);
              return <tr key={word.id} className="align-top">
                <td className="p-2">
                  <Link id={`catalogue-word-${word.id}`} className="scroll-mt-16 font-semibold underline" prefetch={false}
                    href={catalogueWordHref(word.id, location)}>{word.display_word}</Link>
                  <p className="mt-1 text-xs">Written: {fact?.written_syllable_breakdown ? normaliseWrittenSyllableBreakdown(fact.written_syllable_breakdown) : "No reviewed split"}</p>
                  <p className="text-xs">Phoneme: {fact?.phoneme_hint || "Unknown"}</p>
                </td>
                <td className="p-2">
                  <span className={missing ? "font-semibold text-[color:var(--warning)]" : undefined}>{missing ? "Needs facts" : "Present"}</span>
                  <p className="text-xs">{fact?.syllables || "Unknown"} spoken syllables</p>
                </td>
                <td className="p-2">
                  {missingRoute && <span className="mr-1 font-semibold text-[color:var(--warning)]">Member missing ·</span>}
                  {keys.length || routeKeys.length ? <Link className="underline" prefetch={false}
                    href={catalogueWordHref(word.id, location, "#td-skills")}>View route status</Link> : "No specialist skill"}
                </td>
                <td className="p-2">
                  {csvWordIds.has(word.id) ? <a className="underline" aria-label={`Download word CSV for ${word.display_word}`}
                    href={`${CATALOGUE_PATH}/export/multi-sense?word_id=${word.id}`}>Download word CSV</a>
                    : q ? <Link className="underline" prefetch={false}
                      href={catalogueWordHref(word.id, location, "#td-overview")}>Review meanings first</Link> : "—"}
                </td>
              </tr>;
            })}
            {!shown.length && <tr><td className="p-3" colSpan={4}>
              {total ? "This page is outside the results." : "No words match this search and filter."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      {typeof params.resume === "string" && <CatalogueRowFocus id={`catalogue-word-${params.resume}`} />}
      {(page > 1 || page < pageCount) && <nav aria-label="Catalogue pages" className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
        {page > pageCount
          ? <Link className="underline" prefetch={false} href={pageHref(1)}>First page</Link>
          : page > 1 && <Link className="underline" prefetch={false} href={pageHref(page - 1)}>← Previous</Link>}
        {page < pageCount && <Link className="underline" prefetch={false} href={pageHref(page + 1)}>Next →</Link>}
      </nav>}
    </section>
    <details>
      <summary className="cursor-pointer text-sm font-semibold">Other dictionary tools</summary>
      <nav aria-label="Other dictionary tools" className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link className="underline" prefetch={false} href={`${CATALOGUE_PATH}/format-review`}>Review dictionary formats</Link>
        <Link className="underline" prefetch={false} href="/admin/adle-lesson-readiness">Lesson approval and release status</Link>
        <Link className="underline" prefetch={false} href={`${CATALOGUE_PATH}/routes`}>ADLE activity requirements</Link>
        <Link className="underline" prefetch={false} href="/admin/adle-canonical-intake-readiness">Child readiness</Link>
      </nav>
    </details>
  </main>;
}
