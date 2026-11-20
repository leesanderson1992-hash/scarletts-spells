import "server-only";
import { loadActiveCanonicalHomophoneContent, homophoneCanonicalPublishingEnabled } from "./homophone-canonical-release";
import { homophoneBindingIsCurrent, homophoneReadyNote } from "./homophone-review-status";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { homophoneCanonicalPartOfSpeech, homophoneReviewRoute, homophoneReviewSpec, homophoneReviewWords } from "./homophone-review-contract";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { loadLessonReviewRequests } from "./lesson-review-requests";
import { loadLessonReadiness } from "./lesson-preflight";
import { evaluateLessonCandidate } from "./lesson-candidate";
import { targetOccurrences } from "./authoring";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import type { DictionarySense } from "./senses";

type Db = ReturnType<typeof createServiceRoleClient>;
type Member = { set_key: string; revision: number; canonical_word_id: string; intended_sense: string;
  grammatical_role: string; target_sentence: string };
const normal = (text: string) => text.trim().toLowerCase().replaceAll("’", "'").replace(/[.!]$/u, "");

/** Read the reviewed database roster; a catalogue label is not a word assignment. */
export async function loadHomophoneReviewRoster(db: Db, skill: string) {
  const spec = homophoneReviewSpec(skill);
  if (!spec) throw new Error("This homophone lesson is not in the organised roster.");
  const sets = await db.from("homophone_contrast_sets").select("set_key,revision,review_status")
    .eq("micro_skill_key", skill).order("revision", {ascending: false});
  if (sets.error) throw new Error("Could not read the reviewed contrast sets.");
  const latest = new Map<string, NonNullable<typeof sets.data>[number]>();
  for (const set of sets.data ?? []) if (!latest.has(set.set_key)) latest.set(set.set_key, set);
  const approved = [...latest.values()].filter(set => set.review_status === "approved");
  const members = approved.length ? await db.from("homophone_contrast_set_members")
    .select("set_key,revision,canonical_word_id,intended_sense,grammatical_role,target_sentence")
    .in("set_key", approved.map(set => set.set_key)).order("set_key").order("member_ordinal") : {data: [], error: null};
  if (members.error) throw new Error("Could not read the contrast-set words.");
  const selected = (members.data ?? []).filter(member => latest.get(member.set_key)?.revision === member.revision) as Member[];
  const words = selected.length ? await db.from("canonical_teaching_dictionary_words")
    .select("id,display_word,normalised_word").in("id", [...new Set(selected.map(member => member.canonical_word_id))])
    .eq("row_status", "active").eq("dialect_code", "en-GB") : {data: [], error: null};
  if (words.error) throw new Error("Could not read the contrast-set dictionary entries.");
  const expected = new Set(homophoneReviewWords(skill));
  if (words.data?.some(word => !expected.has(normal(word.normalised_word)))
    || [...expected].some(word => !words.data?.some(row => normal(row.normalised_word) === normal(word))))
    throw new Error("The reviewed contrast sets do not match this lesson’s organised roster. Review the group before assigning words.");
  return {spec, members: selected, words: words.data ?? []};
}

export function homophoneReviewCandidate(bundle: MultiSenseCsvBundle | undefined, skill: string, senseId: string | undefined, word?: {wordId: string; displayWord: string}) {
  const analysis = bundle?.analyses.find(row => row.senseId === senseId);
  return evaluateLessonCandidate({wordId: bundle?.wordId ?? word?.wordId ?? "", displayWord: bundle?.displayWord ?? word?.displayWord ?? "",
    skillKey: skill, senseId, senseSet: bundle?.senseSet ?? null,
    morphology: analysis ? {parts: analysis.parts, joins: analysis.joins, wordSum: analysis.wordSum,
      analysisStatus: "approved", reviewStatus: "approved_for_first_exposure"} : null, familyLinks: []});
}

/** Preserve every reviewed sense. Curated lesson meanings are prefill, never approvals. */
export function prefillHomophoneBundle(word: {id: string; display_word: string}, members: Member[], reviewed?: MultiSenseCsvBundle): MultiSenseCsvBundle {
  if (reviewed) return reviewed;
  const selected = members.filter(member => member.canonical_word_id === word.id);
  const seen = new Set<string>();
  const senses: DictionarySense[] = selected.flatMap(member => {
    const key = normal(member.intended_sense) + ":" + member.grammatical_role;
    if (seen.has(key)) return []; seen.add(key);
    const positions = targetOccurrences(member.target_sentence, word.display_word);
    return [{id: `homophone-${member.set_key.toLowerCase()}-${seen.size}`, definition: member.intended_sense,
      partOfSpeech: homophoneCanonicalPartOfSpeech(member.grammatical_role), pronunciationId: "british",
      dictationSentence: member.target_sentence, dictationTargetTokenIndex: positions.length === 1 ? positions[0] : undefined}];
  });
  if (!senses.length) senses.push({id: "review", definition: "", partOfSpeech: "", pronunciationId: "british"});
  return {wordId: word.id, displayWord: word.display_word, sourceSenseReviewedAt: "", analyses: [],
    senseSet: {senses, pronunciations: [{id: "british", ipa: "", spokenSyllableCount: null, stressPattern: ""}]}};
}

