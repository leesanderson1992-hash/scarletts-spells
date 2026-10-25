import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadCachedTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { routeForSkill } from "@/lib/teaching-dictionary-manager/contracts";
import { CsvImportPanel } from "./csv-import-panel";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const MEMBER_CHECK_ROUTES = new Set(["dynamic_prefix_word_lab", "dynamic_affix_word_lab", "base_word_lab"]);

type Word = { id: string; normalised_word: string; display_word: string; age_band: string | null; frequency_band: string | null; row_status: string };
type SearchParams = { q?: string; filter?: string; page?: string; saved?: string; error?: string };
type PrefixMember = { canonical_word_id: string; prefix_profile_id: string; row_status: string };
type SuffixMember = { canonical_word_id: string; suffix_profile_id: string; row_status: string };
type BaseMember = { canonical_word_id: string; row_status: string };
type Profile = { id: string; micro_skill_key: string; row_status: string; production_enabled: boolean };
type RouteContent = { canonical_word_id: string; route_id: string; micro_skill_key: string };

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const db = createServiceRoleClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from(table).select(columns).order("id", { ascending: true }).range(start, start + 499);
    if (result.error) throw new Error(`TEACHING_DICTIONARY_READ_FAILED:${table}`);
    rows.push(...(result.data as T[]));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

