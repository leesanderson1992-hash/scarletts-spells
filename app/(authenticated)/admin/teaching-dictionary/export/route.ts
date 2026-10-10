import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { renderTeachingDictionaryCsv, teachingDictionaryExportRows } from "@/lib/teaching-dictionary-manager/bulk-export";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminUser();
  const rows = await teachingDictionaryExportRows();
  return new NextResponse(renderTeachingDictionaryCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=teaching-dictionary-bulk-review.csv",
      "Cache-Control": "no-store",
    },
  });
}
