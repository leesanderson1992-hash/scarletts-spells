import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { releaseAdlePausedWord } from "@/app/courses/review/actions";

type AdlePausedWordsSectionProps = {
  childId: string;
  childName: string;
  redirectPath: string;
};

type PausedWordEntry = {
  canonicalWordId: string;
  displayWord: string;
  microSkillKey: string | null;
  lastAttemptText: string | null;
  reteachCycleCount: number;
};

/**
 * ADLE Slice 6: "Paused spelling words" inside the existing Review Work
 * surface — the release path for words paused by a second reteach failure.
 * Resume returns the word to the reteach path; Retire removes it from the
 * queue. Re-mapping goes through the existing candidate-mapping flow.
 */
export async function AdlePausedWordsSection({
  childId,
  childName,
  redirectPath,
}: AdlePausedWordsSectionProps) {
  const serviceClient = createServiceRoleClient();

  const { data: wordRows, error } = await serviceClient
    .from("adle_review_schedule_words")
    .select("canonical_word_id, reteach_cycle_count")
    .eq("child_id", childId)
    .eq("membership_status", "paused_parent_review")
    .eq("row_status", "active");
  if (error || !wordRows || wordRows.length === 0) {
    return null;
  }

  const wordIds = wordRows.map((row) => (row as { canonical_word_id: string }).canonical_word_id);
  const [{ data: dictionaryRows }, { data: itemRows }] = await Promise.all([
    serviceClient
      .from("canonical_teaching_dictionary_words")
      .select("id, display_word")
      .in("id", wordIds),
    serviceClient
      .from("adle_learning_items")
      .select("canonical_word_id, micro_skill_key, source_attempt_text")
      .eq("child_id", childId)
      .in("canonical_word_id", wordIds)
      .eq("row_status", "active"),
  ]);
  const displayById = new Map(
    ((dictionaryRows ?? []) as { id: string; display_word: string }[]).map((row) => [
      row.id,
      row.display_word,
    ]),
  );
  const itemByWordId = new Map(
    ((itemRows ?? []) as {
      canonical_word_id: string;
      micro_skill_key: string;
      source_attempt_text: string | null;
    }[]).map((row) => [row.canonical_word_id, row]),
  );

  const entries: PausedWordEntry[] = wordRows.map((rawRow) => {
    const row = rawRow as { canonical_word_id: string; reteach_cycle_count: number };
    const item = itemByWordId.get(row.canonical_word_id);
    return {
      canonicalWordId: row.canonical_word_id,
      displayWord: displayById.get(row.canonical_word_id) ?? row.canonical_word_id,
      microSkillKey: item?.micro_skill_key ?? null,
      lastAttemptText: item?.source_attempt_text ?? null,
      reteachCycleCount: row.reteach_cycle_count,
    };
  });

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Paused spelling words</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
        Words waiting for your decision
      </h2>
      <p className="mt-1 text-sm text-[color:var(--mid)]">
        These words failed twice even after a reteach, so {childName}&apos;s daily
        plan paused them for you. Resume sends a word back for another reteach
        lesson; Retire removes it from the queue for now.
      </p>
      <div className="mt-3 grid gap-2">
        {entries.map((entry) => (
          <article
            key={entry.canonicalWordId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--ink)]">{entry.displayWord}</p>
              <p className="mt-0.5 text-xs text-[color:var(--mid)]">
                {entry.microSkillKey ?? "skill unknown"}
                {entry.lastAttemptText ? ` · last attempt "${entry.lastAttemptText}"` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {(["resume", "retire"] as const).map((decision) => (
                <form key={decision} action={releaseAdlePausedWord}>
                  <input type="hidden" name="child_id" value={childId} />
                  <input type="hidden" name="canonical_word_id" value={entry.canonicalWordId} />
                  <input type="hidden" name="decision" value={decision} />
                  <input type="hidden" name="redirect_path" value={redirectPath} />
                  <button
                    type="submit"
                    className={decision === "resume" ? "brand-primary-btn" : "brand-secondary-btn"}
                  >
                    {decision === "resume" ? "Resume" : "Retire"}
                  </button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
