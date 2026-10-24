import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- reviewed overlay tables precede generated client types */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";

export async function loadWordBaseFamilies(
  db: SupabaseClient,
  wordId: string,
): Promise<{ name: string; meaning?: string; pronunciation?: string; words: { id: string; word: string }[] }[]> {
  const read = async (query: PromiseLike<any>): Promise<any[]> => {
    const result = await query;
    if (result.error) throw new Error("TEACHING_FAMILY_SUMMARY_READ_FAILED");
    return result.data ?? [];
  };
  // Lexical families are canonical dictionary facts. Read only the families
  // touching this word, then resolve their latest approved revision so older
  // immutable revisions do not appear as duplicate memberships.
  const lexicalMatches = await read(
    db.from("canonical_teaching_dictionary_lexical_base_family_members")
      .select("family_key,revision").eq("canonical_word_id", wordId),
  );
  if (lexicalMatches.length) {
    const keys = [...new Set(lexicalMatches.map((row) => String(row.family_key)))];
    const revisions = await read(
      db.from("canonical_teaching_dictionary_lexical_base_families")
        .select("family_key,revision,base_lemma,base_kind,base_meaning")
        .in("family_key", keys).eq("review_status", "approved")
        .order("revision", { ascending: false }),
    );
    const latest = new Map<string, any>();
    for (const row of revisions) if (!latest.has(row.family_key)) latest.set(row.family_key, row);
    if (latest.size) {
      const currentMembers = (await read(
        db.from("canonical_teaching_dictionary_lexical_base_family_members")
          .select("family_key,revision,canonical_word_id").in("family_key", [...latest.keys()]),
      )).filter((row) => latest.get(row.family_key)?.revision === row.revision);
      const activeKeys = [...latest.keys()].filter((key) =>
        currentMembers.some((row) => row.family_key === key && row.canonical_word_id === wordId));
      if (activeKeys.length) {
        const rootKeys = activeKeys.filter((key) => latest.get(key)?.base_kind === "bound_root");
        const rootDetails = rootKeys.length ? await read(
          db.from("canonical_teaching_dictionary_lexical_root_metadata")
            .select("family_key,revision,pronunciation_ipa")
            .in("family_key", rootKeys),
        ) : [];
        const rootPronunciation = new Map(rootDetails
          .filter((row) => latest.get(row.family_key)?.revision === row.revision)
          .map((row) => [row.family_key, String(row.pronunciation_ipa)]));
        const ids = [...new Set(currentMembers.filter((row) => activeKeys.includes(row.family_key))
          .map((row) => String(row.canonical_word_id)))];
        const lexicalWords = await read(
          db.from("canonical_teaching_dictionary_words").select("id,display_word")
            .in("id", ids).eq("row_status", "active"),
        );
        const display = new Map(lexicalWords.map((row) => [row.id, String(row.display_word)]));
        return activeKeys.map((key) => ({
          name: key,
          meaning: String(latest.get(key)?.base_meaning ?? ""),
          pronunciation: rootPronunciation.get(key),
          words: currentMembers.filter((row) => row.family_key === key)
            .flatMap((row) => display.has(row.canonical_word_id)
              ? [{ id: String(row.canonical_word_id), word: display.get(row.canonical_word_id)! }] : [])
            .sort((a, b) => a.word.localeCompare(b.word, "en-GB")),
        }));
      }
    }
  }
  const environment = resolveAdleRouteActivationEnvironment();
  const [legacyMembers, reviews, withdrawals, skillWithdrawals] =
    await Promise.all([
      read(
        db
          .from("canonical_teaching_dictionary_base_word_family_members")
          .select("base_word_family_id,canonical_word_id")
          .eq("row_status", "active"),
      ),
      environment
        ? read(
            db
              .from("teaching_dictionary_base_family_member_reviews")
              .select(
                "id,canonical_word_id,legacy_family_id,definition_id,word_skill_release_id,reviewed_at",
              )
              .eq("environment_key", environment)
              .order("reviewed_at"),
          )
        : Promise.resolve([]),
      read(
        db
          .from("teaching_dictionary_base_family_member_withdrawals")
          .select("review_id"),
      ),
      read(
        db.from("adle_reviewed_word_skill_withdrawals").select("release_id"),
      ),
    ]);
  const members = new Map<string, Set<string>>();
  for (const row of legacyMembers) {
    const words = members.get(row.base_word_family_id) ?? new Set<string>();
    words.add(row.canonical_word_id);
    members.set(row.base_word_family_id, words);
  }
  // Latest reviewed decision wins over the mutable legacy relationship.
  for (const row of reviews) {
    const id = row.legacy_family_id ?? row.definition_id;
    if (!id) continue;
    const words = members.get(id) ?? new Set<string>();
    if (
      withdrawals.some((w) => w.review_id === row.id) ||
      skillWithdrawals.some((w) => w.release_id === row.word_skill_release_id)
    )
      words.delete(row.canonical_word_id);
    else words.add(row.canonical_word_id);
    members.set(id, words);
  }
  const familyIds = [...members]
    .filter(([, ids]) => ids.has(wordId))
    .map(([id]) => id);
  if (!familyIds.length) return [];
  const [legacy, definitions, words] = await Promise.all([
    read(
      db
        .from("canonical_teaching_dictionary_base_word_families")
        .select("id,base_family_key")
        .in("id", familyIds)
        .eq("row_status", "active"),
    ),
    read(
      db
        .from("teaching_dictionary_base_family_definitions")
        .select("id,family_key")
        .in("id", familyIds),
    ),
    read(
      db
        .from("canonical_teaching_dictionary_words")
        .select("id,display_word")
        .in("id", [
          ...new Set(familyIds.flatMap((id) => [...members.get(id)!])),
        ])
        .eq("row_status", "active"),
    ),
  ]);
  const wordById = new Map(words.map((word) => [word.id, word.display_word]));
  return [...new Map([...legacy, ...definitions].map(family => [family.base_family_key ?? family.family_key, family])).values()].map((family) => ({
    name: family.base_family_key ?? family.family_key,
    words: [...members.get(family.id)!]
      .flatMap((id) =>
        wordById.has(id) ? [{ id, word: String(wordById.get(id)) }] : [],
      )
      .sort((a, b) => a.word.localeCompare(b.word, "en-GB")),
  }));
}
