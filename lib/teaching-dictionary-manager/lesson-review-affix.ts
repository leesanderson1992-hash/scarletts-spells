import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isSuffixReviewSkill } from "./able-ible-workbook";
import { loadAbleIbleWorkbook, stageAbleIbleWord, suffixWorkbookIssues } from "./able-ible-review";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { prefixWorkbookEnabled, prefixWorkbooks } from "./prefix-workbook";
import { stagePrefixWorkbookDraft } from "./prefix-workbook-draft";
import { loadPrefixWorkbookQueue } from "./prefix-bulk-review";

type Db = ReturnType<typeof createServiceRoleClient>;

// Shared facts can prepare a route draft, while the lesson's publish action
// still checks the complete pool and controls learner availability.
export async function stageQueuedAffixReview(db: Db, actor: string, skill: string,
  senses: Record<string, string>, words: ReadonlyMap<string, { display_word: string }>) {
  const suffix = isSuffixReviewSkill(skill);
  const prefix = prefixWorkbookEnabled(skill) ? skill : null;
  if (!suffix && !prefix) return [];
  const ids = Object.keys(senses);
  const failures: { id: string; word: string; reason: string }[] = [];
  const record = (id: string, reason: string) =>
    failures.push({ id, word: words.get(id)?.display_word ?? id, reason });
  try {
    const { bundles, suffixFacts } = suffix ? await loadAbleIbleWorkbook(db, ids)
      : { bundles: await loadReviewedMeaningBundles(db, ids), suffixFacts: null };
    const byId = new Map(bundles.map(bundle => [bundle.wordId, bundle]));
    // Bound parallel writes to independent words. Route publication is separate.
    for (let offset = 0; offset < ids.length; offset += 4) {
      await Promise.all(ids.slice(offset, offset + 4).map(async id => {
        const bundle = byId.get(id);
        const senseId = senses[id];
        if (!bundle) return record(id, "Review the meaning and word parts.");
        try {
          if (prefix) {
            const part = bundle.analyses.find(item => item.senseId === senseId)?.parts[0];
            const choices = prefixWorkbooks[prefix].choices.filter(choice => part?.kind === "prefix" &&
              choice.prefix === part.sourceText && choice.gloss === part.gloss.trim().toLowerCase());
            if (choices.length !== 1) return record(id, "Choose the reviewed prefix meaning in the workbook.");
            await stagePrefixWorkbookDraft(db, actor, bundle, prefix, senseId, choices[0].id);
            const [review] = await loadPrefixWorkbookQueue(db, prefix, [id]);
            if (review?.blockers.length) record(id, review.blockers.join(" "));
            return;
          }
          const facts = suffixFacts?.get(id);
          const blockers = suffixWorkbookIssues(facts);
          if (!facts || blockers.length) return record(id, blockers.join(" "));
          await stageAbleIbleWord(db, actor, bundle, senseId, facts, skill);
        } catch (error) {
          record(id, error instanceof Error ? error.message : "Recheck the lesson facts in Bulk review.");
        }
      }));
    }
  } catch {
    for (const id of ids) record(id, "Could not check the lesson fields. Recheck in Bulk review.");
  }
  return failures;
}