export async function loadHomophoneBulkReview(db: Db, skill: string, includeBundles = false) {
  const routeId = homophoneReviewRoute(skill)!;
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) throw new Error("Dictionary review environment is unavailable.");
  const [roster, requests, [lesson]] = await Promise.all([
    loadHomophoneReviewRoster(db, skill), loadLessonReviewRequests(db, skill),
    loadLessonReadiness({routeId, microSkillKey: skill}),
  ]);
  if (!lesson) throw new Error("The homophone lesson is not registered.");
  const rosterIds = new Set(roster.words.map(word => word.id));
  const extraIds = [...requests.keys()].filter(id => !rosterIds.has(id));
  const extras = extraIds.length ? await db.from("canonical_teaching_dictionary_words").select("id,display_word,normalised_word")
    .in("id", extraIds).eq("row_status", "active") : {data: [], error: null};
  if (extras.error) throw new Error("Could not read the assigned words outside this contrast-set roster.");
  const allWords = [...roster.words, ...(extras.data ?? [])];
  const ids = allWords.map(word => word.id);
  const [reviewed, bindings] = await Promise.all([
    loadReviewedMeaningBundles(db, ids), db.from("teaching_dictionary_effective_lesson_sense_bindings")
      .select("canonical_word_id,sense_id,sense_snapshot,pronunciation_snapshot").eq("environment_key", environment).eq("micro_skill_key", skill).in("canonical_word_id", ids),
  ]);
  if (bindings.error) throw new Error("Could not read the lesson’s reviewed meaning choices.");
  let publishedCanonical: Awaited<ReturnType<typeof loadActiveCanonicalHomophoneContent>> = null;
  try { publishedCanonical = await loadActiveCanonicalHomophoneContent(db, skill); } catch { /* Changed facts stay in review. */ }
  const publishedMembers = publishedCanonical?.sets.flatMap(set => set.members);
  const current = lesson.activationEnabled && lesson.compilerReady ? roster.words.filter(word => !publishedMembers || publishedMembers.some(member => member.canonicalWordId === word.id)).map(word => {
    const member = roster.members.find(member => member.canonical_word_id === word.id)!;
    return {canonicalWordId: word.id, word: word.display_word, base: "", meaning: publishedMembers?.find(row => row.canonicalWordId === word.id)?.intendedSense ?? member.intended_sense, dictationSentence: publishedMembers?.find(row => row.canonicalWordId === word.id)?.teachingSentence ?? member.target_sentence};
  }) : [];
  const active = new Set(current.map(word => word.canonicalWordId));
  const facts = new Map(allWords.map(word => {
    const bundle = reviewed.find(bundle => bundle.wordId === word.id);
    const bound = bindings.data.filter(binding => binding.canonical_word_id === word.id);
    const requested = requests.get(word.id)?.sense_id;
    const senseId = requested ?? (bound.length === 1 ? bound[0].sense_id : bundle?.senseSet.senses.length === 1 ? bundle.senseSet.senses[0].id : undefined);
    const verdict = homophoneReviewCandidate(bundle, skill, senseId, {wordId: word.id, displayWord: word.display_word});
    const sense = bundle?.senseSet.senses.find(sense => sense.id === senseId);
    const pronunciation = bundle?.senseSet.pronunciations.find(item => item.id === sense?.pronunciationId) ?? null;
    const isBound = bound.some(binding => homophoneBindingIsCurrent(sense, pronunciation, binding));
    return [word.id, {bundle, verdict, sense, isBound}] as const;
  }));
  const rows = allWords.flatMap(word => {
    const {bundle, verdict, sense, isBound} = facts.get(word.id)!;
    const contentMatches = sense && (publishedMembers ? publishedMembers.some(member => member.canonicalWordId === word.id
      && member.intendedSense === sense.definition && member.teachingSentence === sense.dictationSentence
      && member.grammaticalRole === sense.partOfSpeech) : roster.members.some(member => member.canonical_word_id === word.id
      && normal(member.intended_sense) === normal(sense.definition) && member.target_sentence === sense.dictationSentence
      && homophoneCanonicalPartOfSpeech(member.grammatical_role) === sense.partOfSpeech));
    if (active.has(word.id) && verdict.status === "ready" && isBound && contentMatches) return [];
    const notes = bundle ? verdict.issues.map(issue => issue.message)
      : ["Review and approve the meaning, pronunciation, dictation and word parts on the word page or in the workbook."];
    if (verdict.status === "ready") {
      if (!isBound) notes.push("The Dictionary facts are approved. Approve this meaning for the lesson in the word page’s Micro-skills section, or use Yes under Use in lesson in the workbook.");
      else if (homophoneCanonicalPublishingEnabled(skill)) {
        const setKeys = new Set(roster.members.filter(member => member.canonical_word_id === word.id).map(member => member.set_key));
        const partners = roster.members.filter(member => setKeys.has(member.set_key) && member.canonical_word_id !== word.id)
          .filter(member => {const fact = facts.get(member.canonical_word_id); return fact?.verdict.status !== "ready" || !fact.isBound;})
          .map(member => roster.words.find(row => row.id === member.canonical_word_id)!.display_word);
        notes.push(homophoneReadyNote([...new Set(partners)]));
      } else notes.push(!contentMatches ? "Canonical facts are approved. The contrast-set meaning or sentence needs a lesson content update." : "The lesson release is not Active yet.");
    }
    return [{id: word.id, word: word.display_word, href: `/admin/teaching-dictionary/${word.id}#td-overview`,
      note: [active.has(word.id) ? "In the live lesson pool; canonical review is separate." : "", ...notes].filter(Boolean).join(" ")}];
  }).sort((a,b) => a.word.localeCompare(b.word,"en-GB"));
  return {current, rows, routeId, skill, title: roster.spec.description,
    bundles: includeBundles ? rows.map(row => prefillHomophoneBundle(allWords.find(word => word.id === row.id)!, roster.members,
      reviewed.find(bundle => bundle.wordId === row.id))) : []};
}
