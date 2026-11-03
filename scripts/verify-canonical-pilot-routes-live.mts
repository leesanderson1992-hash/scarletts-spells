/** Read-only, native ADLE readiness check for every reviewed pilot route. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { routeForSkill } from "../lib/teaching-dictionary-manager/contracts";
import { loadLessonReadiness } from "../lib/teaching-dictionary-manager/lesson-preflight";
import { loadRouteWordStatuses } from "../lib/teaching-dictionary-manager/route-word-status-service";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadPublishedWeakVowelWords } from "../lib/adle/weak-vowel/governed-content-loader";

process.loadEnvFile(".env.local");
// Node's loadEnvFile keeps pre-existing values, so clear only the API settings
// before loading the temporary Vercel production snapshot.
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADLE_ROUTE_ACTIVATION_ENVIRONMENT"])
  delete process.env[name];
process.loadEnvFile(".tmp/canonical-pilot-production.env");
const production = "wwohrqtunajrbwxyssjf";
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname,
  `${production}.supabase.co`, "Production Supabase required");
assert.equal(new URL(process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED ?? "").username.split(".").at(-1),
  production, "Production database required");
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";

const pilot = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
assert.equal(pilot.length, 14);
const groups = new Map<string, { routeId: string; skill: string; words: { id: string; word: string }[] }>();
for (const row of pilot) {
  assert(row.canonicalWordId && !row.error);
  for (const skill of row.payload.skillKeys) {
    const route = routeForSkill(skill);
    if (!route || route.routeId === "dynamic_affix_word_lab") continue;
    const key = `${route.routeId}:${skill}`;
    const group = groups.get(key) ?? { routeId: route.routeId, skill, words: [] };
    group.words.push({ id: row.canonicalWordId, word: row.normalisedWord });
    groups.set(key, group);
  }
}
for (const group of groups.values()) {
  const lesson = (await loadLessonReadiness({ routeId: group.routeId, microSkillKey: group.skill }))
    .find((item) => item.routeId === group.routeId && item.microSkillKey === group.skill);
  assert(lesson, `Missing preflight ${group.routeId}:${group.skill}`);
  const statuses = (await loadRouteWordStatuses({ routeId: group.routeId,
    microSkillKey: group.skill, lesson, wordIds: group.words.map((item) => item.id) })).words;
  const weak = [] as Awaited<ReturnType<typeof loadPublishedWeakVowelWords>>;
  if (group.routeId === "weak_vowel_word_lab") {
    for (let start = 0; start < group.words.length; start += 6)
      weak.push(...await loadPublishedWeakVowelWords({ client: createServiceRoleClient(),
        microSkillKey: group.skill as Parameters<typeof loadPublishedWeakVowelWords>[0]["microSkillKey"],
        canonicalWordIds: group.words.slice(start, start + 6).map((item) => item.id) }));
  }
  console.log(JSON.stringify({ route: group.routeId, skill: group.skill,
    lessonStatus: lesson.status, compilerReady: lesson.compilerReady,
    lessonBlockers: lesson.blockers,
    issueCounts: Object.fromEntries([...new Set(lesson.issues.map((item) => item.code))]
      .map((code) => [code, lesson.issues.filter((item) => item.code === code).length])),
    issueMessages: Object.fromEntries([...new Set(lesson.issues.map((item) => item.message))]
      .map((message) => [message, lesson.issues.filter((item) => item.message === message).length])),
    lessonIssues: lesson.issues.slice(0, 12).map((item) => ({ wordId: item.wordId, code: item.code, message: item.message })),
    wordCount: lesson.words.length,
    ...(group.routeId === "base_word_lab" ? { baseEntryCategories: Object.fromEntries(
      [...new Set(lesson.words.map((item) => `${item.role}:${item.requiredForRelease === false ? "optional" : "required"}:${item.blockers.join("|")}`))]
        .map((key) => [key, lesson.words.filter((item) =>
          `${item.role}:${item.requiredForRelease === false ? "optional" : "required"}:${item.blockers.join("|")}` === key).length])),
      requiredBlockedExamples: lesson.words.filter((item) => item.requiredForRelease !== false && !item.ready)
        .slice(0, 8).map((item) => ({ id: item.id, word: item.word, role: item.role, blockers: item.blockers })),
      compilerBlockedWords: lesson.words.filter((item) => item.blockers.some((blocker) => blocker.includes("compiler-valid")))
        .map((item) => ({ id: item.id, word: item.word, role: item.role })) } : {}),
    released: lesson.released, activated: lesson.activationEnabled,
    words: group.words.map((word) => {
      const status = statuses.find((item) => item.wordId === word.id)?.status;
      const published = weak.find((item) => item.canonicalWordId === word.id);
      return { word: word.word, administrativeCandidate: status?.administrativeCandidate ?? false,
        ...(published ? { weakComparison: {
          fingerprint: published.dictionaryFingerprintAtReview === published.currentDictionaryFingerprint,
          source: published.sourceFingerprint === published.routeContent.content.weakVowel.sourceFingerprint,
          meaning: published.routeContent.wordMeaning === published.definition,
          audio: published.wordAudioSha256AtPublication === published.routeContent.content.weakVowel.wordRecording?.sha256 &&
            published.sentenceAudioSha256AtPublication === published.routeContent.content.weakVowel.sentenceRecording?.sha256,
        } } : {}),
        relationshipApproved: status?.relationshipApproved ?? false,
        contentPresent: status?.contentPresent ?? false,
        technicalFacts: status?.technicalFacts ?? "missing",
        editorialApproved: status?.editorialApproved ?? false,
        blockers: status?.blockerDetails.map((item) => `${item.code}: ${item.message}`) ?? ["STATUS_MISSING"] };
    }) }));
}
