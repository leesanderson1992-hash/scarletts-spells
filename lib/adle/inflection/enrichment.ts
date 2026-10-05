import { adjectiveFamilyBlockers, type AdjectiveFamilyV1 } from "./contracts";

export interface CanonicalDegreeAuditWord { canonicalWordId: string; word: string; dialect: string; active: boolean; approved: boolean; adjectiveVerified: boolean }
export interface DegreeCandidateAudit {
  familyKey: string;
  base: string;
  microSkillKey: string;
  status: "approved" | "ready_for_review" | "missing_forms_or_content" | "ambiguous" | "incompatible";
  canonicalIds: Record<string, string | null>;
  missingForms: string[];
  lexicalAttestation: Record<string, boolean>;
  blockers: string[];
}
/** Bulk discovery deliberately holds unknown POS, gradability and phonology. */
export function discoverDegreeCandidates(dictionary: readonly CanonicalDegreeAuditWord[], lexicon: ReturnType<typeof hunspellDiscoveryIndex>) {
  const bases = new Set([...dictionary.filter(w => w.active && w.dialect === "en-GB" && w.adjectiveVerified).map(w => w.word), ...lexicon.bothDegreeFlags]);
  return [...bases].sort().map(base => {
    const rule = base.endsWith("e") ? "drop_e" : /[^aeiou]y$/.test(base) ? "y_to_i" : "regular";
    const stem = rule === "drop_e" ? base.slice(0, -1) : rule === "y_to_i" ? `${base.slice(0, -1)}i` : base;
    const proposals = [{ rule, forms: [base, `${stem}er`, `${stem}est`] }];
    if (/[aeiou][b-df-hj-np-tv-z]$/.test(base) && !/[wxy]$/.test(base)) proposals.push({ rule: "double_final_consonant", forms: [base, `${base}${base.at(-1)}er`, `${base}${base.at(-1)}est`] });
    return { base, status: "requires_review", proposals: proposals.map(p => ({ ...p, explicitAttestation: p.forms.map(w => lexicon.attested.has(w)), canonicalMatches: p.forms.map(w => dictionary.filter(x => x.word === w && x.dialect === "en-GB" && x.active).map(x => x.canonicalWordId)) })), holds: ["adjective_sense_gradability_er_est_eligibility_and_child_suitability", ...(proposals.length > 1 ? ["one_syllable_short_vowel_verification"] : [])] };
  });
}
/** Flags can propose candidates, but exact attestation still cannot grant grammar eligibility. */
export function hunspellDiscoveryIndex(dictionary: string, affix?: string): { attested: Set<string>; bothDegreeFlags: string[] } {
  const attested = new Set<string>();
  const bothDegreeFlags: string[] = [];
  const suffixRules = affix?.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts[0] === "SFX" && ["R", "T"].includes(parts[1]) && parts.length >= 5) ?? [];
  for (const line of dictionary.split(/\r?\n/).slice(1)) {
    const token = line.trim().split(/\s/)[0];
    const slash = token.indexOf("/");
    const word = slash < 0 ? token : token.slice(0, slash);
    const flags = slash < 0 ? "" : token.slice(slash + 1);
    if (!/^[a-z]+$/.test(word)) continue;
    attested.add(word);
    // The supplied .aff file is the spelling authority for expansion. These
    // generated spellings still say nothing about POS, gradability or suitability.
    for (const [, flag, strip, add, condition] of suffixRules) {
      if (flags.includes(flag) && new RegExp(`${condition}$`).test(word) && (strip === "0" || word.endsWith(strip))) {
        const stem = strip === "0" ? word : word.slice(0, -strip.length);
        attested.add(stem + (add === "0" ? "" : add));
      }
    }
    if (flags.includes("R") && flags.includes("T")) bothDegreeFlags.push(word);
  }
  return { attested, bothDegreeFlags: [...new Set(bothDegreeFlags)].sort() };
}
export function auditDegreeCandidates(families: readonly AdjectiveFamilyV1[], dictionary: readonly CanonicalDegreeAuditWord[], attested: ReadonlySet<string>): DegreeCandidateAudit[] {
  return families.map(family => {
    const canonicalIds: Record<string, string | null> = {};
    const missingForms: string[] = [];
    const blockers = adjectiveFamilyBlockers(family);
    let ambiguous = false;
    let eligible = true;
    for (const word of family.words) {
      const matches = dictionary.filter(w => w.word === word.word && w.dialect === "en-GB" && w.active);
      if (matches.length > 1) ambiguous = true;
      canonicalIds[word.word] = matches.length === 1 ? matches[0].canonicalWordId : null;
      if (matches.length === 0) missingForms.push(word.word);
      if (matches.some(w => !w.approved)) blockers.push(`canonical_word_unapproved:${word.word}`);
      if (matches.length === 1 && word.canonicalWordId !== matches[0].canonicalWordId) blockers.push(`canonical_binding_unresolved:${word.word}`);
      if (!attested.has(word.word)) blockers.push(`lexical_attestation_missing:${word.word}`);
      if (word.degree === "base" && !matches.some(w => w.adjectiveVerified)) eligible = false;
    }
    if (!eligible) blockers.push("adjective_use_requires_review");
    const incompatible = family.reviewStatus === "rejected";
    return { familyKey: family.familyKey, base: family.words[0].word, microSkillKey: family.microSkillKey,
      status: incompatible ? "incompatible" : ambiguous ? "ambiguous" : missingForms.length || blockers.some(b => /content|dictation|question|transformation/.test(b)) ? "missing_forms_or_content" : blockers.length ? "ready_for_review" : "approved",
      canonicalIds, missingForms, lexicalAttestation: Object.fromEntries(family.words.map(w => [w.word, attested.has(w.word)])), blockers: [...new Set(blockers)] };
  });
}
