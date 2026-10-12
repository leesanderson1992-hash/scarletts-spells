import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import previous from "../data/adle/candidates/d4-hom/v2/lessons.json";
import approved from "../data/adle/candidates/d4-hom/v3/lessons.json";
import current from "../data/adle/candidates/d4-hom/v4/lessons.json";
import approval from "../data/adle/candidates/d4-hom/v4/content-approval.json";
import { shuffledIndices } from "../lib/adle/homophone/random-order";
import { buildHomophoneReleasePackage } from "../lib/adle/homophone/release";
import { compileHomophoneSnapshotV3, validateHomophoneSnapshotV3 } from "../lib/adle/homophone/snapshot";
import {
  HOMOPHONE_LESSONS,
  HOMOPHONE_RUNTIME_ENABLED,
  compileHomophoneLessonSnapshot,
  fullHomophonePassage,
  validateHomophoneLesson,
  validateHomophoneLessonSnapshot,
} from "../lib/adle/homophone/lesson";

assert.equal(HOMOPHONE_LESSONS.length, 14);
assert.equal(HOMOPHONE_RUNTIME_ENABLED, false);
assert.equal(approved.contentVersion, "d4-hom-v3");
assert.equal(current.contentVersion, "d4-hom-v4");
assert.equal(current.previousContentSha256, approved.contentSha256);
assert.equal(current.balloonSourceSha256, approved.balloonSourceSha256);
assert.equal(approval.approvalStatus, "approved");
assert.equal(approval.contentVersion, current.contentVersion);
assert.equal(approval.contentSha256, current.contentSha256);
assert.equal(approval.runtimeEnabled, false);
const imageManifest = [...new Set(current.lessons.flatMap(lesson => lesson.words.filter(word => word.imageRequired).map(word => word.imageSrc)))].sort().map(path => ({
  path,
  sha256: createHash("sha256").update(readFileSync(join(process.cwd(), "public", path!))).digest("hex"),
}));
assert.equal(createHash("sha256").update(JSON.stringify(imageManifest)).digest("hex"), approval.imageAssetManifestSha256);
assert.equal(approved.balloonSourceSha256.length, 64);
assert.deepEqual(shuffledIndices(4, () => 0), [1, 2, 3, 0]);
assert.deepEqual(new Set(shuffledIndices(20, () => 0.5)), new Set(Array.from({ length: 20 }, (_, index) => index)));
let imageCount = 0;
for (const lesson of HOMOPHONE_LESSONS) {
  assert.deepEqual(validateHomophoneLesson(lesson), [], lesson.microSkillKey);
  assert.equal(lesson.binSort.length, 4);
  assert.deepEqual(new Set(lesson.coverCheck), new Set(lesson.words.map(word => word.word)));
  assert.equal(lesson.coverCheck.length, lesson.words.length);
  assert.equal(lesson.dictationPassages.length, 3);
  assert.deepEqual(new Set(lesson.dictationPassages.flatMap(passage => passage.targets)), new Set(lesson.words.map(word => word.word)));
  for (const passage of lesson.dictationPassages) {
    assert.equal(passage.segments.length, 3);
    assert.equal(passage.targets.length, 2);
    assert.equal(fullHomophonePassage(passage).split(/[.!?]+(?:\s|$)/).filter(Boolean).length, 2);
  }
  assert.deepEqual(new Set(lesson.balloonPrompts.map(prompt => prompt.answer)), new Set(lesson.words.map(word => word.word)));
  assert.equal(lesson.balloonPrompts.length, 20);
  assert.equal(new Set(lesson.balloonPrompts.map(prompt => prompt.sentence)).size, 20);
  const oldLesson = previous.lessons.find(candidate => candidate.microSkillKey === lesson.microSkillKey);
  assert.ok(oldLesson);
  const { balloonPrompts: oldPrompts, ...oldContent } = oldLesson;
  const approvedLesson = approved.lessons.find(candidate => candidate.microSkillKey === lesson.microSkillKey);
  assert.ok(approvedLesson);
  const { balloonPrompts: approvedPrompts, ...approvedContent } = approvedLesson;
  assert.deepEqual(approvedContent, oldContent, `V3 should only change Balloon Pop prompts: ${lesson.microSkillKey}`);
  assert.notDeepEqual(approvedPrompts, oldPrompts);
  assert.deepEqual({ ...lesson, coverCheck: approvedLesson.coverCheck }, approvedLesson, `V4 should only expand Cover Check: ${lesson.microSkillKey}`);
  for (const word of lesson.words) {
    assert.ok(word.highlightStart !== null && word.highlightLength !== null);
    assert.ok(word.highlightStart >= 0 && word.highlightLength > 0);
    assert.ok(word.highlightStart + word.highlightLength <= word.word.length);
    if (!word.imageRequired) {
      assert.equal(word.imageSrc, null);
      continue;
    }
    imageCount += 1;
    assert.ok(word.imageSrc && existsSync(join(process.cwd(), "public", word.imageSrc)), word.word);
  }
  const snapshot = compileHomophoneLessonSnapshot(lesson.microSkillKey);
  assert.deepEqual(validateHomophoneLessonSnapshot(snapshot), []);
  assert.equal(snapshot.activities.length, 7 + lesson.words.length);
  assert.deepEqual(snapshot.activities.map(activity => activity.concept), ["INTRODUCTION", "MEANING_SORT", "BALLOON_POP", ...lesson.words.map(() => "COVER_CHECK"), "DICTATION", "DICTATION", "DICTATION", "LESSON_REFLECTION"]);
  const changed = structuredClone(snapshot);
  changed.lesson.words[0].memoryCue = "Changed after compilation";
  assert.ok(validateHomophoneLessonSnapshot(changed).includes("lesson_content_mismatch"));
  assert.notEqual(lesson.words[0].memoryCue, changed.lesson.words[0].memoryCue);
  const broken = structuredClone(lesson);
  broken.words[0].feedbackReason = "";
  assert.ok(validateHomophoneLesson(broken).some(issue => issue.startsWith("missing_teaching")));
  broken.words[0].feedbackReason = lesson.words[0].feedbackReason;
  broken.coverCheck = [lesson.words[0].word, lesson.words[0].word];
  assert.ok(validateHomophoneLesson(broken).includes("cover_check_invalid"));
  broken.coverCheck = [...lesson.coverCheck];
  broken.dictationPassages[0].segments = ["No target words here.", "____", ""];
  assert.ok(validateHomophoneLesson(broken).includes("dictation_gap_invalid"));
}
assert.equal(imageCount, 27);
const four = HOMOPHONE_LESSONS.find(lesson => lesson.words.length === 4);
assert.ok(four);
assert.deepEqual(new Set(four.binSort.map(prompt => prompt.answer)), new Set(four.words.map(word => word.word)));
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
let nextId = 1;
const canonicalWords = Object.fromEntries(HOMOPHONE_LESSONS.map(lesson => [lesson.microSkillKey,
  Object.fromEntries(lesson.words.map(word => [word.word, id(nextId++)]))]));
