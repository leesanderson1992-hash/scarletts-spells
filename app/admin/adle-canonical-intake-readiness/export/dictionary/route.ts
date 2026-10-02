import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";

import { csv, DICTIONARY_CSV_COLUMNS, missingDictionaryCsvRows } from "../../export-data";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminUser();
  return new NextResponse(csv(await missingDictionaryCsvRows(), DICTIONARY_CSV_COLUMNS), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=adle-missing-dictionary-metadata.csv",
      "Cache-Control": "no-store" },
  });
}
