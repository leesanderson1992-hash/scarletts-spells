import assert from "node:assert/strict";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "../lib/adle/morphology/base-word-family-preview-fixture";
import { BASE_WORD_TEACHING_PRESENTATION_VERSION, validateBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "../lib/adle/morphology/resolved-base-word-family-lesson-v2";
import { LESSON_ACTIVITY_COPY } from "../lib/adle/lesson-activity-copy";

const current = BASE_WORD_FAMILY_PREVIEW_PAYLOAD;
assert.equal(current.teachingPresentationVersion, BASE_WORD_TEACHING_PRESENTATION_VERSION);
const released = resolveBaseWordFamilyLessonAuthorityV2(current);
assert(released);
assert.equal(released.teaching.pages.length, 3);
assert.equal(released.teaching.pages[1].baseWordFeature?.kind, "maths_table");
assert.equal(released.teaching.pages[2].baseWordFeature?.kind, "long_word_tiles");
assert.equal(released.teaching.meetWords.title, "Meet today’s words");
assert.deepEqual(released.teaching.meetWords.words.map((word) => word.word), current.independentWords.map((word) => word.displayWord));

const pinned = { ...current };
delete pinned.teachingPresentationVersion;
const historical = resolveBaseWordFamilyLessonAuthorityV2(pinned);
assert(historical);
assert.deepEqual(historical.teaching.pages.map((page) => page.id), ["base-word-strategy", "base-word-model"]);
assert.equal(historical.teaching.meetWords.title, undefined);
assert.equal(validateBaseWordFamilyLessonSnapshot({ ...current, teachingPresentationVersion: "unknown" }), null);
assert.equal(LESSON_ACTIVITY_COPY.baseCleaver, "Move the cleaver and cut off the affixes to reveal the base word!");
console.log("adle-base-word-teaching-release-regression: ok");
