import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ingReviewEnvironment } from "./ing-staging-scope";

export type LessonReviewRequest = { word_id: string; word: string; sense_id: string | null };

export async function loadLessonReviewRequests(db: SupabaseClient, skill: string) {
  const environment = ingReviewEnvironment();
  const requests = new Map<string, LessonReviewRequest>();
  if (!environment) return requests;
  for (let offset = 0; ; offset += 500) {
    const result = await db.rpc("teaching_dictionary_lesson_review_queue", {
      p_environment: environment, p_skill: skill,
    }).order("word_id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not load saved lesson requests.");
    const rows = (result.data ?? []) as LessonReviewRequest[];
    for (const row of rows) requests.set(row.word_id, row);
    if (rows.length < 500) return requests;
  }
}
