import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";
import { SEED_IMPORT_TEMPLATE_HEADER } from "@/lib/writing-engine/seed-import-columns";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminUser();
  return new NextResponse(`${SEED_IMPORT_TEMPLATE_HEADER}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=seed-import-template.csv",
      "Cache-Control": "no-store",
    },
  });
}
