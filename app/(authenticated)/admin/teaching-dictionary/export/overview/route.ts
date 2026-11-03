import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { teachingDictionaryOverviewExportRows } from "@/lib/teaching-dictionary-manager/overview-family-export";
import { renderOverviewCsv } from "@/lib/teaching-dictionary-manager/overview-csv";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminUser();
  const rows = await teachingDictionaryOverviewExportRows();
  return new NextResponse(renderOverviewCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=teaching-dictionary-overview-review.csv",
      "Cache-Control": "no-store",
    },
  });
}
