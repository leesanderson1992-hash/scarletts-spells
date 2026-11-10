import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { teachingDictionaryOverviewExportRows } from "@/lib/teaching-dictionary-manager/overview-family-export";
import { OVERVIEW_EXPORT_BATCH_SIZE, renderOverviewCsv,
  selectOverviewCsvRowsForSkill } from "@/lib/teaching-dictionary-manager/overview-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  const skill = params.get("skill");
  if (skill !== null) {
    if (params.has("batch") || !/^D[0-9]_[A-Z0-9_]+$/u.test(skill))
      return Response.json({ error: "Choose one valid micro-skill." }, { status: 400 });
    const catalog = await createServiceRoleClient().from("micro_skill_catalog")
      .select("micro_skill_key").eq("micro_skill_key", skill)
      .eq("is_active", true).eq("is_assignable", true).maybeSingle();
    if (catalog.error) throw new Error("TEACHING_OVERVIEW_SKILL_EXPORT_CATALOG_READ_FAILED");
    if (!catalog.data)
      return Response.json({ error: "Micro-skill is not available for review." }, { status: 404 });
  }
  const rows = await teachingDictionaryOverviewExportRows();
  const rawBatch = params.get("batch");
  const batch = rawBatch == null ? null : Number(rawBatch);
  if (batch !== null && (!Number.isSafeInteger(batch) || batch < 1
    || (batch - 1) * OVERVIEW_EXPORT_BATCH_SIZE >= rows.length))
    return Response.json({ error: "Invalid Overview export batch." }, { status: 400 });
  const selected = skill ? selectOverviewCsvRowsForSkill(rows, skill)
    : batch == null ? rows : rows.slice((batch - 1) * OVERVIEW_EXPORT_BATCH_SIZE,
      batch * OVERVIEW_EXPORT_BATCH_SIZE);
  if (skill && !selected.length)
    return Response.json({ error: "No Overview words are currently associated with this micro-skill." }, { status: 404 });
  const filename = skill ? `teaching-dictionary-overview-review-${skill}.csv`
    : batch == null ? "teaching-dictionary-overview-review.csv"
      : `teaching-dictionary-overview-review-batch-${batch}.csv`;
  return new NextResponse(renderOverviewCsv(selected), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
