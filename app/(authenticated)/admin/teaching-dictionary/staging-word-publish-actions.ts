"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { isStagingIngSkill, loadSingleStagingIngUpdate, publishStagingIngUpdate } from
  "@/lib/teaching-dictionary-manager/ing-staging-release";
import { ingReviewEnvironment } from "@/lib/teaching-dictionary-manager/ing-staging-scope";

type WordPublishResult =
  | { status: "active" } | { status: "unavailable" }
  | { status: "ready"; fingerprint: string; alreadyActive: boolean }
  | { status: "error"; message: string };

export async function stagingWordPublishStatus(
  wordId: string, skill: string, senseId: string, fingerprint?: string,
): Promise<WordPublishResult> {
  const actor = await requireAdminUser();
  if (ingReviewEnvironment() !== "staging" || !isUuid(wordId) || !isStagingIngSkill(skill))
    return { status: "unavailable" } as const;
  const db = createServiceRoleClient();
  try {
    const { update, activeSenseId } = await loadSingleStagingIngUpdate(db, skill, wordId);
    if (update?.changes[0]?.senseId !== senseId)
      return { status: activeSenseId === senseId ? "active" : "unavailable" } as const;
    if (!update) return { status: "unavailable" } as const;
    if (fingerprint === undefined)
      return { status: "ready", fingerprint: update.fingerprint, alreadyActive: activeSenseId === senseId } as const;
    if (fingerprint !== update.fingerprint)
      return { status: "error", message: "The lesson changed. Check the latest word status and try again." } as const;
    await publishStagingIngUpdate(db, actor.id, update, async () =>
      (await loadSingleStagingIngUpdate(db, skill, wordId)).update?.fingerprint);
    revalidatePath("/admin/teaching-dictionary/lesson-updates");
    revalidatePath("/admin/adle-lesson-readiness");
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
    return { status: "active" } as const;
  } catch (error) {
    return { status: "error", message: fingerprint && error instanceof Error
      ? error.message : "Could not check publication status." } as const;
  }
}
