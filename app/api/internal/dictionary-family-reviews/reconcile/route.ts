import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { recheckWaitingFamilyWords } from "@/lib/teaching-dictionary-manager/family-dependencies";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(request: Request) {
  const expected = Buffer.from(process.env.CRON_SECRET ?? "");
  const supplied = Buffer.from((request.headers.get("authorization") ?? "").match(/^Bearer (.+)$/iu)?.[1] ?? "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const environment = resolveAdleRouteActivationEnvironment();
  if ((environment !== "staging" && environment !== "production")) return Response.json({ error: "Environment unavailable." }, { status: 503 });
  try {
    const result = await recheckWaitingFamilyWords(createServiceRoleClient(), environment);
    if (result.changed || result.ready) revalidateTag(TEACHING_DICTIONARY_EVIDENCE_TAG, { expire: 0 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Saved family reviews will be retried." }, { status: 500 }); }
}
