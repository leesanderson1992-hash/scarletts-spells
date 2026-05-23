import "server-only";

import type { StructuredLessonResponse } from "@/lib/lessons/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type StructuredSubmissionPayloadType =
  | "structured_lesson_response"
  | "structured_test_response";

type PersistStructuredSubmissionPayloadInput = {
  submissionId: string;
  parentUserId: string;
  courseId: string;
  taskId: string;
  childId: string;
  taskType: string;
  structuredResponse: StructuredLessonResponse;
};

type PersistStructuredSubmissionPayloadResult =
  | { ok: true }
  | { ok: false; error: string };

function getStructuredSubmissionPayloadType(
  taskType: string,
): StructuredSubmissionPayloadType | null {
  if (taskType === "lesson") {
    return "structured_lesson_response";
  }

  if (taskType === "test") {
    return "structured_test_response";
  }

  return null;
}

export async function persistStructuredSubmissionPayload({
  submissionId,
  parentUserId,
  courseId,
  taskId,
  childId,
  taskType,
  structuredResponse,
}: PersistStructuredSubmissionPayloadInput): Promise<PersistStructuredSubmissionPayloadResult> {
  const payloadType = getStructuredSubmissionPayloadType(taskType);

  if (!payloadType) {
    return { ok: false, error: "unsupported_structured_submission_task_type" };
  }

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("task_submission_payloads").insert({
      submission_id: submissionId,
      parent_user_id: parentUserId,
      course_id: courseId,
      task_id: taskId,
      child_id: childId,
      payload_type: payloadType,
      payload_version: 1,
      payload_json: structuredResponse,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_payload_insert_error",
    };
  }
}
