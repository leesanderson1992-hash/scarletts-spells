import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/** Search names in Postgres; never transfer the family catalog to the editor. */
export async function GET(request: Request) {
  await requireAdminUser();
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const term = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "").slice(0, 60);
  if (term.length < 2) return NextResponse.json({ results: [], limited: false },
    { headers: { "Cache-Control": "private, no-store" } });
  const db = createServiceRoleClient();
  const pattern = `%${term}%`;
  const [lexical, adle] = await Promise.all([
    db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,base_meaning,review_status")
      .eq("base_kind", "free_base").ilike("family_key", pattern)
      .order("revision", { ascending: false }).limit(60),
    db.from("canonical_teaching_dictionary_base_word_families")
      .select("id,base_family_key,base_meaning,micro_skill_key")
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .ilike("base_family_key", pattern).order("base_family_key").limit(21),
  ]);
  if (lexical.error || adle.error) return NextResponse.json({ error: "FAMILY_SEARCH_FAILED" }, { status: 503,
    headers: { "Cache-Control": "private, no-store" } });
  const latest = new Map<string, (typeof lexical.data)[number]>();
  for (const row of lexical.data ?? []) if (!latest.has(row.family_key)) latest.set(row.family_key, row);
  const matches = [
    ...[...latest.values()].filter((row) => row.review_status === "approved").map((row) => ({
      kind: "lexical" as const, id: row.family_key, name: row.family_key,
      meaning: row.base_meaning, baseLemma: row.base_lemma, skillKey: "",
    })),
    ...(adle.data ?? []).map((row) => ({
      kind: "adle" as const, id: row.id, name: row.base_family_key,
      meaning: row.base_meaning, baseLemma: "", skillKey: row.micro_skill_key,
    })),
  ].sort((a, b) => Number(!a.name.startsWith(term)) - Number(!b.name.startsWith(term)) ||
    Number(a.kind !== "lexical") - Number(b.kind !== "lexical") ||
    a.name.localeCompare(b.name) || a.skillKey.localeCompare(b.skillKey));
  return NextResponse.json({ results: matches.slice(0, 20),
    limited: matches.length > 20 || (lexical.data?.length ?? 0) === 60 || (adle.data?.length ?? 0) === 21 },
    { headers: { "Cache-Control": "private, no-store" } });
}
