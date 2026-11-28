import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { ROOT_REVIEW_FOCUS, focusRootForFamily, rootBreakdownIssues, type RootAuditRow } from "./root-family-audit";
import { LATIN_ROOT_SKILL } from "./root-language";
type Db = ReturnType<typeof createServiceRoleClient>;

export async function loadRootFamilyAudit(db: Db, other = false) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Root review is unavailable in this environment.");
  const [familyResult, assignmentResult, exclusionResult, decisionResult] = await Promise.all([
    db.from("teaching_dictionary_root_skill_families").select("family_key,root_text,root_word_id,root_sense_id,origin_language").eq("micro_skill_key", LATIN_ROOT_SKILL),
    db.from("teaching_dictionary_root_language_assignments").select("canonical_word_id,sense_id,family_key,root_text").eq("micro_skill_key", LATIN_ROOT_SKILL).eq("assignment_role", "family_member"),
    db.from("teaching_dictionary_bulk_review_exclusions").select("canonical_word_id").eq("environment_key", environment).eq("micro_skill_key", LATIN_ROOT_SKILL),
    db.from("teaching_dictionary_pair_latest_decisions").select("canonical_word_id,action").eq("environment_key", environment).eq("micro_skill_key", LATIN_ROOT_SKILL),
  ]);
  for (const result of [familyResult, assignmentResult, exclusionResult, decisionResult]) {
    if (result.error) throw new Error("Could not read the root-family review inventory.");
    if ((result.data?.length ?? 0) >= 1000) throw new Error("The root review inventory needs pagination.");
  }
  const families = familyResult.data!;
  const assignments = assignmentResult.data!;
  const excluded = new Set([...exclusionResult.data!.map(row => row.canonical_word_id),
    ...decisionResult.data!.filter(row => row.action === "deassign").map(row => row.canonical_word_id)]);
  const definitions = other
    ? families.filter(family => !focusRootForFamily(family.root_text)).map(family => ({ root: family.root_text, forms: [family.root_text] as readonly string[] }))
    : ROOT_REVIEW_FOCUS;
  const familyKeys = new Set(families.filter(family => definitions.some(group => group.forms.some(form => form === family.root_text))).map(family => family.family_key));
  const assignedIds = [...new Set(assignments.filter(row => familyKeys.has(row.family_key)).map(row => row.canonical_word_id))];
  const words: { id: string; display_word: string; normalised_word: string; review_status: string }[] = [];
  // Paginate the actual existing dictionary. Letter matches are deliberately
  // kept separate from reviewed family memberships in every displayed row.
  const filters = [...new Set(definitions.flatMap(group => [...group.forms]))].map(form => `normalised_word.ilike.%${form}%`);
  if (assignedIds.length) filters.push(`id.in.(${assignedIds.join(",")})`);
  if (!other || assignedIds.length) {
    for (let offset = 0; ; offset += 500) {
      let query = db.from("canonical_teaching_dictionary_words").select("id,display_word,normalised_word,review_status")
        .eq("row_status", "active").eq("dialect_code", "en-GB").order("normalised_word").order("id");
      query = other ? query.in("id", assignedIds) : query.or(filters.join(","));
      const result = await query.range(offset, offset + 499);
      if (result.error) throw new Error("Could not read existing dictionary root candidates.");
      words.push(...result.data);
      if (result.data.length < 500) break;
    }
  }
  const ids = words.map(word => word.id);
  const bundles = [] as Awaited<ReturnType<typeof loadReviewedMeaningBundles>>;
  const legacy = new Map<string, { word_sum: string; morphology_parts: unknown; morphology_joins: unknown; morphology_transformations: unknown }>();
  for (let offset = 0; offset < ids.length; offset += 150) {
    const chunk = ids.slice(offset, offset + 150);
    const [reviewed, old] = await Promise.all([
      loadReviewedMeaningBundles(db, chunk),
      db.from("canonical_teaching_dictionary_word_morphology").select("canonical_word_id,word_sum,morphology_parts,morphology_joins,morphology_transformations")
        .in("canonical_word_id", chunk).eq("row_status", "active"),
    ]);
    if (old.error) throw new Error("Could not read the spelling-level breakdowns.");
    bundles.push(...reviewed);
    for (const row of old.data ?? []) legacy.set(row.canonical_word_id, row);
  }
  const grouped = definitions.map(group => {
    const registered = families.filter(family => group.forms.some(form => form === family.root_text));
    const keys = new Set(registered.map(family => family.family_key));
    const members = assignments.filter(row => keys.has(row.family_key));
    const rows: RootAuditRow[] = [];
    for (const word of words) {
      const linkedRows = members.filter(member => member.canonical_word_id === word.id);
      if (!linkedRows.length && (other || !group.forms.some(form => word.normalised_word.includes(form)))) continue;
      const bundle = bundles.find(bundle => bundle.wordId === word.id);
      const senses = bundle?.senseSet.senses ?? [{ id: null, definition: "Meaning needs review", partOfSpeech: "" }];
      for (const sense of senses) {
        if (sense.partOfSpeech === "root") continue;
        // Do not turn root anchors with an ordinary homograph into candidates
        // merely because their spelling matches a requested root.
        if (families.some(family => family.root_word_id === word.id) && !linkedRows.some(row => row.sense_id === sense.id)) continue;
        const linked = linkedRows.some(row => row.sense_id === null || row.sense_id === sense.id);
        if (other && !linked) continue;
        const analysis = bundle?.analyses.find(analysis => analysis.senseId === sense.id);
        const old = legacy.get(word.id);
        const issues = rootBreakdownIssues({ word: word.display_word, forms: group.forms,
          familyRoots: registered.map(family => family.root_text), analysis, linked, reviewed: Boolean(bundle) });
        if (linkedRows.some(row => row.sense_id === null) && senses.length > 1)
          issues.push("The family link is word-level. Choose the intended teaching meaning.");
        if (word.review_status !== "approved_for_first_exposure") issues.push("Dictionary entry needs approval.");
        if (registered.length === 0) issues.push("No reviewed family is registered for this root yet.");
        const parts = analysis?.parts ?? (Array.isArray(old?.morphology_parts) ? old.morphology_parts : []);
        rows.push({ wordId: word.id, word: word.display_word, senseId: sense.id, meaning: sense.definition,
          partOfSpeech: sense.partOfSpeech, wordSum: analysis?.wordSum ?? old?.word_sum ?? "No breakdown recorded",
          parts: parts.map(part => `${part.surfaceText ?? part.sourceText} (${part.kind})`).join(" + "),
          source: analysis ? "Reviewed meaning" : old ? "Spelling-level facts" : "No analysis",
          linked, excluded: excluded.has(word.id), issues });
      }
    }
    rows.sort((a, b) => Number(b.issues.length > 0) - Number(a.issues.length > 0) || a.word.localeCompare(b.word) || String(a.senseId).localeCompare(String(b.senseId)));
    return { root: group.root, forms: [...group.forms], registered: registered.map(family => family.root_text), rows,
      assigned: new Set(rows.filter(row => row.linked && !row.excluded).map(row => row.wordId)).size,
      excluded: new Set(rows.filter(row => row.linked && row.excluded).map(row => row.wordId)).size };
  });
  return { groups: grouped, environment, other, words: new Set(grouped.flatMap(group => group.rows.map(row => row.wordId))).size };
}
