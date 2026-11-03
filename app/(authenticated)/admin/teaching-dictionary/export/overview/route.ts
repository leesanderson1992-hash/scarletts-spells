import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { teachingDictionaryOverviewExportRows } from "@/lib/teaching-dictionary-manager/overview-family-export";
import { OVERVIEW_EXPORT_BATCH_SIZE, renderOverviewCsv } from "@/lib/teaching-dictionary-manager/overview-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdminUser();
  const rows = await teachingDictionaryOverviewExportRows();
  const rawBatch = new URL(request.url).searchParams.get("batch");
  const batch = rawBatch == null ? null : Number(rawBatch);
  if (batch !== null && (!Number.isSafeInteger(batch) || batch < 1
    || (batch - 1) * OVERVIEW_EXPORT_BATCH_SIZE >= rows.length))
    return Response.json({ error: "Invalid Overview export batch." }, { status: 400 });
  const selected = batch == null ? rows : rows.slice((batch - 1) * OVERVIEW_EXPORT_BATCH_SIZE,
    batch * OVERVIEW_EXPORT_BATCH_SIZE);
  const filename = batch == null ? "teaching-dictionary-overview-review.csv"
    : `teaching-dictionary-overview-review-batch-${batch}.csv`;
  return new NextResponse(renderOverviewCsv(selected), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
