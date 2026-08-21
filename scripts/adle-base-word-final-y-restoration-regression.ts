import { readFileSync } from "node:fs";

import { finalYRestorationForBasePart, type BaseWordFamilySnapshotTransformation } from "../lib/adle/morphology/base-word-family-payload";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function transformation(sourceText: string, surfaceText: string): BaseWordFamilySnapshotTransformation {
  return {
    transformationKey: "change_final_y_to_i",
    type: "change_final_y_to_i",
    sourcePartId: "base",
    sourceText,
    surfaceText,
    explanation: "Change the final i back to y before you add the ending.",
  };
}

for (const [surfaceText, sourceText] of [["happi", "happy"], ["tri", "try"], ["babi", "baby"]] as const) {
  const restored = finalYRestorationForBasePart({ id: "base", sourceText, surfaceText }, [transformation(sourceText, surfaceText)]);
  assert(restored?.sourceText === sourceText, `${surfaceText} must restore ${sourceText}`);
}

assert(finalYRestorationForBasePart({ id: "base", sourceText: "happy", surfaceText: "happi" }, []) === null, "an unstructured y-to-i mismatch must not enter the restoration task");
assert(finalYRestorationForBasePart({ id: "base", sourceText: "happy", surfaceText: "happi" }, [transformation("carry", "carri")]) === null, "a transformation must match the reviewed base part");

const reveal = readFileSync("components/adle/activities/shared/spelling-transformation-reveal.tsx", "utf8");
const adapter = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const split = readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8");
assert(adapter.includes('actionLabel="Change i to y"'), "Base Word must provide the governed i-to-y action after Split completes");
assert(adapter.includes("splitComplete && transformation") && adapter.includes("<SpellingTransformationReveal"), "final-y restoration must be composed after completed boundary selection");
assert(reveal.includes('data-transformation-kind="surface_to_source"') && reveal.includes("props.sourceText"), "the reveal must deterministically present governed source text");
assert(!split.includes("change_final_y_to_i") && !split.includes("finalY"), "SplitHandle must not infer spelling transformations");

const migration = readFileSync("supabase/migrations/20260721120000_add_base_word_final_y_transformations.sql", "utf8");
assert(migration.includes("morphology_transformations") && migration.includes("updated_count <> 14"), "the migration must seed only the fourteen approved y-to-i members");

console.log("adle-base-word-final-y-restoration-regression: separated post-Split reveal ok");
