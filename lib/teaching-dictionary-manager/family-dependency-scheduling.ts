import "server-only";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { recheckWaitingFamilyWords } from "./family-dependencies";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "./evidence-authority";

/** Durable rows are also retried by cron if the response's background work fails. */
export function scheduleFamilyDependencyRecheck(baseWordId?: string) {
  const environment = resolveAdleRouteActivationEnvironment();
  if ((environment !== "staging" && environment !== "production")) return;
  try {
    after(async () => {
      const db = createServiceRoleClient();
      const word = baseWordId ? await db.from("canonical_teaching_dictionary_words").select("normalised_word").eq("id", baseWordId).maybeSingle() : null;
      const result = await recheckWaitingFamilyWords(db, environment, word?.data?.normalised_word, 10);
      if (result.changed || result.ready) revalidateTag(TEACHING_DICTIONARY_EVIDENCE_TAG, { expire: 0 });
    });
  } catch {
    // Offline tools have no request lifetime. The durable cron worker handles these approvals.
  }
}
