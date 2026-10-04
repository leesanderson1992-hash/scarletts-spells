import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NoMatchingSkillWorkspace, type NoSkillRow } from "./workspace";
import "../adle-canonical-intake-readiness/readiness.css";
import "../canonical-mappings/resolution.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
type SearchParams = Record<string, string | undefined>;

async function loadSkillReadiness(skillKey: string) {
  if (!/^D4_[A-Z0-9_]+$/.test(skillKey)) return null;
  const db = createServiceRoleClient();
  const [skillResult, memberResult, contentResult] = await Promise.all([
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_family_key")
      .eq("micro_skill_key", skillKey).eq("mastery_domain_key", "D4").maybeSingle(),
    db.from("contextual_micro_skill_members").select("member_normalized")
      .eq("micro_skill_key", skillKey),
    db.from("canonical_teaching_dictionary_content_versions")
      .select("id").eq("micro_skill_key", skillKey).eq("is_active", true)
      .eq("version_status", "active").eq("final_readiness_review_status", "signed_off").limit(1),
  ]);
  if (skillResult.error || memberResult.error || contentResult.error || !skillResult.data) return null;
  const methodResult = await db.from("adle_family_methods").select("id")
    .eq("family_key", skillResult.data.skill_family_key).eq("row_status", "active").limit(1);
  if (methodResult.error) return null;
  const members = (memberResult.data ?? []).map((row) => row.member_normalized);
  const missingWords: string[] = [];
  const missingSupport: string[] = [];
  if (members.length) {
    const wordsResult = await db.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word").in("normalised_word", members)
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
    if (wordsResult.error) return null;
    const words = wordsResult.data ?? [];
    const wordByText = new Map(words.map((word) => [word.normalised_word, word.id]));
    for (const member of members) if (!wordByText.has(member)) missingWords.push(member);
    if (words.length) {
      const supportResult = await db.from("canonical_teaching_dictionary_word_support")
        .select("canonical_word_id").eq("micro_skill_key", skillKey)
        .in("canonical_word_id", words.map((word) => word.id))
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure");
      if (supportResult.error) return null;
      const supported = new Set((supportResult.data ?? []).map((row) => row.canonical_word_id));
      for (const member of members) {
        const id = wordByText.get(member);
        if (id && !supported.has(id)) missingSupport.push(member);
      }
    }
  }
  return {
    name: skillResult.data.display_name,
    key: skillResult.data.micro_skill_key,
    missingMembers: skillResult.data.skill_family_key.startsWith("D4_HOM") && members.length < 2,
    missingWords,
    missingSupport,
    teachingReady: Boolean(contentResult.data?.length),
    familyMethodReady: Boolean(methodResult.data?.length),
  };
}

function pageHref(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  return `/admin/no-matching-skill${params.size ? `?${params}` : ""}`;
}

export default async function NoMatchingSkillPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().slice(0, 100);
  const readiness = params.skill ? await loadSkillReadiness(params.skill) : null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const safe = q.replace(/[^a-zA-Z0-9'’ʼ-]/g, "").trim();
  const db = createServiceRoleClient();
  let query = db.from("spelling_no_matching_skill_queue")
    .select("*", { count: "exact" });
  if (safe) query = query.or(`misspelling.ilike.%${safe}%,correction.ilike.%${safe}%`);
  const { data, count, error } = await query.order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NoSkillRow[];
  const [skillResult, familyResult, clusterResult, memberResult] = await Promise.all([
    db.from("micro_skill_catalog")
      .select("micro_skill_key,display_name,skill_family_key,skill_cluster_key")
      .eq("mastery_domain_key", "D4").eq("is_active", true).eq("is_assignable", true).order("display_name"),
    db.from("micro_skill_families").select("skill_family_key,display_name")
      .eq("mastery_domain_key", "D4").eq("is_active", true).order("display_name"),
    db.from("micro_skill_clusters").select("skill_cluster_key,skill_family_key,display_name")
      .eq("mastery_domain_key", "D4").eq("is_active", true).order("display_name"),
    db.from("contextual_micro_skill_members").select("micro_skill_key,member_display"),
  ]);
  const optionError = skillResult.error ?? familyResult.error ?? clusterResult.error ?? memberResult.error;
  if (optionError) throw new Error(optionError.message);
  const membersBySkill: Record<string, string[]> = {};
  for (const member of memberResult.data ?? []) {
    (membersBySkill[member.micro_skill_key] ??= []).push(member.member_display);
  }
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <main className="adle-admin-page resolution-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="adle-admin-eyebrow">Admin / Spelling</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">No Matching Skill</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">
            Parent-confirmed contextual choices and spelling pairs waiting for a micro skill.
          </p>
        </div>
        <Link href="/admin/canonical-mappings" className="adle-admin-secondary">Canonical Misspelling Resolver</Link>
      </header>
      {params.saved ? <p role="status" className="adle-admin-success">{params.saved}</p> : null}
      {params.error ? <p role="alert" className="adle-admin-alert">{params.error}</p> : null}
      {readiness ? <section className="adle-admin-detail-section mb-5 text-sm" aria-label="Micro skill lesson readiness">
        <h2 className="font-semibold">Lesson readiness · {readiness.name}</h2>
        <p className="break-all text-xs text-[#59616b]">{readiness.key}</p>
        {!readiness.missingMembers && readiness.missingWords.length === 0 && readiness.missingSupport.length === 0 && readiness.teachingReady && readiness.familyMethodReady
          ? <p className="mt-2">Words, word support, and teaching content are approved. The lesson still waits for three parent-confirmed misuses by a child.</p>
          : <ul className="mt-2 list-disc pl-5">
            {readiness.missingMembers ? <li>The full confusable word set needs approval.</li> : null}
            {readiness.missingWords.length ? <li>Canonical words need approval: {readiness.missingWords.join(", ")}</li> : null}
            {readiness.missingSupport.length ? <li>Word support needs approval: {readiness.missingSupport.join(", ")}</li> : null}
            {!readiness.teachingReady ? <li>Teaching content needs a signed-off active version.</li> : null}
            {!readiness.familyMethodReady ? <li>This family needs an active ADLE teaching method.</li> : null}
          </ul>}
      </section> : null}
      <div className="adle-admin-toolbar">
        <form action="/admin/no-matching-skill" method="get" role="search" className="adle-admin-filter-form">
          <label htmlFor="no-skill-search" className="sr-only">Search observed or intended word</label>
          <input id="no-skill-search" name="q" type="search" defaultValue={q}
            placeholder="Search observed or intended word" className="adle-admin-search" />
          <button type="submit" className="adle-admin-primary">Search</button>
        </form>
      </div>
      <p className="mb-3 text-sm text-[#59616b]">{total} {total === 1 ? "case" : "cases"}</p>
      <NoMatchingSkillWorkspace rows={rows} skills={skillResult.data ?? []}
        families={familyResult.data ?? []} clusters={clusterResult.data ?? []}
        membersBySkill={membersBySkill} />
      <nav aria-label="Table pages" className="mt-5 flex items-center justify-end gap-3 text-sm">
        {page > 1 ? <Link href={pageHref(q, page - 1)} className="adle-admin-secondary">Previous</Link> : null}
        <span>Page {page} of {totalPages}</span>
        {page < totalPages ? <Link href={pageHref(q, page + 1)} className="adle-admin-secondary">Next</Link> : null}
      </nav>
    </div>
  </main>;
}
