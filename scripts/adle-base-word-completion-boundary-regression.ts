import { readFileSync } from "node:fs";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const action = readFileSync("app/(authenticated)/learn/week/adle/actions.ts", "utf8");
const runner = readFileSync("components/adle-session-runner.tsx", "utf8");
const loader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260720090000_make_base_word_reflection_atomic.sql", "utf8");
const v2RefMigration = readFileSync("supabase/migrations/20261026081500_accept_base_word_learning_item_ref_at_completion.sql", "utf8");
assert(runner.includes("Saving your Word Lab") && runner.includes("requestAnimationFrame"), "Finish has one visible submission state before native submit");
assert(loader.includes("reflection: params.reflection") && loader.includes("p_lesson: { ...params.lesson, reflection: params.reflection }"), "completion envelopes reflection inside the existing RPC payload");
assert(!action.includes("await upsertChildLearningReflection(context.serviceClient, {\n    childId: context.childId"), "base-word reflection is not written after completion");
assert(migration.includes("p_lesson->'reflection'") && migration.includes("adle_child_learning_reflections") && migration.includes("on conflict (daily_assignment_id,prompt_key)"), "RPC validates and atomically upserts the reflection");
assert(loader.includes("adleLearningItemRef: typeof item.metadata.learningItemId === \"string\" ? item.metadata.learningItemId : null"), "Base Word V2 persists the learner item reference in the assignment snapshot");
assert(v2RefMigration.includes("metadata->>'sectionKey'='lesson_production'")
  && v2RefMigration.includes("nullif(metadata->>'learningItemId','')")
  && v2RefMigration.includes("nullif(metadata->>'adleLearningItemRef','')")
  && v2RefMigration.includes("metadata->>'canonicalWordId'=v_row->>'canonicalWordId'"),
"completion schedules only an exact learner-backed production word, accepting legacy and V2 metadata");
console.log("adle-base-word-completion-boundary-regression: ok");