const releasePackage = buildHomophoneReleasePackage({ releaseKey: "homophone-v4-regression", approvalRefs: ["owner-approved-v4"], canonicalWords });
assert.equal(releasePackage.authorities.length, 14);
for (const lesson of HOMOPHONE_LESSONS) {
  const compiled = compileHomophoneSnapshotV3({ lesson: compileHomophoneLessonSnapshot(lesson.microSkillKey),
    bindings: lesson.words.map((entry, index) => ({ word: entry.word, canonicalWordId: canonicalWords[lesson.microSkillKey][entry.word],
      learningItemId: index === 0 ? id(999) : null })),
    release: { activationRevisionId: id(991), releaseManifestId: id(992), releaseKey: "homophone-v4-regression",
      releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64) },
    contentAuthorities: [
      { authorityType: "release_manifest", authorityId: id(992), version: "2", sourceHash: "a".repeat(64) },
      { authorityType: "activation_revision", authorityId: id(991), version: "2", sourceHash: "c".repeat(64) },
      { authorityType: "dependency_set", authorityId: id(992), version: "2", sourceHash: "b".repeat(64) },
      { authorityType: "teaching_content", authorityId: id(993), version: "1", sourceHash: "d".repeat(64) },
    ], childId: id(994), parentUserId: id(995), date: "2026-10-12" });
  assert.equal(compiled.items.length, 12 + lesson.words.length);
  assert.equal(compiled.items.filter(item => item.metadata.sectionKey === "lesson_dictation").length, 6);
  assert.ok(validateHomophoneSnapshotV3(compiled.snapshot, { lessonRouteMetadata: compiled.header.lessonRouteMetadata,
    assignmentGenerationSource: compiled.header.assignmentGenerationSource,
    items: compiled.items.map(item => ({ ...item, sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId })) }).ok);
  const edited = structuredClone(compiled.snapshot);
  edited.payload.resolvedLesson.lesson.words[0].memoryCue = "changed";
  assert.equal(validateHomophoneSnapshotV3(edited).ok, false);
}
console.log("Homophone content regression passed: 14 sets, 280 approved balloon prompts, 27 images, random order, full Cover Check and stage counts.");
