import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- reviewed overlay tables precede generated client types */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { familyDisplayName, lexicalFamilyDisplayName, legacyFamilyBase } from "./family-display-name";

export type FamilySummary = { name: string; displayName?: string; meaning?: string; pronunciation?: string;
  baseWordId?: string; baseKind?: string; aliases?: string[];
  words: { id: string; word: string }[] };

/** The latest approved lexical revision owns shared family facts. Registry and
 * lesson families remain compatibility sources only when no lexical successor exists. */
export function mergeWordFamilySummaries(
  registry: FamilySummary[], lexical: FamilySummary[], adle: FamilySummary[],
  lexicalSuccessorKeys: ReadonlySet<string>,
): FamilySummary[] {
  const current = new Map<string, FamilySummary>();
  const canonical = lexical.map(family => ({ ...family, words: [...family.words] }));
  const compatibility = [...adle, ...registry].filter(family => {
    const matches = canonical.filter(candidate => candidate.aliases?.includes(family.name));
    if (matches.length !== 1) return true;
    const target = matches[0];
    target.words = [...new Map([...family.words, ...target.words].map(word => [word.id, word])).values()]
      .sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
    return false;
  });
  for (const family of compatibility) {
    const canonicalMatches = family.baseWordId && family.meaning && family.words.length
      ? lexical.filter(candidate => candidate.baseKind === "free_base" && candidate.baseWordId === family.baseWordId &&
        candidate.meaning === family.meaning && family.words.every(word => candidate.words.some(member => member.id === word.id)))
      : [];
    // A lesson's compatibility record is not a second Dictionary family.
    // Prefer one exact canonical base/meaning with all of those members;
    // preserve ambiguous or differently reviewed family connections.
    if (!lexicalSuccessorKeys.has(family.name) && canonicalMatches.length !== 1) current.set(family.name, family);
  }
  for (const family of canonical) current.set(family.name, family);
  return [...current.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export async function loadWordBaseFamilies(
  db: SupabaseClient,
  wordId: string,
): Promise<FamilySummary[]> {
  const read = async (query: PromiseLike<any>): Promise<any[]> => {
    const result = await query;
    if (result.error) throw new Error("TEACHING_FAMILY_SUMMARY_READ_FAILED");
    return result.data ?? [];
  };
  const canonicalLinks = await read(
    db.from("teaching_dictionary_spelling_registry_members")
      .select("canonical_family_id").eq("canonical_word_id", wordId),
  );
  let registryFamilies: FamilySummary[] = [];
  if (canonicalLinks.length) {
    const familyIds = [...new Set(canonicalLinks.map((row) => String(row.canonical_family_id)))];
    const [families, members, rootAliases] = await Promise.all([
      read(db.from("canonical_teaching_dictionary_base_family_registry")
        .select("id,family_key,base_lemma,base_kind,meaning_variants").in("id", familyIds)),
      read(db.from("teaching_dictionary_spelling_registry_members")
        .select("canonical_family_id,canonical_word_id").in("canonical_family_id", familyIds)),
      read(db.from("canonical_teaching_dictionary_base_family_registry_aliases")
        .select("canonical_family_id,source_key,source_revision")
        .in("canonical_family_id", familyIds).eq("source_type", "lexical_root")),
    ]);
    const rootKeys = rootAliases.map((row) => String(row.source_key));
    const rootDetails = rootKeys.length ? await read(
      db.from("canonical_teaching_dictionary_lexical_root_metadata")
        .select("family_key,revision,pronunciation_ipa,pronunciation_applicability").in("family_key", rootKeys),
    ) : [];
    const pronunciation = new Map(rootAliases.flatMap((alias) => {
      const detail = rootDetails.find((row) => row.family_key === alias.source_key &&
        row.revision === alias.source_revision);
      return detail
        ? [[String(alias.canonical_family_id), detail.pronunciation_applicability === "not_applicable"
          ? "Not applicable (bound root)" : String(detail.pronunciation_ipa)] as const] : [];
    }));
    const wordIds = [...new Set(members.map((row) => String(row.canonical_word_id)))];
    const words = wordIds.length ? await read(
      db.from("canonical_teaching_dictionary_words").select("id,display_word")
        .in("id", wordIds).eq("row_status", "active"),
    ) : [];
    const display = new Map(words.map((row) => [String(row.id), String(row.display_word)]));
    registryFamilies = families.map((family) => ({
      name: String(family.family_key),
      displayName: familyDisplayName({ base: String(family.base_lemma), kind: String(family.base_kind),
        meaning: Array.isArray(family.meaning_variants) ? family.meaning_variants.map(String).join("; ") : "" }),
      meaning: Array.isArray(family.meaning_variants)
        ? family.meaning_variants.map(String).join("; ") : "",
      pronunciation: pronunciation.get(String(family.id)),
      words: members.filter((member) => member.canonical_family_id === family.id)
        .flatMap((member) => display.has(String(member.canonical_word_id))
          ? [{ id: String(member.canonical_word_id), word: display.get(String(member.canonical_word_id))! }]
          : [])
        .sort((a, b) => a.word.localeCompare(b.word, "en-GB")),
    })).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  }
  // Lexical families are canonical dictionary facts. Read only the families
  // touching this word, then resolve their latest approved revision so older
  // immutable revisions do not appear as duplicate memberships.
  const [legacyLexicalMatches, senseLexicalMatches] = await Promise.all([
    read(db.from("teaching_dictionary_spelling_lexical_members")
      .select("family_key,revision").eq("canonical_word_id", wordId)),
    read(db.from("teaching_dictionary_current_sense_family_memberships")
      .select("family_key,current_family_revision").eq("canonical_word_id", wordId)),
  ]);
  const lexicalMatches = [...legacyLexicalMatches, ...senseLexicalMatches.map(row => ({
    family_key: row.family_key, revision: row.current_family_revision }))];
  let lexicalFamilies: FamilySummary[] = [];
  const lexicalSuccessorKeys = new Set<string>();
  if (lexicalMatches.length) {
    const keys = [...new Set(lexicalMatches.map((row) => String(row.family_key)))];
    const revisions = await read(
      db.from("teaching_dictionary_families_with_current_meaning")
        .select("family_key,revision,base_lemma,base_kind,base_part_of_speech,base_meaning,canonical_base_word_id")
        .in("family_key", keys).eq("review_status", "approved")
        .order("revision", { ascending: false }),
    );
    const latest = new Map<string, any>();
    for (const row of revisions) if (!latest.has(row.family_key)) latest.set(row.family_key, row);
    for (const key of latest.keys()) lexicalSuccessorKeys.add(key);
    if (latest.size) {
      const historicalMembers = (await read(
        db.from("teaching_dictionary_spelling_lexical_members")
          .select("family_key,revision,canonical_word_id").in("family_key", [...latest.keys()]),
      )).filter((row) => latest.get(row.family_key)?.revision === row.revision);
      const reviewedSenseMembers = await read(db.from("teaching_dictionary_current_sense_family_memberships")
        .select("family_key,current_family_revision,canonical_word_id")
        .in("family_key", [...latest.keys()]));
      const currentMembers = [...new Map([...historicalMembers,
        ...reviewedSenseMembers.map(row => ({ family_key: row.family_key,
          revision: row.current_family_revision, canonical_word_id: row.canonical_word_id }))]
        .map(row => [`${row.family_key}:${row.canonical_word_id}`, row])).values()];
      const activeKeys = [...latest.keys()].filter((key) =>
        currentMembers.some((row) => row.family_key === key && row.canonical_word_id === wordId));
      if (activeKeys.length) {
        const rootKeys = activeKeys.filter((key) => latest.get(key)?.base_kind === "bound_root");
        const rootDetails = rootKeys.length ? await read(
          db.from("canonical_teaching_dictionary_lexical_root_metadata")
            .select("family_key,revision,pronunciation_ipa,pronunciation_applicability")
            .in("family_key", rootKeys),
        ) : [];
        const rootPronunciation = new Map(rootDetails
          .filter((row) => latest.get(row.family_key)?.revision === row.revision)
          .map((row) => [row.family_key, row.pronunciation_applicability === "not_applicable"
            ? "Not applicable (bound root)" : String(row.pronunciation_ipa)]));
        const ids = [...new Set(currentMembers.filter((row) => activeKeys.includes(row.family_key))
          .map((row) => String(row.canonical_word_id)))];
        const lexicalWords = await read(
          db.from("canonical_teaching_dictionary_words").select("id,display_word")
            .in("id", ids).eq("row_status", "active"),
        );
        const display = new Map(lexicalWords.map((row) => [row.id, String(row.display_word)]));
        // Recorded registry aliases establish identity even after wording edits.
        // Never infer identity just from a matching base or part of speech.
        const ownAliases = await read(db.from("canonical_teaching_dictionary_base_family_registry_aliases")
          .select("source_key,canonical_family_id").in("source_key", activeKeys));
        const groupIds = [...new Set(ownAliases.map(row => row.canonical_family_id))];
        const [allAliases, groups] = groupIds.length ? await Promise.all([
          read(db.from("canonical_teaching_dictionary_base_family_registry_aliases").select("source_key,canonical_family_id").in("canonical_family_id", groupIds)),
          read(db.from("canonical_teaching_dictionary_base_family_registry").select("id,family_key").in("id", groupIds)),
        ]) : [[], []];
        lexicalFamilies = activeKeys.map((key) => ({
          aliases: ownAliases.filter(row => row.source_key === key && ownAliases.filter(other => other.canonical_family_id === row.canonical_family_id).length === 1)
            .flatMap(row => [...allAliases.filter(alias => alias.canonical_family_id === row.canonical_family_id).map(alias => String(alias.source_key)),
              ...groups.filter(group => group.id === row.canonical_family_id).map(group => String(group.family_key))]),
          name: key,
          displayName: lexicalFamilyDisplayName(latest.get(key)),
          meaning: String(latest.get(key)?.base_meaning ?? ""),
          baseWordId: latest.get(key)?.canonical_base_word_id ?? undefined,
          baseKind: latest.get(key)?.base_kind,
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
  // First find only families touching this word. The previous read fetched
  // every legacy membership, review and withdrawal on every word page.
  const [wordLegacy, wordReviews] = await Promise.all([
    read(db.from("teaching_dictionary_spelling_legacy_members")
      .select("base_word_family_id,canonical_word_id")
      .eq("row_status", "active").eq("canonical_word_id", wordId)),
    environment ? read(db.from("teaching_dictionary_base_family_member_reviews")
      .select("id,canonical_word_id,legacy_family_id,definition_id,word_skill_release_id,reviewed_at")
      .eq("environment_key", environment).eq("canonical_word_id", wordId)
      .order("reviewed_at")) : Promise.resolve([]),
  ]);
  const candidateIds = [...new Set([
    ...wordLegacy.map((row) => String(row.base_word_family_id)),
    ...wordReviews.flatMap((row) => row.legacy_family_id || row.definition_id
      ? [String(row.legacy_family_id ?? row.definition_id)] : []),
  ])];
  if (!candidateIds.length) return mergeWordFamilySummaries(registryFamilies, lexicalFamilies, [], lexicalSuccessorKeys);
  const reviewIds = wordReviews.map((row) => String(row.id));
  const releaseIds = [...new Set(wordReviews.map((row) => String(row.word_skill_release_id)))];
  const [wordWithdrawals, wordSkillWithdrawals] = await Promise.all([
    reviewIds.length ? read(db.from("teaching_dictionary_base_family_member_withdrawals")
      .select("review_id").in("review_id", reviewIds)) : Promise.resolve([]),
    releaseIds.length ? read(db.from("adle_reviewed_word_skill_withdrawals")
      .select("release_id").in("release_id", releaseIds)) : Promise.resolve([]),
  ]);
  const withdrawnWordReviews = new Set(wordWithdrawals.map((row) => String(row.review_id)));
  const withdrawnWordSkills = new Set(wordSkillWithdrawals.map((row) => String(row.release_id)));
  const activeForWord = new Set(wordLegacy.map((row) => String(row.base_word_family_id)));
  for (const row of wordReviews) {
    const id = row.legacy_family_id ?? row.definition_id;
    if (!id) continue;
    if (withdrawnWordReviews.has(row.id) || withdrawnWordSkills.has(row.word_skill_release_id)) activeForWord.delete(id);
    else activeForWord.add(id);
  }
  const familyIds = [...activeForWord];
  if (!familyIds.length) return mergeWordFamilySummaries(registryFamilies, lexicalFamilies, [], lexicalSuccessorKeys);
  const legacyIds = familyIds.filter((id) => wordLegacy.some((row) => row.base_word_family_id === id) ||
    wordReviews.some((row) => row.legacy_family_id === id));
  const definitionIds = familyIds.filter((id) => !legacyIds.includes(id));
  const [legacyMembers, legacyReviews, definitionReviews] = await Promise.all([
    legacyIds.length ? read(db.from("teaching_dictionary_spelling_legacy_members")
      .select("base_word_family_id,canonical_word_id")
      .eq("row_status", "active").in("base_word_family_id", legacyIds)) : Promise.resolve([]),
    environment && legacyIds.length ? read(db.from("teaching_dictionary_base_family_member_reviews")
      .select("id,canonical_word_id,legacy_family_id,definition_id,word_skill_release_id,reviewed_at")
      .eq("environment_key", environment).in("legacy_family_id", legacyIds)
      .order("reviewed_at")) : Promise.resolve([]),
    environment && definitionIds.length ? read(db.from("teaching_dictionary_base_family_member_reviews")
      .select("id,canonical_word_id,legacy_family_id,definition_id,word_skill_release_id,reviewed_at")
      .eq("environment_key", environment).in("definition_id", definitionIds)
      .order("reviewed_at")) : Promise.resolve([]),
  ]);
  const reviews = [...legacyReviews, ...definitionReviews].sort((a, b) =>
    String(a.reviewed_at).localeCompare(String(b.reviewed_at)) || String(a.id).localeCompare(String(b.id)));
  const allReviewIds = reviews.map((row) => String(row.id));
  const allReleaseIds = [...new Set(reviews.map((row) => String(row.word_skill_release_id)))];
  const [withdrawals, skillWithdrawals] = await Promise.all([
    allReviewIds.length ? read(db.from("teaching_dictionary_base_family_member_withdrawals")
      .select("review_id").in("review_id", allReviewIds)) : Promise.resolve([]),
    allReleaseIds.length ? read(db.from("adle_reviewed_word_skill_withdrawals")
      .select("release_id").in("release_id", allReleaseIds)) : Promise.resolve([]),
  ]);
  const withdrawn = new Set(withdrawals.map((row) => String(row.review_id)));
  const withdrawnSkills = new Set(skillWithdrawals.map((row) => String(row.release_id)));
  const members = new Map<string, Set<string>>();
  for (const row of legacyMembers) {
    const words = members.get(row.base_word_family_id) ?? new Set<string>();
    words.add(row.canonical_word_id);
    members.set(row.base_word_family_id, words);
  }
  // Latest reviewed decision wins over a legacy relationship, including a
  // withdrawal. Historical reviews remain available for mastery evidence.
  for (const row of reviews) {
    const id = row.legacy_family_id ?? row.definition_id;
    if (!id) continue;
    const words = members.get(id) ?? new Set<string>();
    if (withdrawn.has(row.id) || withdrawnSkills.has(row.word_skill_release_id)) words.delete(row.canonical_word_id);
    else words.add(row.canonical_word_id);
    members.set(id, words);
  }
  const [legacy, definitions, words] = await Promise.all([
    read(
      db
        .from("canonical_teaching_dictionary_base_word_families")
        .select("id,base_family_key,base_meaning,base_word_id")
        .in("id", familyIds)
        .eq("row_status", "active"),
    ),
    read(
      db
        .from("teaching_dictionary_base_family_definitions")
        .select("id,family_key,base_meaning,base_word_id")
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
  const adleFamilies = [...new Map([...legacy, ...definitions].map(family => [family.base_family_key ?? family.family_key, family])).values()].map((family) => ({
    name: family.base_family_key ?? family.family_key,
    displayName: familyDisplayName({ base: legacyFamilyBase(family.base_family_key ?? family.family_key), meaning: family.base_meaning }),
    meaning: family.base_meaning,
    baseWordId: family.base_word_id,
    baseKind: "free_base",
    words: [...members.get(family.id)!]
      .flatMap((id) =>
        wordById.has(id) ? [{ id, word: String(wordById.get(id)) }] : [],
      )
      .sort((a, b) => a.word.localeCompare(b.word, "en-GB")),
  }));
  return mergeWordFamilySummaries(registryFamilies, lexicalFamilies, adleFamilies, lexicalSuccessorKeys);
}
