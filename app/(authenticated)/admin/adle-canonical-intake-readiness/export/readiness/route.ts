import { NextResponse, type NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";

import { csv, READINESS_CSV_COLUMNS, readinessCsvRows } from "../../export-data";
import { loadReadinessRows, type ReadinessView } from "../../read-model";
import { parseReadinessControls } from "../../readiness-controls";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdminUser();
  const search = request.nextUrl.searchParams;
  const viewValue = search.get("view") ?? "current";
  const view: ReadinessView = ["current", "other", "resolved", "archived"].includes(viewValue)
    ? viewValue as ReadinessView : "current";
  const controls = parseReadinessControls({ skill: search.get("skill") ?? undefined,
    without: search.get("without") ?? undefined, sort: search.get("sort") ?? undefined,
    direction: search.get("direction") ?? undefined });
  const result = await loadReadinessRows({ view, search: (search.get("q") ?? "").slice(0, 100),
    controls, page: 1, all: true });
  return new NextResponse(csv(readinessCsvRows(result.rows), READINESS_CSV_COLUMNS), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=adle-readiness-filtered.csv",
      "Cache-Control": "no-store" },
  });
}
