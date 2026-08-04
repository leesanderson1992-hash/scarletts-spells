import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runCanonicalIntakeReconciliationSweep } from "@/lib/adle/loaders/canonical-intake-live";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function bearerToken(request: NextRequest): string | null {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    " ",
  );
  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const suppliedToken = bearerToken(request);
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Canonical intake cron secret is not configured." },
      { status: 500 },
    );
  }
  if (!suppliedToken || !safeEquals(suppliedToken, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await runCanonicalIntakeReconciliationSweep({
    serviceClient: createServiceRoleClient(),
    leaseOwner: `vercel-cron:${randomUUID()}`,
    limit: 25,
  });
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
