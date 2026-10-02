import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { createIntakeResolverMapping, enableIntakeResolverMapping } from "./actions";
import "../../adle-canonical-intake-readiness/readiness.css";

export const dynamic = "force-dynamic";

export default async function ResolveIntakeMappingPage({ searchParams }: {
  searchParams?: Promise<{ word?: string; skill?: string; saved?: string; error?: string }>;
}) {
  await requireAdminUser();
  const params = await searchParams ?? {};
  const word = (params.word ?? "").trim().toLowerCase().slice(0, 200);
  const skill = (params.skill ?? "").trim().slice(0, 200);
  const db = createServiceRoleClient();
  const candidateResult = word && skill ? await db.from("adle_canonical_intake_candidates")
    .select("source_candidate_mapping_id").eq("normalized_target_token", word)
    .eq("micro_skill_key", skill) : { data: [], error: null };
  if (candidateResult.error) throw new Error(candidateResult.error.message);
  const ids = [...new Set((candidateResult.data ?? []).map((row) => row.source_candidate_mapping_id).filter(Boolean))];
  const sourceResult = ids.length ? await db.from("parent_verified_spelling_candidate_mappings")
    .select("id,misspelling_normalized,correct_spelling_normalized,micro_skill_key").in("id", ids)
    : { data: [], error: null };
  if (sourceResult.error) throw new Error(sourceResult.error.message);
  const sources = [...new Map((sourceResult.data ?? [])
    .filter((row) => row.correct_spelling_normalized === word && row.micro_skill_key === skill)
    .map((row) => [row.misspelling_normalized, row])).values()];
  const misspellings = [...new Set(sources.map((row) => row.misspelling_normalized))];
  const mappingResult = misspellings.length ? await db.from("spelling_canonical_mappings")
    .select("id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status")
    .in("misspelling_normalized", misspellings).eq("micro_skill_key", skill) : { data: [], error: null };
  if (mappingResult.error) throw new Error(mappingResult.error.message);
  const mappings = mappingResult.data ?? [];
  return <main className="adle-admin-page min-h-screen px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-4xl"><Link href="/admin/adle-canonical-intake-readiness" className="text-sm text-[#c2185b]">← Back to ADLE readiness</Link>
      <h1 className="mt-5 text-3xl font-bold">Add to resolver</h1>
      <p className="mt-2 text-sm text-[#59616b]">{word} · {skill}</p>
      <p className="mt-3 text-sm text-[#59616b]">Review each authentic misspelling. New mappings begin hidden; a separate audited visibility action makes them available to the resolver.</p>
      {params.error ? <p role="alert" className="adle-admin-alert mt-4">{params.error}</p> : null}
      {params.saved ? <p role="status" className="adle-admin-success mt-4">{params.saved}</p> : null}
      <div className="mt-6 grid gap-3">{sources.length ? sources.map((source) => {
        const exact = mappings.find((row) => row.misspelling_normalized === source.misspelling_normalized &&
          row.correct_spelling_normalized === word);
        const conflict = mappings.some((row) => row.misspelling_normalized === source.misspelling_normalized &&
          row.correct_spelling_normalized !== word && row.resolver_visibility_status === "visible");
        return <section key={source.id} className="rounded-xl border border-[#dfe3e7] p-5">
          <h2 className="font-bold">{source.misspelling_normalized} → {word}</h2>
          {conflict ? <p className="mt-2 text-sm text-[#a9144f]">A conflicting visible mapping exists. Resolve that conflict before enabling this pair.</p> : null}
          {exact ? <><p className="mt-2 text-sm">Mapping: {exact.mapping_status} · Visibility: {exact.resolver_visibility_status}</p>
            {exact.mapping_status === "active" && exact.resolver_visibility_status !== "visible" && !conflict ?
              <form action={enableIntakeResolverMapping} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="word" value={word} /><input type="hidden" name="skill" value={skill} />
                <input type="hidden" name="mapping_id" value={exact.id} />
                <input name="note" required maxLength={600} placeholder="Review note" className="adle-admin-search" />
                <button className="adle-admin-primary">Enable resolver visibility</button>
              </form> : null}</> : <form action={createIntakeResolverMapping} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="word" value={word} /><input type="hidden" name="skill" value={skill} />
              <input type="hidden" name="source_id" value={source.id} />
              <input name="note" required maxLength={600} placeholder="Review note" className="adle-admin-search" />
              <button className="adle-admin-primary" disabled={conflict}>Create hidden mapping</button>
            </form>}
        </section>;
      }) : <p className="adle-admin-empty">No governed source misspellings remain for this word and micro skill.</p>}</div>
    </div>
  </main>;
}
