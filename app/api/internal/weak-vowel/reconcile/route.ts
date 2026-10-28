import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { reconcileWeakVowelPublications } from "@/lib/adle/weak-vowel/reconcile-publications";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
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
    supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return NextResponse.json({ error: "Activation environment unavailable." }, { status: 503 });
  try {
    const result = await reconcileWeakVowelPublications({ client: createServiceRoleClient(), environment });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Schwa reconciliation failed." }, { status: 500 });
  }
}
