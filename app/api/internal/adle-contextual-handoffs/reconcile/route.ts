import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { reconcilePendingContextualHandoffs } from "@/lib/adle/contextual-handoff-reconciliation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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
    const summary = await reconcilePendingContextualHandoffs({
      serviceClient: createServiceRoleClient(),
      limit: 100,
    });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[adle-contextual-handoffs] reconciliation unavailable", {
      code: "CONTEXTUAL_HANDOFF_RECONCILIATION_FAILED",
    });
    return NextResponse.json({ error: "Contextual handoff reconciliation failed." }, { status: 500 });
  }
}
