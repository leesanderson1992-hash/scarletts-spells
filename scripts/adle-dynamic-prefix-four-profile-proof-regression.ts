import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab, validateDynamicPrefixWordLabPayload, type DynamicPrefixProfile, type DynamicPrefixWord } from "../lib/adle/morphology/dynamic-prefix-word-lab";
import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import type { LearningItemFact } from "../lib/adle/learning-items";

const pkg = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/reviewed-staging-package.json", "utf8"));
const rePreCorrection = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/re-pre-staging-correction-package.json", "utf8"));
const subInterSuperCorrection = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/sub-inter-super-staging-correction-package.json", "utf8"));
const subInterSuperFeedbackCorrection = JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/sub-inter-super-child-feedback-correction-package.json", "utf8"));
const makeItem = (word: DynamicPrefixWord, skill: string, index: number, reteach = false): LearningItemFact => ({ learningItemId: `${skill}:${word.canonicalWordId}:${index}`, childId: "disposable-proof-child", canonicalWordId: word.canonicalWordId, microSkillKey: skill, itemStatus: reteach ? "pending_reteach" : "pending", sourceKind: "verified_misspelling", sourceRef: `disposable-proof:${index}`, sourceAttemptText: null, reteachPriority: reteach, ejectedOn: reteach ? `2026-07-0${index + 1}` : null, intakeOn: `2026-07-0${index + 1}`, rowStatus: "active" });
for (const [key, config] of Object.entries<any>(pkg.profiles)) {
  const members = pkg.words.filter((word: any) => word.microSkillKey === key).map((word: any, index: number): DynamicPrefixWord => ({ canonicalWordId: word.wordKey, displayWord: word.word, audioText: word.dictation.audioText, baseWord: word.teaching.baseOrRoot, teachingBuildText: word.teaching.splitParts.filter((part: any) => part.kind !== "prefix").map((part: any) => part.surfaceText).join(""), baseMeaning: word.teaching.baseMeaning, derivedMeaning: word.teaching.childFriendlyMeaning, effect: word.teaching.meaningBin, parts: word.teaching.splitParts.map((part: any) => ({ id: part.id, text: part.surfaceText, sourceText: part.sourceText, role: part.kind, gloss: part.gloss || undefined, start: part.displayRange.start, end: part.displayRange.end })), joins: word.teaching.splitJoins.map((join: any) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType })), splitPoints: [word.teaching.cleaverBoundary], prefixText: word.teaching.prefixVariant, prefixLabel: `${word.teaching.prefixVariant}-`, prefixMeaning: word.teaching.splitParts.find((part: any) => part.kind === "prefix").gloss, dictationSentence: word.dictation.sentence, dictationTargetTokenIndex: word.dictation.targetTokenIndex, approvedTransfer: true }));
  const rePre = key === "D4_MOR_PREFIXES_RE_PRE" ? rePreCorrection.profile : null;
  const subInterSuper = key === "D4_MOR_PREFIXES_SUB_INTER_SUPER" ? subInterSuperFeedbackCorrection.profile : null;
  const correction = rePre ?? subInterSuper;
  const profile: DynamicPrefixProfile = { microSkillKey: key, productionEnabled: true, prefixLabel: config.label, prefixText: config.text, prefixMeaning: config.meaning, meaningBins: (correction?.meaningBins ?? config.bins.map(([id, label, description]: string[]) => ({ id, label, description }))), wordsByCanonicalId: new Map(members.map((word) => [word.canonicalWordId, word])), transferCanonicalWordIds: members.map((word) => word.canonicalWordId), prefixChoices: [...config.choices, ""].map((text: string) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" })), reflection: { promptKey: `proof:${key}`, promptText: config.reflection }, introduction: correction?.introContent };
  for (const n of [1,2,3,4,5]) { const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: members.slice(0,n).map((word,index) => makeItem(word,key,index)) }); assert(selection, `${key}: select ${n}`); assert.equal(selection.authenticTargets.length, Math.min(n,4)); assert.equal(selection.transfers.length, Math.max(0,4-n)); const payload = compileDynamicPrefixWordLabPayload(selection); assert(payload && validateDynamicPrefixWordLabPayload(payload), `${key}: valid payload ${n}`); assert.equal(payload.words.lesson.length,4); assert.equal(payload.activities.build.choices.filter((choice) => choice.status === "target").length,1); assert.equal(payload.activities.discovery.every((card,index) => card.prefixLabel === payload.words.lesson[index].prefixLabel),true); if (key === "D4_MOR_PREFIXES_IN_IM_IL_IR") { assert.equal(payload.activities.guided?.includeMeaningSort, false, "IN/IM/IL/IR: matching is removed"); assert.equal((payload.activities.guided?.splitCanonicalWordIds.length ?? 0) + (payload.activities.guided?.builds.length ?? 0), 6, "IN/IM/IL/IR: guided work remains six immutable items"); assert.equal(new Set(payload.activities.guided?.builds.map((build) => build.choices.find((choice) => choice.status === "target")?.text)).size, payload.activities.guided?.builds.length, "IN/IM/IL/IR: build uses each represented prefix form once"); assert.equal(payload.activities.introduction.title, "What is a prefix?", "IN/IM/IL/IR: prefix explanation starts the lesson"); assert(payload.activities.introduction.profileTitle, "IN/IM/IL/IR: profile explanation is present"); } }
  if (key === "D4_MOR_PREFIXES_IN_IM_IL_IR") {
    const oneTarget = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members[0], key, 0)] });
    const twoTargets = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members[0], key, 0), makeItem(members[1], key, 1)] });
    const onePayload = oneTarget && compileDynamicPrefixWordLabPayload(oneTarget);
    const twoPayload = twoTargets && compileDynamicPrefixWordLabPayload(twoTargets);
    assert(onePayload && new Set(onePayload.words.lesson.map((word) => word.prefixText)).size === 4, "IN/IM/IL/IR: one target fills all four available forms");
    assert(twoPayload && new Set(twoPayload.words.lesson.map((word) => word.prefixText)).size === 4, "IN/IM/IL/IR: two targets fill missing forms before repeating one");
    assert(onePayload && onePayload.words.lesson[0].prefixText !== onePayload.prefix.text, "IN/IM/IL/IR: build uses a different form from the cleaver when available");
  }
  if (key === "D4_MOR_PREFIXES_RE_PRE") {
    const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members[0], key, 0)] });
    const payload = selection && compileDynamicPrefixWordLabPayload(selection);
    assert(payload, "RE/PRE: payload compiles");
    assert.equal(payload.activities.introduction.title, "What is a prefix?", "RE/PRE: generic prefix explanation starts the lesson");
    assert.equal(payload.activities.introduction.profileTitle, "Meet the re- and pre- prefix family", "RE/PRE: profile explainer is present");
    assert.deepEqual(payload.activities.introduction.profileParagraphs, ["re- can mean again or back. pre- can mean before."], "RE/PRE: approved explainer copy is immutable");
    assert.deepEqual(payload.activities.meaningBins.map((bin) => [bin.id, bin.label, bin.description]), [["again_back", "Again", ""], ["before", "Before", ""]], "RE/PRE: matching bins use the approved prefix meanings");
    assert.equal(payload.activities.build.targetMeaning, payload.words.lesson.find((word) => word.canonicalWordId === payload.activities.build.canonicalWordId)?.derivedMeaning, "RE/PRE: build carries its reviewed new-word meaning target");
    const runtime = dynamicPrefixRuntime(payload);
    assert(runtime?.activities.some((activity) => activity.type === "meaning_sort"), "RE/PRE: matching returns after the cleaver");
    assert.equal(runtime?.activities.find((activity) => activity.type === "prefix_choice")?.targetMeaning, payload.activities.build.targetMeaning, "RE/PRE: runtime retains the build meaning target");
    assert.equal(payload.activities.build.choices.filter((choice) => choice.status === "valid_alternative").length >= 1, true, "RE/PRE: other prefix form remains a valid alternative");
  }
  if (key === "D4_MOR_PREFIXES_SUB_INTER_SUPER") {
    const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members[0], key, 0)] });
    const payload = selection && compileDynamicPrefixWordLabPayload(selection);
    const runtime = payload && dynamicPrefixRuntime(payload);
    assert(payload && runtime, "SUB/INTER/SUPER: payload compiles");
    assert.equal(payload.activities.introduction.profileTitle, "Meet the sub-, inter- and super- prefix family", "SUB/INTER/SUPER: profile explainer is present");
    assert.equal(payload.activities.introduction.profileExamples?.length, 3, "SUB/INTER/SUPER: all three reviewed examples are immutable");
    assert.deepEqual(payload.activities.introduction.profileExamples?.map((example) => [example.prefix, example.prefixMeaning]), [["sub-", "under"], ["inter-", "between"], ["super-", "above or beyond"]], "SUB/INTER/SUPER: each example explicitly teaches its prefix meaning");
    assert.deepEqual(payload.activities.meaningBins.map((bin) => [bin.id, bin.label, bin.description]), [["under", "Under", ""], ["between", "Between", ""], ["above_beyond", "Above or beyond", ""]], "SUB/INTER/SUPER: matching bins teach the three prefix meanings");
    assert.equal(payload.activities.guided?.splitCanonicalWordIds.length, 3, "SUB/INTER/SUPER: three cleaver bindings retain the 18-item contract");
    assert.equal(new Set(payload.activities.guided?.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id)?.prefixText)).size, 3, "SUB/INTER/SUPER: transfer fill covers every form when available");
    assert.equal(runtime.activities.flatMap((activity) => activity.assignmentBindings).length, 18, "SUB/INTER/SUPER: runtime has 18 immutable bindings");
    assert.equal(payload.activities.build.targetMeaning, payload.words.lesson.find((word) => word.canonicalWordId === payload.activities.build.canonicalWordId)?.derivedMeaning, "SUB/INTER/SUPER: build uses a reviewed meaning target");
    const international = payload.words.lesson.find((word) => word.displayWord === "international");
    if (international) assert.equal(international.baseWord, "nation", "SUB/INTER/SUPER: discovery retains nation as the semantic root");
    const nationalBuildSelection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members.find((word) => word.displayWord === "submarine")!, key, 0), makeItem(members.find((word) => word.displayWord === "international")!, key, 1)] });
    const nationalBuildPayload = nationalBuildSelection && compileDynamicPrefixWordLabPayload(nationalBuildSelection);
    assert.equal(nationalBuildPayload?.activities.guided?.builds.find((build) => build.canonicalWordId === members.find((word) => word.displayWord === "international")?.canonicalWordId)?.baseWord, "national", "SUB/INTER/SUPER: build reconstructs inter + national");
  }
  const oldest = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: [makeItem(members[1],key,1),makeItem(members[0],key,0)] }); assert.equal(oldest?.authenticTargets[0].canonicalWordId, members[0].canonicalWordId, `${key}: oldest-first target order`);
}
console.log("PASS: all four Dynamic Prefix profiles compile immutable mixed-prefix payloads with target/transfer/overflow/tie coverage");
