import { readFileSync } from "node:fs";

import { baseWordTransferMissWrites } from "../lib/adle/base-word-transfer-evidence";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const payload = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
const targetIds = new Set(payload.independentSlots.filter((slot) => slot.provenance === "authentic_target").map((slot) => slot.canonicalWordId));
const missedTransfers = baseWordTransferMissWrites({
  payload, childId: "child", lessonSourceRef: "lesson:child:2026-07-18:D4_MOR_BASE_WORDS_PRESERVE_BASE", occurredOn: "2026-07-18",
  finalAttempts: payload.independentWords.map((word) => ({ canonicalWordId: word.canonicalWordId, attemptText: targetIds.has(word.canonicalWordId) ? word.displayWord : "wrong", correct: targetIds.has(word.canonicalWordId) })),
});
assert(missedTransfers.length === 4 && missedTransfers.every((write) => !targetIds.has(write.canonicalWordId)), "only the four missed transfer words produce transfer evidence");
assert(baseWordTransferMissWrites({ payload, childId: "child", lessonSourceRef: "lesson:child:2026-07-18:D4_MOR_BASE_WORDS_PRESERVE_BASE", occurredOn: "2026-07-18", finalAttempts: payload.independentWords.map((word) => ({ canonicalWordId: word.canonicalWordId, attemptText: word.displayWord, correct: true })) }).length === 0, "correct transfer words create neither evidence nor review burden");
assert(baseWordTransferMissWrites({ payload, childId: "child", lessonSourceRef: "lesson:child:2026-07-18:D4_MOR_BASE_WORDS_PRESERVE_BASE", occurredOn: "2026-07-18", finalAttempts: payload.independentWords.map((word) => ({ canonicalWordId: word.canonicalWordId, attemptText: "", correct: false })) }).length === 0, "empty attempts do not create transfer evidence");

const migration = readFileSync("supabase/migrations/20260718100000_add_adle_base_word_transfer_evidence.sql", "utf8");
const loader = readFileSync("lib/adle/loaders/base-word-transfer-evidence-loader.ts", "utf8");
assert(migration.includes("unique (child_id, canonical_word_id, micro_skill_key, lesson_source_ref)"), "one lesson can contribute at most one transfer miss per word");
assert(migration.includes("v_miss_count >= 2") && migration.includes("transfer_confirmation"), "only a later lesson miss can promote a transfer word");
assert(migration.includes("not exists (") && migration.includes("from public.adle_learning_items"), "an existing active learning item prevents duplicate transfer promotion");
assert(!migration.includes("insert into public.adle_review_schedule_words"), "transfer confirmation must not create scheduler rows");
assert(loader.includes("record_adle_base_word_transfer_miss_v1") && !loader.includes("adle_review"), "service persistence is limited to the transfer-evidence RPC");

console.log("adle-base-word-transfer-evidence-regression: ok");
