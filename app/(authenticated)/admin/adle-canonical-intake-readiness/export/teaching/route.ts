import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin/access";

import { buildTeachingTemplate } from "../../teaching-template";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminUser();
  const archive = await buildTeachingTemplate();
  return new NextResponse(Buffer.from(archive), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=adle-teaching-content-template.zip",
      "Cache-Control": "no-store" },
  });
}
