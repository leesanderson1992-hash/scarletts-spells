import { NEGATIVE_PREFIX_SKILL, prefixWorkbookEnabled, prefixWorkbooks } from "./prefix-workbook";
import "server-only";

import { loadLessonReviewRequests } from "./lesson-review-requests";

import { loadWeakVowelSelectionPool } from "@/lib/adle/weak-vowel/readiness-loader";
import { loadComparativeSelectionPool } from "@/lib/adle/inflection/readiness-loader";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { loadCurrentPairDeassignments } from "@/lib/adle/word-skill-relationships/pair-decision-veto";
import { excludeDeassignedDynamicPrefixWords } from "@/lib/adle/morphology/dynamic-prefix-pair-eligibility";
import { ingReviewEnvironment } from "./ing-staging-scope";
import type { ComparativeMicroSkill } from "@/lib/adle/inflection/contracts";
import type { WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadIdentifyBaseReview } from "./base-word-review";
import { loadLessonReadiness } from "./lesson-preflight";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";

type Db = ReturnType<typeof createServiceRoleClient>;
type PoolWord = { canonicalWordId: string; word: string; base: string; meaning: string; dictationSentence: string };
export async function loadSpecialistBulkReview(db: Db, skill: string, routeId: string, includeBundles = false) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Bulk review is unavailable.");
  if (routeId === "base_word_lab") {
    const base = await loadIdentifyBaseReview(db, includeBundles, skill);
    return { current: base.current, routeId, skill,
      title: ({
        D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX: "Base plus prefix",
        D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX: "Base plus suffix",
        D4_MOR_BASE_WORDS_PRESERVE_BASE: "Preserve the base",
      } as Record<string, string>)[skill] ?? "Base Word",
      rows: base.rows.map(row => ({ ...row, href: `/admin/teaching-dictionary/${row.id}#td-base-family` })),
      bundles: base.rows.flatMap(row => row.bundle ? [row.bundle] : []),
    };
  }
  const [[lesson], requests] = await Promise.all([
    loadLessonReadiness({ routeId, microSkillKey: skill }), loadLessonReviewRequests(db, skill),
  ]);
  if (!lesson) throw new Error("The lesson could not be loaded.");
  const current: PoolWord[] = [];
  const words = new Map(lesson.words.map(word => [word.id, word.word]));
  for (const row of requests.values()) words.set(row.word_id, row.word);
  let blockedNote = "Review the word and publish the lesson content from its Micro-skills section.";
  if (routeId === "dynamic_prefix_word_lab") {
    const child = "00000000-0000-4000-8000-000000000001";
    const [ready, profile] = await Promise.all([
      loadDynamicPrefixProfiles(db, child, { microSkillKeys: [skill], allowStagingProfiles: environment === "staging" }),
      db.from("canonical_teaching_dictionary_prefix_profiles").select("canonical_teaching_dictionary_prefix_members(canonical_word_id,row_status,assignment_eligible,canonical_teaching_dictionary_words(display_word))")
        .eq("micro_skill_key", skill).eq("row_status", "active").maybeSingle(),
    ]);
    if (profile.error) throw new Error("Could not load the older prefix members.");
    const members = (profile.data?.canonical_teaching_dictionary_prefix_members ?? []) as unknown as {
      canonical_word_id: string; row_status: string; assignment_eligible: boolean;
      canonical_teaching_dictionary_words: { display_word: string } | null;
    }[];
    for (const member of members) {
      const word = member.canonical_teaching_dictionary_words?.display_word;
      if (word && member.row_status === "active" && member.assignment_eligible) words.set(member.canonical_word_id, word);
    }
    const profiles = ready.profiles.filter(profile => profile.productionEnabled);
    const vetoes = await loadCurrentPairDeassignments({ client: db, environmentKey: environment,
      pairs: profiles.flatMap(profile => [...profile.wordsByCanonicalId.keys()].map(canonicalWordId => ({ canonicalWordId, microSkillKey: skill }))) });
    const [selectable] = excludeDeassignedDynamicPrefixWords(profiles, vetoes);
    for (const word of selectable && selectable.wordsByCanonicalId.size >= 4 ? selectable.wordsByCanonicalId.values() : []) current.push({
      canonicalWordId: word.canonicalWordId, word: word.displayWord, base: word.baseWord,
      meaning: word.derivedMeaning, dictationSentence: word.dictationSentence,
    });
    blockedNote = "Review the word parts and family in the workbook, then resolve any missing facts in Bulk review before publishing.";
  } else if (routeId === "comparative_superlative_word_lab") {
    const pool = await loadComparativeSelectionPool({ client: db, environmentKey: environment, microSkillKey: skill as ComparativeMicroSkill });
    if (pool.status === "ready") {
      for (const family of pool.families) for (const word of family.words) words.set(word.canonicalWordId, word.word);
      for (const family of pool.selectableFamilies.length >= 2 ? pool.selectableFamilies : []) for (const word of family.words) current.push({
        canonicalWordId: word.canonicalWordId, word: word.word, base: family.words[0].word,
        meaning: family.meaning, dictationSentence: "",
      });
    }
    blockedNote = "Confirm the reviewed base, comparative and superlative forms and publish approvals for all three forms.";
  } else {
    const publications = await db.from("adle_weak_vowel_content_publications").select("canonical_word_id,canonical_teaching_dictionary_words(display_word)")
      .eq("micro_skill_key", skill);
    if (publications.error) throw new Error("Could not load the schwa publications.");
    for (const row of publications.data as unknown as { canonical_word_id: string; canonical_teaching_dictionary_words: { display_word: string } | null }[]) {
      if (row.canonical_teaching_dictionary_words) words.set(row.canonical_word_id, row.canonical_teaching_dictionary_words.display_word);
    }
    if (lesson.activationEnabled) {
      const pool = await loadWeakVowelSelectionPool({ client: db, environmentKey: environment }, skill as WeakVowelMicroSkill);
      for (const word of pool.words.length >= 4 ? pool.words : []) current.push({
        canonicalWordId: word.canonicalWordId, word: word.spelling, base: "", meaning: word.definition, dictationSentence: word.sentence,
      });
    }
    blockedNote = "Check the schwa activity facts and recordings, then publish the word from its lesson section.";
  }
  const active = new Map(current.map(word => [word.canonicalWordId, word]));
  const entries = new Map(lesson.words.map(word => [word.id, word]));
  const facts = new Map<string, MultiSenseCsvBundle>();
  const lessonSenses = new Map<string, string[]>();
  const auditNegativePrefix = skill === NEGATIVE_PREFIX_SKILL;
  const ids = [...words.keys()].filter(id => auditNegativePrefix || (includeBundles && !active.has(id)));
  for (let at = 0; at < ids.length; at += 75) {
    const batch = ids.slice(at, at + 75);
    const [bundles, bindings] = await Promise.all([
      loadReviewedMeaningBundles(db, batch),
      auditNegativePrefix ? db.from("teaching_dictionary_effective_lesson_sense_bindings")
        .select("canonical_word_id,sense_id").eq("environment_key", environment)
        .eq("micro_skill_key", skill).in("canonical_word_id", batch) : null,
    ]);
    if (bindings?.error) throw new Error("Could not check the negative-prefix teaching meanings.");
    for (const bundle of bundles) facts.set(bundle.wordId, bundle);
    for (const binding of bindings?.data ?? []) lessonSenses.set(binding.canonical_word_id,
      [...(lessonSenses.get(binding.canonical_word_id) ?? []), binding.sense_id]);
  }
  const rows = [...words].flatMap(([id, word]) => {
    const entry = entries.get(id);
    const inPool = active.get(id);
    const issues = auditNegativePrefix ? negativePrefixReviewIssues(
      facts.get(id), requests.get(id)?.sense_id, lessonSenses.get(id) ?? [], inPool?.base,
    ) : [];
    if (inPool && !issues.length) return [];
    return [{ id, word, href: issues.length ? `/admin/teaching-dictionary/${id}#td-overview`
      : entry?.editHref ?? `/admin/teaching-dictionary/${id}#td-route-${skill}`,
      note: [...new Set([...(inPool ? ["Active in the live lesson."] : []), ...issues,
        ...(entry?.blockers ?? []), ...(inPool ? [] : [blockedNote])])].join(" ") }];
  }).sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
  let bundles: MultiSenseCsvBundle[] = includeBundles ? rows.map(row => facts.get(row.id) ?? ({
    wordId: row.id, displayWord: row.word, sourceSenseReviewedAt: "", analyses: [],
    senseSet: { pronunciations: [], senses: [{ id: "review", definition: "", partOfSpeech: "", pronunciationId: null }] },
  })) : [];
  if (includeBundles && auditNegativePrefix) {
    const legacyIds = bundles.filter(bundle => !bundle.sourceSenseReviewedAt).map(bundle => bundle.wordId);
    const pronunciations = new Map<string, { ipa: string; spokenSyllableCount: number | null; stressPattern: string }>();
    for (let at = 0; at < legacyIds.length; at += 75) {
      const { data, error } = await db.from("canonical_teaching_dictionary_word_metadata")
        .select("canonical_word_id,phoneme_hint,syllables,stress_pattern")
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
        .in("canonical_word_id", legacyIds.slice(at, at + 75))
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      if (error) throw new Error("Could not load existing IPA for the negative-prefix workbook.");
      for (const row of data ?? []) {
        if (!row.phoneme_hint?.trim() || pronunciations.has(row.canonical_word_id)) continue;
        const count = Number(row.syllables);
        pronunciations.set(row.canonical_word_id, { ipa: row.phoneme_hint.trim(),
          spokenSyllableCount: Number.isInteger(count) && count >= 1 && count <= 20 ? count : null,
          stressPattern: row.stress_pattern ?? "" });
      }
    }
    bundles = bundles.map(bundle => {
      const pronunciation = pronunciations.get(bundle.wordId);
      if (!pronunciation) return bundle;
      const id = "legacy-pronunciation";
      return { ...bundle, senseSet: {
        pronunciations: [{ ...pronunciation, id }],
        senses: bundle.senseSet.senses.map(sense => ({ ...sense, pronunciationId: id })),
      } };
    });
  }
  return { current, rows, bundles, title: prefixWorkbookEnabled(skill) ? prefixWorkbooks[skill].title : lesson.title, routeId, skill };
}

