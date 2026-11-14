import "server-only";

import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import { loadPublishedWeakVowelWords } from "@/lib/adle/weak-vowel/governed-content-loader";
import { publishedWeakVowelWordBlockers } from "@/lib/adle/weak-vowel/governed-content";
import { publishedDictionaryDegreeFamilies } from "@/lib/adle/inflection/published-dictionary-families";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { loadCurrentPairDeassignments } from "@/lib/adle/word-skill-relationships/pair-decision-veto";
import { canonicalPairKey } from "@/lib/adle/word-skill-relationships/pair-key";
import type { AdjectiveFamilyV1, ComparativeMicroSkill } from "@/lib/adle/inflection/contracts";
import type { WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadIdentifyBaseReview } from "./base-word-review";
import { loadLessonReadiness } from "./lesson-preflight";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";

type Db = ReturnType<typeof createServiceRoleClient>;
type PoolWord = { canonicalWordId: string; word: string; base: string; meaning: string; dictationSentence: string };
export async function loadSpecialistBulkReview(db: Db, skill: string, routeId: string, includeBundles = false) {
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
  const [lesson] = await loadLessonReadiness({ routeId, microSkillKey: skill });
  if (!lesson) throw new Error("The lesson could not be loaded.");
  const current: PoolWord[] = [];
  const words = new Map(lesson.words.map(word => [word.id, word.word]));
  let blockedNote = "Review the word and publish the lesson content from its Micro-skills section.";
  if (routeId === "dynamic_prefix_word_lab") {
    const child = "00000000-0000-4000-8000-000000000001";
    const [ready, profile] = await Promise.all([
      loadDynamicPrefixProfiles(db, child, { microSkillKeys: [skill], allowStagingProfiles: true }),
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
    for (const word of ready.profiles[0]?.wordsByCanonicalId.values() ?? []) current.push({
      canonicalWordId: word.canonicalWordId, word: word.displayWord, base: word.baseWord,
      meaning: word.derivedMeaning, dictationSentence: word.dictationSentence,
    });
    blockedNote = "Review the prefix, its meaning and the teaching family, then publish the word through Lesson readiness.";
  } else if (routeId === "comparative_superlative_word_lab") {
    const head = await db.from("adle_route_activation_heads").select("current_revision_id").eq("environment_key", "staging")
      .eq("route_id", routeId).eq("micro_skill_key", skill).maybeSingle();
    if (head.error) throw new Error("Could not load the comparative lesson.");
    if (head.data) {
      const revision = await db.from("adle_route_activation_revisions").select("release_manifest_id,activation_status")
        .eq("id", head.data.current_revision_id).single();
      if (revision.error) throw new Error("Could not load the comparative release.");
      if (revision.data.activation_status === "enabled") {
        const binding = await db.from("adle_curriculum_release_dependencies").select("authority_id")
          .eq("release_manifest_id", revision.data.release_manifest_id).eq("micro_skill_key", skill)
          .eq("authority_type", "adjective_degree_families").single();
        if (binding.error) throw new Error("Could not load the comparative family reference.");
        const source = await db.from("adle_curriculum_dependency_authorities").select("semantic_projection").eq("id", binding.data.authority_id).single();
        if (source.error) throw new Error("Could not load the comparative words.");
        const families = (source.data.semantic_projection as { families: AdjectiveFamilyV1[] }).families;
        for (const family of families) for (const word of family.words) words.set(word.canonicalWordId, word.word);
        const approved = await publishedDictionaryDegreeFamilies({ client: db, skill: skill as ComparativeMicroSkill, families });
        for (const family of approved) for (const word of family.words) current.push({
          canonicalWordId: word.canonicalWordId, word: word.word, base: family.words[0].word,
          meaning: family.meaning, dictationSentence: "",
        });
      }
    }
    blockedNote = "Confirm the reviewed base, comparative and superlative forms and publish approvals for all three forms.";
  } else {
    const publications = await db.from("adle_weak_vowel_content_publications").select("canonical_word_id,canonical_teaching_dictionary_words(display_word)")
      .eq("micro_skill_key", skill);
    if (publications.error) throw new Error("Could not load the schwa publications.");
    for (const row of publications.data as unknown as { canonical_word_id: string; canonical_teaching_dictionary_words: { display_word: string } | null }[]) {
      if (row.canonical_teaching_dictionary_words) words.set(row.canonical_word_id, row.canonical_teaching_dictionary_words.display_word);
    }
    const ids = [...words.keys()];
    const [relationships, vetoes] = await Promise.all([
      loadPublishedWritingAssociations(db, "staging", ids),
      loadCurrentPairDeassignments({ client: db, environmentKey: "staging",
        pairs: ids.map(canonicalWordId => ({ canonicalWordId, microSkillKey: skill })) }),
    ]);
    const approved = new Set(relationships.filter(row => row.microSkillKey === skill && row.rowStatus === "active" &&
      row.relationshipRole === "demonstrates").map(row => row.canonicalWordId));
    const candidates = ids.filter(id => approved.has(id) && !vetoes.has(canonicalPairKey(id, skill)));
    if (lesson.activationEnabled) for (let at = 0; at < candidates.length; at += 6) {
      const published = await loadPublishedWeakVowelWords({ client: db, microSkillKey: skill as WeakVowelMicroSkill,
        canonicalWordIds: candidates.slice(at, at + 6) });
      for (const word of published) if (!publishedWeakVowelWordBlockers(word, skill as WeakVowelMicroSkill).length) current.push({
        canonicalWordId: word.canonicalWordId, word: word.spelling, base: "", meaning: word.definition, dictationSentence: word.sentence,
      });
    }
    blockedNote = "Check the schwa activity facts and recordings, then publish the word from its lesson section.";
  }
  const active = new Set(current.map(word => word.canonicalWordId));
  const entries = new Map(lesson.words.map(word => [word.id, word]));
  const rows = [...words].filter(([id]) => !active.has(id)).map(([id, word]) => {
    const entry = entries.get(id);
    return { id, word, href: entry?.editHref ?? `/admin/teaching-dictionary/${id}#td-route-${skill}`,
      note: [...new Set([...(entry?.blockers ?? []), blockedNote])].join(" ") };
  }).sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
  let bundles: MultiSenseCsvBundle[] = [];
  if (includeBundles) {
    const ids = rows.map(row => row.id);
    for (let at = 0; at < ids.length; at += 75) bundles.push(...await loadReviewedMeaningBundles(db, ids.slice(at, at + 75)));
    const reviewed = new Set(bundles.map(bundle => bundle.wordId));
    bundles = [...bundles, ...rows.filter(row => !reviewed.has(row.id)).map(row => ({
      wordId: row.id, displayWord: row.word, sourceSenseReviewedAt: "", analyses: [],
      senseSet: { pronunciations: [], senses: [{ id: "review", definition: "", partOfSpeech: "", pronunciationId: null }] },
    }))];
  }
  return { current, rows, bundles, title: lesson.title, routeId, skill };
}
