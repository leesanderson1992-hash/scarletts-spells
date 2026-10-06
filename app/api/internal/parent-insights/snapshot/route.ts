import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { familyAverages } from "@/lib/parent-insights/family-average";
import { loadParentInsightSkills } from "@/lib/parent-insights/proficiency";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function londonDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  const supplied = Buffer.from(token ?? "");
  const expected = Buffer.from(secret ?? "");
  if (!secret || scheme.toLowerCase() !== "bearer" || !token ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const service = createServiceRoleClient();
    const today = londonDate();
    const pending: { id: string; parent_user_id: string }[] = [];
    let afterId: string | null = null;
    while (true) {
      let query = service.from("children").select("id,parent_user_id")
        .eq("is_archived", false).order("id", { ascending: true }).limit(100);
      if (afterId) query = query.gt("id", afterId);
      const page = await query;
      if (page.error) throw page.error;
      const children = page.data ?? [];
      if (!children.length) break;
      afterId = children[children.length - 1].id;
      const runs = await service.from("parent_insight_snapshot_runs")
        .select("child_id").eq("snapshot_on", today)
        .in("child_id", children.map((child) => child.id));
      if (runs.error) throw runs.error;
      const captured = new Set((runs.data ?? []).map((row) => row.child_id));
      pending.push(...children.filter((child) => !captured.has(child.id)));
      if (children.length < 100) break;
    }

    const results: PromiseSettledResult<string>[] = [];
    for (let offset = 0; offset < pending.length; offset += 6) {
      const batch = await Promise.allSettled(pending.slice(offset, offset + 6).map(async (child) => {
        const averages = familyAverages(await loadParentInsightSkills(child.id));
        if (averages.length) {
          const saved = await service.from("parent_insight_family_snapshots").upsert(averages.map((average) => ({
            child_id: child.id, parent_user_id: child.parent_user_id, snapshot_on: today,
            family_key: average.familyKey, family_label: average.familyLabel,
            average_level: Number(average.average.toFixed(2)), microskill_count: average.count,
            policy_version: average.policyVersion, banding_version: average.bandingVersion,
          })), { onConflict: "child_id,snapshot_on,family_key" });
          if (saved.error) throw saved.error;
        }
        const run = await service.from("parent_insight_snapshot_runs")
          .upsert({ child_id: child.id, snapshot_on: today }, { onConflict: "child_id,snapshot_on" });
        if (run.error) throw run.error;
        return child.id;
      }));
      results.push(...batch);
    }
    const failures = results.filter((result) => result.status === "rejected").length;
    if (failures) console.error("[parent-insights-snapshot] child captures failed", { failures });
    return NextResponse.json({ snapshotOn: today, captured: results.length - failures, failures },
      { status: failures ? 500 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[parent-insights-snapshot] capture unavailable");
    return NextResponse.json({ error: "Snapshot capture failed." }, { status: 500 });
  }
}
