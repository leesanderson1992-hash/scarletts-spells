import type { OverviewFamilySelection } from "./overview-csv";

export type OverviewMembership = { canonical_word_id: string; family_key: string; revision: number };
export type OverviewFamily = { family_key: string; revision: number; base_kind: string;
  base_lemma: string; base_meaning: string; base_part_of_speech: string; review_status: string };
export type OverviewRoot = { family_key: string; revision: number; root_definition: string | null;
  origin_language: string | null; pronunciation_applicability: string | null;
  pronunciation_ipa: string | null };

/** Resolve each word against only its own latest approved family memberships. */
export function selectOverviewFamilies(ids: readonly string[], members: readonly OverviewMembership[],
  latest: ReadonlyMap<string, OverviewFamily>, roots: ReadonlyMap<string, OverviewRoot>,
  historical: ReadonlySet<string>): Map<string, OverviewFamilySelection> {
  const byWord = new Map<string, OverviewMembership[]>();
  for (const member of members) {
    if (!byWord.has(member.canonical_word_id)) byWord.set(member.canonical_word_id, []);
    byWord.get(member.canonical_word_id)!.push(member);
  }
  const selections = new Map<string, OverviewFamilySelection>();
  for (const id of ids) {
    const current = (byWord.get(id) ?? []).filter((member) => {
      const family = latest.get(member.family_key);
      return family?.revision === member.revision && family.review_status === "approved";
    });
    const unique = [...new Set(current.map((member) => member.family_key))];
    if (unique.length > 1) {
      selections.set(id, { kind: "free_base", familyKey: "", basePartOfSpeech: "",
        reviewIssue: "Multiple current families: select one in Overview" });
      continue;
    }
    if (!unique.length) {
      if (historical.has(id)) selections.set(id, { kind: "free_base", familyKey: "",
        basePartOfSpeech: "", reviewIssue: "Historical family link: select an approved family in Overview" });
      continue;
    }
    const family = latest.get(unique[0]!)!;
    if (family.base_kind !== "free_base" && family.base_kind !== "bound_root") {
      selections.set(id, { kind: "free_base", familyKey: "", basePartOfSpeech: "",
        reviewIssue: "Unrecognised family kind: review in Overview" });
      continue;
    }
    const root = roots.get(`${family.family_key}:${family.revision}`);
    selections.set(id, { kind: family.base_kind, familyKey: family.family_key, revision: family.revision,
      basePartOfSpeech: family.base_part_of_speech, baseLemma: family.base_lemma,
      baseMeaning: family.base_meaning,
      ...(family.base_kind === "bound_root" ? {
        rootDefinition: root?.root_definition ?? "",
        rootOriginLanguage: root?.origin_language ?? "",
        rootPronunciationApplicability: root?.pronunciation_applicability ?? "",
        rootPronunciationIpa: root?.pronunciation_ipa ?? "",
        ...(!root ? { reviewIssue: "Bound-root metadata is missing: review in Overview" } : {}),
      } : {}),
    });
  }
  return selections;
}
