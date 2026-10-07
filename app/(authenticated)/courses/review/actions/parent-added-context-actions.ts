import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { reconstructOccurrenceContext } from "@/lib/writing-engine/whole-writing/context-source";
import { normaliseParentIdentifiedOccurrenceWord } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";
import type { SourceSnapshot } from "@/lib/writing-engine/whole-writing/source";

export async function addParentContextualMissImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const occurrenceId = formData.get("source_writing_occurrence_id");
  const observed = formData.get("observed_word");
  const intended = formData.get("intended_word");
  if (typeof submissionId !== "string" || typeof occurrenceId !== "string" ||
      typeof observed !== "string" || typeof intended !== "string" ||
      !observed.trim() || !intended.trim()) {
    throw new Error("Choose the exact word and the parent's correction.");
  }
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const submission = await service.from("task_submissions")
    .select("id,child_id,parent_review_status")
    .eq("id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (submission.error || !submission.data || submission.data.parent_review_status === "approved") {
    throw new Error("This writing review is not editable.");
  }
  const [snapshotResult, occurrenceResult] = await Promise.all([
    service.from("writing_source_snapshots").select("*")
      .eq("submission_id", submissionId).eq("parent_user_id", user.id)
      .eq("child_id", submission.data.child_id).maybeSingle(),
    service.from("writing_occurrences")
      .select("id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance")
      .eq("id", occurrenceId).maybeSingle(),
  ]);
  const snapshot = snapshotResult.data as SourceSnapshot | null;
  const occurrence = occurrenceResult.data;
  if (snapshotResult.error || occurrenceResult.error || !snapshot || !occurrence ||
      occurrence.snapshot_id !== snapshot.id || occurrence.provenance !== "learner_response" ||
      normaliseParentIdentifiedOccurrenceWord(occurrence.observed_text) !==
        normaliseParentIdentifiedOccurrenceWord(observed)) {
    throw new Error("The selected word is not an exact learner-authored occurrence.");
  }
  const source = reconstructOccurrenceContext({
    snapshot, fieldPath: occurrence.field_path, fieldHash: occurrence.field_hash,
    startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16,
    observedText: occurrence.observed_text,
  });
  if (source.status !== "ready") {
    throw new Error("The immutable writing span no longer verifies.");
  }
  const sentence = sentenceContext(source.fieldText, occurrence.start_utf16, occurrence.end_utf16);
  if (!sentence) throw new Error("The sentence around this word could not be verified.");
  const saved = await service.rpc("record_parent_added_contextual_occurrence", {
    p_occurrence_id: occurrence.id,
    p_parent_user_id: user.id,
    p_field_hash: occurrence.field_hash,
    p_observed_text: occurrence.observed_text,
    p_intended_member: intended.trim(),
  });
  if (saved.error) throw new Error("Could not save parent contextual feedback.");
  revalidatePath(`/courses/review/${submissionId}`);
  revalidatePath("/courses/review");
  if (formData.get("__inline_add") === "true") {
    return { ok: true, message: "Context choice added to the context review.", section: "context" as const, added: true,
      savedItem: { id: String(saved.data), observed: occurrence.observed_text,
        intended: intended.trim(), occurrenceId: occurrence.id, sentence: sentence.text } };
  }
  const redirectPath = formData.get("redirect_path");
  const path = typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
    ? redirectPath : `/courses/review/${submissionId}`;
  const url = new URL(path, "https://review.local");
  url.searchParams.set("section", "context");
  url.searchParams.set("saved", "Context choice added to the context review.");
  redirect(`${url.pathname}${url.search}`);
}
