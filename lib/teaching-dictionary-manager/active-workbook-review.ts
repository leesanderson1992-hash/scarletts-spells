import { isHomophoneReviewSkill } from "./homophone-review-contract";
import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { targetOccurrences } from "./authoring";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { isPrefixWorkbookSkill } from "./prefix-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;
type ReviewRow = { id: string; word: string; note: string; href: string };
type ActiveWord = { canonicalWordId: string; word: string; base?: string; senseId?: string };

/** Add editorial gaps to the export list while keeping the published lesson pool intact. */
export async function includeActiveWorkbookReview(db: Db, skill: string, current: readonly ActiveWord[],
  rows: ReviewRow[], requiresFamily = true): Promise<ReviewRow[]> {
  const environment = ingReviewEnvironment();
  if (!environment || !current.length || isPrefixWorkbookSkill(skill) || isHomophoneReviewSkill(skill)) return rows;
  const byId = new Map(rows.map(row => [row.id, row]));
  const active = [...new Map(current.map(word => [word.canonicalWordId, word])).values()];
  for (let offset = 0; offset < active.length; offset += 75) {
    const batch = active.slice(offset, offset + 75);
    const ids = batch.map(word => word.canonicalWordId);
    const [bundles, bindings] = await Promise.all([
      loadReviewedMeaningBundles(db, ids),
      db.from("teaching_dictionary_effective_lesson_sense_bindings")
        .select("canonical_word_id,sense_id").eq("environment_key", environment)
        .eq("micro_skill_key", skill).in("canonical_word_id", ids),
    ]);
    if (bindings.error) throw new Error("Could not check teaching meanings for the review workbook.");
    const bundleById = new Map(bundles.map(bundle => [bundle.wordId, bundle]));
    const bound = new Map<string, Set<string>>();
    for (const row of bindings.data ?? []) {
      const senses = bound.get(row.canonical_word_id) ?? new Set();
      senses.add(row.sense_id);
      bound.set(row.canonical_word_id, senses);
    }
    for (const word of batch) {
      const id = word.canonicalWordId;
      const bundle = bundleById.get(id);
      const senses = bundle?.senseSet.senses ?? [];
      const bindings = bound.get(id);
      const senseId = word.senseId ?? (bindings?.size === 1 ? [...bindings][0]
        : !bindings?.size && senses.length === 1 ? senses[0].id : undefined);
      const sense = senses.find(row => row.id === senseId);
      const pronunciation = bundle?.senseSet.pronunciations.find(row => row.id === sense?.pronunciationId);
      const analysis = bundle?.analyses.find(row => row.senseId === sense?.id);
      const issues: string[] = [];
      if (!sense && senses.length > 1) issues.push("Choose the teaching meaning to check its IPA, dictation and word parts.");
      else {
        if (sense?.partOfSpeech !== "root") {
          if (!pronunciation?.ipa?.trim()) issues.push("Approve British IPA for the teaching meaning.");
          const sentence = sense?.dictationSentence;
          if (!sentence?.trim() || !targetOccurrences(sentence, word.word).includes(sense?.dictationTargetTokenIndex ?? -1))
            issues.push("Approve a dictation sentence for the teaching meaning.");
        }
        if (!analysis?.parts.length) issues.push("Approve the word parts for the teaching meaning.");
        if (requiresFamily && !analysis?.familyKey) issues.push("Confirm the teaching family for this meaning.");
      }
      if (!issues.length) continue;
      const existing = byId.get(id);
      byId.set(id, { id, word: word.word, href: existing?.href ?? `/admin/teaching-dictionary/${id}#td-overview`,
        note: [existing?.note ?? "Active in the live lesson.", ...issues].join(" ") });
    }
  }
  return [...byId.values()].sort((a, b) => a.word.localeCompare(b.word, "en-GB") || a.id.localeCompare(b.id));
}
