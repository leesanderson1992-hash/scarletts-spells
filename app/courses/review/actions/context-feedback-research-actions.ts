import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function promoteParentContextualCaseImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const caseId = formData.get("case_id");
  if (typeof submissionId !== "string" || typeof caseId !== "string") {
    throw new Error("Invalid research candidate.");
  }
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const owned = await service.from("task_submissions")
    .select("id,child_id").eq("id", submissionId)
    .eq("parent_user_id", user.id).maybeSingle();
  if (owned.error || !owned.data) throw new Error("Submission not owned.");
  const source = await service.from("writing_context_parent_added_cases")
    .select("id,snapshot_id,child_id")
    .eq("id", caseId).eq("parent_user_id", user.id)
    .eq("child_id", owned.data.child_id).maybeSingle();
  if (source.error || !source.data) throw new Error("Parent case not found.");
  const snapshot = await service.from("writing_source_snapshots")
    .select("id").eq("id", source.data.snapshot_id)
    .eq("submission_id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (snapshot.error || !snapshot.data) throw new Error("Case is not in this writing submission.");
  const saved = await service.from("writing_context_research_candidates").upsert({
    parent_added_case_id: caseId, category: "DETECTION_MISS", status: "candidate",
  }, { onConflict: "parent_added_case_id", ignoreDuplicates: true });
  if (saved.error) throw new Error("Could not save research candidate.");
  revalidatePath(`/courses/review/${submissionId}`);
}
