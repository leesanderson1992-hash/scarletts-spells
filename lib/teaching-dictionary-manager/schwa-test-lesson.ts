import "server-only";
import { randomUUID } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { prepareWeakVowelAssignment } from "@/lib/adle/weak-vowel/assignment-writer";
import { persistSpecialistSnapshotV3, supabaseSpecialistSnapshotV3PersistencePort } from "@/lib/adle/composable-lesson/specialist-snapshot-v3-persistence";
import { isSchwaWorkbookSkill } from "./weak-vowel-workbook";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadWeakVowelSelectionPool } from "@/lib/adle/weak-vowel/readiness-loader";
export async function generateSchwaTestLesson(db: ReturnType<typeof createServiceRoleClient>, actor: string, childId: string, skill: string, targetId: string) {
  if (ingReviewEnvironment() !== "staging" || !isSchwaWorkbookSkill(skill)) throw new Error("Test generation is available in staging only.");
  const date = getLondonPracticeDate();
  const child = await db.from("children").select("id").eq("id", childId).eq("parent_user_id", actor).eq("is_archived", false).single();
  if (child.error) throw new Error("Choose a staging learner on your account.");
  const pool = await loadWeakVowelSelectionPool({ client: db, environmentKey: "staging" }, skill);
  if (!pool.words.some(word => word.canonicalWordId === targetId)) throw new Error("Choose an Active target word.");
  const existing = await db.from("daily_assignments").select("id").eq("child_id", childId).eq("assignment_date", date).eq("title", "ADLE Daily Plan").limit(1);
  if (existing.error) throw new Error("Could not check existing lessons.");
  if (existing.data.length) throw new Error("This learner already has a lesson today. Open it or choose a fresh learner.");
  // A fresh test learner has no diagnostic history. Seed a clearly labelled,
  // disposable four-word test queue rather than bypassing the learner's probe policy.
  const targets = [targetId, ...pool.words.filter(word => word.canonicalWordId !== targetId)
    .sort((a, b) => Number(Boolean(b.routeContent.content.weakVowel.canonicalSenseId)) - Number(Boolean(a.routeContent.content.weakVowel.canonicalSenseId)))
    .map(word => word.canonicalWordId)].slice(0, 4);
  if (targets.length < 4) throw new Error("Publish at least four words before generating a test lesson.");
  for (const id of targets) {
    const prior = await db.from("adle_learning_items").select("id,item_status").eq("child_id", childId).eq("canonical_word_id", id).eq("micro_skill_key", skill).eq("row_status", "active").maybeSingle();
    if (prior.error || prior.data && !["pending", "pending_reteach"].includes(prior.data.item_status)) throw new Error("Choose a fresh test learner without completed progress for these words.");
    if (!prior.data) {
      const saved = await db.from("adle_learning_items").insert({ id: randomUUID(), child_id: childId, canonical_word_id: id, micro_skill_key: skill,
        source_kind: "verified_misspelling", source_ref: `schwa-workbook-staging:${skill}:${childId}:${id}`, intake_on: date, item_status: "pending", row_status: "active" });
      if (saved.error) throw new Error("Could not save the staging test queue.");
    }
  }
  const { facts } = await loadDailyPlanFacts(db, { childId, today: date, wordReadMode: "scoped", relationshipEnvironment: "staging" });
  const prepared = await prepareWeakVowelAssignment({ client: db, childId, parentUserId: actor, date, microSkillKey: skill, facts, environmentKey: "staging" });
  if (prepared.status !== "ready") throw new Error(`Lesson generation is blocked: ${prepared.reason}`);
  const assignmentId = await persistSpecialistSnapshotV3(supabaseSpecialistSnapshotV3PersistencePort(db), { parentUserId: actor, childId, planDate: date, header: prepared.header, items: prepared.items, intakes: [], snapshot: prepared.snapshot });
  const session = await db.from("adle_today_session_orchestrations").upsert({ daily_assignment_id: assignmentId, child_id: childId, parent_user_id: actor, assignment_date: date,
    major_stage: "specialist_lesson", review_generation_status: "not_required", specialist_generation_status: "ready", specialist_started_at: new Date().toISOString() }, { onConflict: "daily_assignment_id", ignoreDuplicates: true });
  if (session.error) throw new Error("Could not prepare lesson progress saving.");
  return { assignmentId, snapshot: prepared.snapshot };
}
