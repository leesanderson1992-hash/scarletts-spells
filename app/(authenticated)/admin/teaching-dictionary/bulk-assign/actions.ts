"use server";
import { requireAdminUser } from "@/lib/admin/access";
import { saveBulkSkillApprovalsAsActor } from "@/lib/teaching-dictionary-manager/bulk-approval-service";
import { updateTag, revalidatePath } from "next/cache";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
export type { BulkApprovalResult } from "@/lib/teaching-dictionary-manager/bulk-approval-service";
export async function saveBulkSkillApprovals(input: Parameters<typeof saveBulkSkillApprovalsAsActor>[0]) {
  const actor = await requireAdminUser();
  const result = await saveBulkSkillApprovalsAsActor(input, actor.id);
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  return result;
}