export function negativePrefixReviewIssues(bundle: MultiSenseCsvBundle | undefined,
  requestedSense: string | null | undefined, boundSenses: string[], teachingBase?: string) {
  const senses = bundle?.senseSet.senses ?? [];
  const senseId = requestedSense ?? (requestedSense === undefined && boundSenses.length === 1
    ? boundSenses[0] : senses.length === 1 ? senses[0].id : undefined);
  const sense = senses.find(row => row.id === senseId);
  if (!sense && senses.length > 1) return ["Choose the teaching meaning to check its British IPA and family."];
  const issues: string[] = [];
  if (!sense || !bundle?.senseSet.pronunciations.some(row => row.id === sense.pronunciationId && row.ipa?.trim()))
    issues.push("Approve British IPA for the teaching meaning.");
  const analysis = bundle?.analyses.find(row => row.senseId === sense?.id);
  const approvedBase = analysis?.parts.find(part => part.id === analysis.componentPartId && part.kind === "base");
  if (!analysis?.familyKey || analysis.relationshipKind !== "derived" || !approvedBase || (teachingBase && approvedBase.sourceText !== teachingBase))
    issues.push(teachingBase ? `Confirm the approved ${teachingBase} family for the teaching meaning.`
      : "Confirm the approved base family for the teaching meaning.");
  return issues;
}
