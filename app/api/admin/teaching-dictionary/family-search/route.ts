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
  const lexical = await db.from("canonical_teaching_dictionary_lexical_base_families")
    .select("family_key,revision,base_lemma,base_meaning,base_kind,review_status")
    .ilike("family_key", pattern).order("revision", { ascending: false }).limit(60);
  if (lexical.error) return NextResponse.json({ error: "FAMILY_SEARCH_FAILED" }, { status: 503,
    headers: { "Cache-Control": "private, no-store" } });
  const latest = new Map<string, (typeof lexical.data)[number]>();
  for (const row of lexical.data ?? []) if (!latest.has(row.family_key)) latest.set(row.family_key, row);
  const matches = [
    ...[...latest.values()].filter((row) => row.review_status === "approved").map((row) => ({
      kind: "lexical" as const, id: row.family_key, name: row.family_key,
      meaning: row.base_meaning, baseLemma: row.base_lemma, baseKind: row.base_kind,
    })),
  ].sort((a, b) => Number(!a.name.startsWith(term)) - Number(!b.name.startsWith(term)) ||
    a.name.localeCompare(b.name));
  return NextResponse.json({ results: matches.slice(0, 20),
    limited: matches.length > 20 || (lexical.data?.length ?? 0) === 60 },
    { headers: { "Cache-Control": "private, no-store" } });
}