async function readForWords<T>(table: string, columns: string, wordIds: string[]): Promise<T[]> {
  if (wordIds.length === 0) return [];
  const rows: T[] = [];
  const db = createServiceRoleClient();
  for (let at = 0; at < wordIds.length; at += 100) {
    for (let start = 0; ; start += 500) {
      const result = await db.from(table).select(columns).in("canonical_word_id", wordIds.slice(at, at + 100))
        .order("id", { ascending: true }).range(start, start + 499);
      if (result.error) throw new Error(`TEACHING_DICTIONARY_READ_FAILED:${table}`);
      rows.push(...(result.data as T[]));
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  return rows;
}

async function loadRouteFacts(wordIds: string[]) {
  const read = <T,>(table: string, columns: string) => readForWords<T>(table, columns, wordIds);
  const [prefixes, suffixes, baseMembers, prefixProfiles, suffixProfiles, routeContent] = await Promise.all([
    read<PrefixMember>("canonical_teaching_dictionary_prefix_members", "id,canonical_word_id,prefix_profile_id,row_status"),
    read<SuffixMember>("canonical_teaching_dictionary_suffix_members", "id,canonical_word_id,suffix_profile_id,row_status"),
    read<BaseMember>("canonical_teaching_dictionary_base_word_family_members", "id,canonical_word_id,row_status"),
    readAll<Profile>("canonical_teaching_dictionary_prefix_profiles", "id,micro_skill_key,row_status,production_enabled"),
    readAll<Profile>("canonical_teaching_dictionary_suffix_profiles", "id,micro_skill_key,row_status,production_enabled"),
    read<RouteContent>("teaching_dictionary_route_content_versions", "id,canonical_word_id,route_id,micro_skill_key"),
  ]);
  const prefixById = new Map(prefixProfiles.filter((row) => row.row_status === "active" && row.production_enabled).map((row) => [row.id, row.micro_skill_key]));
  const suffixById = new Map(suffixProfiles.filter((row) => row.row_status === "active" && row.production_enabled).map((row) => [row.id, row.micro_skill_key]));
  const routeMembers = new Set([
    ...prefixes.filter((row) => row.row_status === "active" && prefixById.has(row.prefix_profile_id)).map((row) => `${row.canonical_word_id}:${prefixById.get(row.prefix_profile_id)}`),
    ...suffixes.filter((row) => row.row_status === "active" && suffixById.has(row.suffix_profile_id)).map((row) => `${row.canonical_word_id}:${suffixById.get(row.suffix_profile_id)}`),
    ...baseMembers.filter((row) => row.row_status === "active").map((row) => `${row.canonical_word_id}:base_word_lab`),
  ]);
  const routeKeysByWord = new Map<string, string[]>();
  for (const content of routeContent) routeKeysByWord.set(content.canonical_word_id,
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
  const q = (params.q ?? "").trim().toLocaleLowerCase("en-GB").slice(0, 100);
  const filter = ["all", "missing_metadata", "evidence_approved", "route_blocked"].includes(params.filter ?? "all")
    ? params.filter ?? "all" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const environment = resolveAdleRouteActivationEnvironment();
  const db = createServiceRoleClient();
  const authorityPromise = environment ? loadCachedTeachingDictionaryEvidenceAuthority(environment) : Promise.resolve(null);
  const draftsPromise = db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,normalised_word,created_at").order("created_at", { ascending: false }).limit(12);
  const [drafts, authority] = await Promise.all([draftsPromise, authorityPromise]);
  if (drafts.error) throw new Error("TEACHING_DRAFT_READ_FAILED");
  const skillsByWord = new Map<string, string[]>();
  for (const relationship of authority?.relationships ?? []) {
    skillsByWord.set(relationship.canonicalWordId, [...(skillsByWord.get(relationship.canonicalWordId) ?? []), relationship.microSkillKey]);
  }
  const routeBlockedResult = filter === "route_blocked" ? await db.rpc("teaching_dictionary_admin_route_blocked_ids", {
    p_approved_pairs: (authority?.relationships ?? []).flatMap((relationship) => {
      const routeId = routeForSkill(relationship.microSkillKey)?.routeId;
      return routeId && MEMBER_CHECK_ROUTES.has(routeId)
        ? [{ wordId: relationship.canonicalWordId, microSkillKey: relationship.microSkillKey, routeId }]
        : [];
    }),
  }) : null;
  if (routeBlockedResult?.error) throw new Error(`TEACHING_DICTIONARY_ROUTE_FILTER_FAILED:${routeBlockedResult.error.message}`);
  const candidateIds = filter === "evidence_approved" ? [...skillsByWord.keys()]
    : filter === "route_blocked" ? routeBlockedResult?.data as string[] ?? [] : null;
  const pageResult = await db.rpc("teaching_dictionary_admin_filtered_page", {
    p_filter: filter, p_search: q, p_word_ids: candidateIds,
    p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (pageResult.error) throw new Error(`TEACHING_DICTIONARY_WORD_READ_FAILED:${pageResult.error.message}`);
  const pageData = pageResult.data as { words: Word[]; total: number } | null;
  const shown = pageData?.words ?? [];
  const total = pageData?.total ?? 0;
  const wordIds = shown.map((word) => word.id);
  const [metadata, dictation, displayRouteFacts] = await Promise.all([
    readForWords<{ canonical_word_id: string; row_status: string; review_status: string; syllables: string | null; written_syllable_breakdown: string | null; phoneme_hint: string | null; stress_pattern: string | null; has_schwa: boolean | null; morphemes: string | null; morphology_notes: string | null }>("canonical_teaching_dictionary_word_metadata", "id,canonical_word_id,row_status,review_status,syllables,written_syllable_breakdown,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes", wordIds),
    readForWords<{ canonical_word_id: string; row_status: string; review_status: string }>("canonical_teaching_dictionary_dictation_sentences", "id,canonical_word_id,row_status,review_status", wordIds),
    wordIds.length ? loadRouteFacts(wordIds) : Promise.resolve(null),
  ]);
  const routeKeysByWord = displayRouteFacts?.routeKeysByWord ?? new Map<string, string[]>();
  const routeMembers = displayRouteFacts?.routeMembers ?? new Set<string>();
  const metadataReady = new Set(metadata.filter((row) => row.row_status === "active" && row.review_status === "approved_for_first_exposure"
    && row.syllables?.trim() && row.phoneme_hint?.trim() && row.stress_pattern?.trim()
    && typeof row.has_schwa === "boolean" && row.morphemes?.trim() && row.morphology_notes != null).map((row) => row.canonical_word_id));
  const metadataByWord = new Map(metadata.filter((row) => row.row_status === "active")
    .map((row) => [row.canonical_word_id, row]));
  const dictationReady = new Set(dictation.filter((row) => row.row_status === "active" && row.review_status === "approved_for_first_exposure").map((row) => row.canonical_word_id));
  const href = (next: number) => `${"/admin/teaching-dictionary"}?${new URLSearchParams({ q, filter, page: String(next) })}`;
  return <main className="mx-auto grid max-w-7xl gap-6 p-6 text-[color:var(--ink)]">
    <header><h1 className="text-3xl font-semibold">Teaching Dictionary Manager</h1><p className="mt-2 text-sm">Manage shared word facts, exact evidence approvals, and ADLE route readiness in one place.</p></header>
    {params.saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">Saved.</p>}
    {params.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-900">{params.error.replaceAll("_", " ")}</p>}
    <nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white" href="/admin/teaching-dictionary/new">Add word</Link><Link className="rounded-lg border border-[var(--border)] px-4 py-2" href="/admin/teaching-dictionary/bulk-assign">Assign words to a micro-skill</Link><Link className="rounded-lg border border-[var(--border)] px-4 py-2" href="/admin/adle-lesson-readiness">ADLE lesson readiness and launch</Link><Link className="rounded-lg border border-[var(--border)] px-4 py-2" href="/admin/teaching-dictionary/routes">ADLE activity requirements</Link><Link className="rounded-lg border border-[var(--border)] px-4 py-2" href="/admin/adle-canonical-intake-readiness">Child readiness</Link></nav>
    <CsvImportPanel />
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <input className="rounded-lg border border-[var(--border)] px-3 py-2" name="q" placeholder="Search all words" defaultValue={q} />
        <select className="rounded-lg border border-[var(--border)] px-3 py-2" name="filter" defaultValue={filter}>
          <option value="all">All active words</option><option value="missing_metadata">Missing core facts or dictation</option>
          <option value="evidence_approved">Evidence approved</option><option value="route_blocked">Prefix, suffix or base member missing</option>
        </select><button className="rounded-lg border border-[var(--border)] px-4 py-2">Filter</button>
      </form>
      <p className="my-4 text-sm">{total} words · page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Word</th><th className="p-2">Dictionary facts</th><th className="p-2">Evidence skills</th><th className="p-2">ADLE route</th></tr></thead><tbody>
        {shown.map((word) => {
          const keys = skillsByWord.get(word.id) ?? [];
          const missing = !metadataReady.has(word.id) || !dictationReady.has(word.id) || !word.age_band || !word.frequency_band;
          const routeKeys = routeKeysByWord.get(word.id) ?? [];
          const missingRoute = [...new Set([...keys, ...routeKeys])].some((key) => memberMissing(word.id, key, routeMembers));
          const governedPending = routeKeys.some((key) => ["base_word_lab", "compound_word_lab"].includes(routeForSkill(key)?.routeId ?? ""));
          const fact = metadataByWord.get(word.id);
          return <tr key={word.id} className="border-b last:border-0"><td className="p-2 font-semibold"><Link className="underline" href={`/admin/teaching-dictionary/${word.id}`}>{word.display_word}</Link><div className="mt-1 text-xs font-normal">Written: {fact?.written_syllable_breakdown || "No reviewed split"}</div><div className="text-xs font-normal">Phoneme: {fact?.phoneme_hint || "Unknown"}</div></td><td className="p-2">{missing ? "Needs facts" : "Present"}<div className="text-xs">{fact?.syllables || "Unknown"} spoken syllables</div></td><td className="p-2">{keys.length} approved</td><td className="p-2">{missingRoute ? "Member missing" : governedPending ? "Governed release check" : keys.length ? "Check child gates" : "No specialist skill"}</td></tr>;
        })}
      </tbody></table></div>
      <div className="mt-4 flex gap-3">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}{page * PAGE_SIZE < total && <Link href={href(page + 1)}>Next</Link>}</div>
    </section>
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Recent drafts</h2><ul className="mt-2 grid gap-1 text-sm">{(drafts.data ?? []).map((draft) => <li key={draft.id}><Link className="underline" href={draft.canonical_word_id ? `/admin/teaching-dictionary/${draft.canonical_word_id}?draft=${draft.id}` : `/admin/teaching-dictionary/new?draft=${draft.id}`}>{draft.normalised_word}</Link> · {new Date(draft.created_at).toLocaleString("en-GB")}</li>)}</ul></section>
  </main>;
}
