import { readFileSync } from "node:fs";
import { createDraftDegreeFamilies } from "../lib/adle/inflection/content";
import { auditDegreeCandidates, discoverDegreeCandidates, hunspellDiscoveryIndex, type CanonicalDegreeAuditWord } from "../lib/adle/inflection/enrichment";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { AdjectiveFamilyV1 } from "../lib/adle/inflection/contracts";

const argument = (name: string): string | null => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] ?? null; };
const dictionaryPath = argument("--dictionary");
const hunspellPath = argument("--hunspell");
const affixPath = argument("--aff");
const familiesPath = argument("--families");
const families: AdjectiveFamilyV1[] = familiesPath ? JSON.parse(readFileSync(familiesPath, "utf8")) : createDraftDegreeFamilies();
const words: CanonicalDegreeAuditWord[] = dictionaryPath ? JSON.parse(readFileSync(dictionaryPath, "utf8")) : [];
if (!Array.isArray(words) || words.some(w => !w || typeof w.canonicalWordId !== "string" || typeof w.word !== "string" || typeof w.dialect !== "string" || typeof w.active !== "boolean" || typeof w.approved !== "boolean" || typeof w.adjectiveVerified !== "boolean")) throw new Error("dictionary_input_must_be_explicit_audit_words");
const lexicon = hunspellPath ? hunspellDiscoveryIndex(readFileSync(hunspellPath, "utf8"), affixPath ? readFileSync(affixPath, "utf8") : undefined) : { attested: new Set<string>(), bothDegreeFlags: [] };
const report = auditDegreeCandidates(families, words, lexicon.attested);
console.log(JSON.stringify({ schemaVersion: 1, routeStatus: "inactive", source: dictionaryPath ? "supplied_read_only_inventory" : "no_live_dictionary_inventory",
  dictionaryWordCount: words.length, bothDegreeFlagCandidateCount: lexicon.bothDegreeFlags.length,
  dictionaryFingerprint: fingerprintSnapshotValue(words), candidateFingerprint: fingerprintSnapshotValue(families),
  ...(process.argv.includes("--summary") ? { families: families.map(f => ({ familyKey: f.familyKey, microSkillKey: f.microSkillKey, words: f.words.map(w => w.word) })), report } : { families, report, bulkDiscovery: discoverDegreeCandidates(words, lexicon), additionalFlagCandidates: lexicon.bothDegreeFlags }),
  limitations: ["Flags and exact word attestation are candidate facts, not grammar approval.", "Unresolved lexical eligibility, IDs, sources and teaching content require review.", "No database writes, learner intakes or route activation."] }, null, 2));
