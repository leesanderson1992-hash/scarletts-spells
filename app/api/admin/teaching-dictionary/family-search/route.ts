import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { familySearchResults, familySearchTerm, type FamilySearchRow } from "@/lib/teaching-dictionary-manager/family-search";

export const dynamic = "force-dynamic";

/** Search names in Postgres; never transfer the family catalog to the editor. */
export async function GET(request: Request) {
  await requireAdminUser();
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const term = familySearchTerm(raw);
  if (term.length < 2) return NextResponse.json({ results: [], limited: false },
    { headers: { "Cache-Control": "private, no-store" } });
  const db = createServiceRoleClient();
  const pattern = `%${term}%`;
  const lexical = await db.from("canonical_teaching_dictionary_lexical_base_families")
    .select("family_key,revision,base_lemma,base_meaning,base_kind")
    .eq("review_status", "approved").ilike("base_lemma", pattern)
    .order("base_lemma").order("revision", { ascending: false }).limit(500);
  if (lexical.error) return NextResponse.json({ error: "FAMILY_SEARCH_FAILED" }, { status: 503,
    headers: { "Cache-Control": "private, no-store" } });
  const matches = familySearchResults((lexical.data ?? []) as FamilySearchRow[], term);
  return NextResponse.json({ results: matches.slice(0, 20),
    limited: matches.length > 20 || (lexical.data?.length ?? 0) === 500 },
    { headers: { "Cache-Control": "private, no-store" } });
}
