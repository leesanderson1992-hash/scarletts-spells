import { NextResponse, type NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";

import {
  loadCanonicalMappingOperationsExportRows,
  parseCanonicalMappingOperationsFilters,
  renderCanonicalMappingOperationsCsv,
} from "../read-model";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdminUser();

  const filters = parseCanonicalMappingOperationsFilters({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    visibility: request.nextUrl.searchParams.get("visibility") ?? undefined,
    source: request.nextUrl.searchParams.get("source") ?? undefined,
  });
  const rows = await loadCanonicalMappingOperationsExportRows(filters);
  const csv = renderCanonicalMappingOperationsCsv({ filters, rows });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="canonical-mapping-audit-${timestamp}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
