import { NextResponse, type NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdminUser();
  const word = request.nextUrl.searchParams.get("word")?.trim() ?? "";
  const skill = request.nextUrl.searchParams.get("skill")?.trim() ?? "";
  if (!word || !skill || word.length > 200 || skill.length > 200) {
    return NextResponse.json({ error: "Choose a valid word and micro skill." }, { status: 400 });
  }

  const db = createServiceRoleClient();
  const { data: demands, error: demandError } = await db.from("adle_canonical_intake_demands")
    .select("id")
    .eq("normalized_target_token", word)
    .eq("micro_skill_key", skill);
  if (demandError) {
    console.error("[adle-readiness-history] demand lookup failed", demandError);
    return NextResponse.json({ error: "The audit history could not be loaded." }, { status: 500 });
  }

  const results = await Promise.all((demands ?? []).map((demand) => db.from("adle_canonical_intake_events")
    .select("id,event_type,created_at")
    .eq("demand_id", demand.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(12)));
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[adle-readiness-history] event lookup failed", failed.error);
    return NextResponse.json({ error: "The audit history could not be loaded." }, { status: 500 });
  }
  const history = results.flatMap((result) => result.data ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, 12)
    .map((event) => ({ id: event.id, type: event.event_type, at: event.created_at }));
  return NextResponse.json({ history }, { headers: { "Cache-Control": "no-store" } });
}
