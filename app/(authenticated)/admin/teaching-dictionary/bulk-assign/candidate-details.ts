"use server";

import { requireAdminUser } from "@/lib/admin/access";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { readBulkCandidateDetails } from "./candidate-details-read";

export async function loadBulkCandidateDetails(wordIds: string[]) {
  await requireAdminUser();
  if (!Array.isArray(wordIds) || wordIds.length < 1 || wordIds.length > 50 || wordIds.some(id => !isUuid(id))) {
    throw new Error("Choose a page of dictionary words.");
  }
  return readBulkCandidateDetails(wordIds);
}
