import { latinRootWordBlocker, type CanonicalLatinRootFamily, type CanonicalLatinRootWord } from "@/lib/adle/morphology/latin-root-word-facts";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
export const LATIN_ROOT_REVIEW_SKILL = "D4_MOR_ROOTS_COMMON_LATIN_ROOTS";
export const isLatinRootReviewSkill = (skill: unknown): skill is typeof LATIN_ROOT_REVIEW_SKILL => skill === LATIN_ROOT_REVIEW_SKILL;
export const LATIN_ROOT_REVIEW_ROUTE = "latin_root_word_lab";
export function latinRootReviewIssues(bundle: MultiSenseCsvBundle | undefined, senseId: string | undefined,
  families: readonly CanonicalLatinRootFamily[]): string[] {
  if (!bundle) return ["Review this word's meaning, British pronunciation and word parts."];
  const sense = bundle.senseSet.senses.find(s=>s.id===senseId);
  if (!sense) return ["Choose one reviewed teaching meaning for this word."];
  if(sense.partOfSpeech==="root")return ["A root-only teaching entry cannot be a spelling target."];
  const analysis = bundle.analyses.find(a=>a.senseId===senseId);
  if(!analysis)return ["Approve the word parts for this meaning."];
  const family = families.find(f=>f.familyKey===analysis.familyKey || analysis.familyLinks?.some(link=>link.familyKey===f.familyKey));
  if(!family)return ["Choose an approved Latin or Latin-derived root family. Greek and free-base families cannot be assigned here."];
  const link=analysis.familyLinks?.find(l=>l.familyKey===family.familyKey);
  const pronunciation=bundle.senseSet.pronunciations.find(p=>p.id===sense.pronunciationId);
  const facts:CanonicalLatinRootWord={canonicalWordId:bundle.wordId,spelling:bundle.displayWord,familyKey:family.familyKey,
    senseId:sense.id,definition:sense.definition,partOfSpeech:sense.partOfSpeech,ipa:pronunciation?.ipa??"",
    sentence:sense.dictationSentence??"",targetTokenIndex:sense.dictationTargetTokenIndex??-1,
    reviewStatus:"approved_for_first_exposure",reviewedAt:bundle.sourceSenseReviewedAt,morphologyId:"reviewed",
    componentPartId:link?.componentPartId??analysis.componentPartId,wordSum:analysis.wordSum,
    parts:analysis.parts as CanonicalLatinRootWord["parts"],joins:analysis.joins,transformations:analysis.transformations};
  const blocker=latinRootWordBlocker(facts,family);
  const messages:Record<string,string>={root_family_not_approved_latin:"The selected family needs an approved Latin origin.",
    word_meaning_or_parts_not_reviewed:"Approve this meaning and its word parts.",meaning_sentence_target_invalid:"Add a full dictation sentence containing this word once and set its exact position.",
    word_definition_pronunciation_or_sum_missing:"Complete the meaning, British IPA and word sum.",
    unsupported_or_incomplete_reviewed_word_parts:"Review the explicit root, prefix/suffix meanings and spelling. This lesson currently needs unchanged, joined word parts.",
    reviewed_root_component_mismatch:"The linked component must be the family's explicit root. Preserve existing Base analyses; review nested roots or alternate root forms separately.",
    reviewed_word_joins_invalid:"Review the joins between each word part."};
  const issues=blocker?[messages[blocker]??blocker]:[];
  if(!pronunciation?.spokenSyllableCount||!pronunciation.stressPattern?.trim())issues.push("Complete British spoken syllable count and stress.");
  return issues;
}

export function latinRootSpellingReviewEligible(bundle:MultiSenseCsvBundle,families:readonly CanonicalLatinRootFamily[],ordinaryMemberIds:ReadonlySet<string>):boolean{
  return !bundle.senseSet.senses.every(s=>s.partOfSpeech==="root")&&(!families.some(f=>f.rootWordId===bundle.wordId)||ordinaryMemberIds.has(bundle.wordId));
}
