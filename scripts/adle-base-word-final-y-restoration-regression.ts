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

const cleaver = readFileSync("components/adle/activities/shared/base-word-cleaver.tsx", "utf8");
assert(cleaver.includes("Change i to y"), "Cleaver must provide an explicit i-to-y action");
assert(cleaver.includes("expectedBaseWord"), "Cleaver must confirm the restored base word, not the visible stem");

const migration = readFileSync("supabase/migrations/20260721120000_add_base_word_final_y_transformations.sql", "utf8");
assert(migration.includes("morphology_transformations") && migration.includes("updated_count <> 14"), "the migration must seed only the fourteen approved y-to-i members");

console.log("adle-base-word-final-y-restoration-regression: ok");
