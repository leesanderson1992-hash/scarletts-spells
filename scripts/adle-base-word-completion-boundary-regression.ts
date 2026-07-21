import { readFileSync } from "node:fs";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const action = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const runner = readFileSync("components/adle-session-runner.tsx", "utf8");
const loader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260720090000_make_base_word_reflection_atomic.sql", "utf8");
assert(runner.includes("Saving your Word Lab") && runner.includes("requestAnimationFrame"), "Finish has one visible submission state before native submit");
assert(loader.includes("reflection: params.reflection") && loader.includes("p_lesson: { ...params.lesson, reflection: params.reflection }"), "completion envelopes reflection inside the existing RPC payload");
assert(!action.includes("await upsertChildLearningReflection(context.serviceClient, {\n    childId: context.childId"), "base-word reflection is not written after completion");
assert(migration.includes("p_lesson->'reflection'") && migration.includes("adle_child_learning_reflections") && migration.includes("on conflict (daily_assignment_id,prompt_key)"), "RPC validates and atomically upserts the reflection");
console.log("adle-base-word-completion-boundary-regression: ok");
