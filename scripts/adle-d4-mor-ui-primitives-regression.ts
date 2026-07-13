import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  toMorphemeGlossCardViewModel,
  toMorphologySequenceViewModel,
  toRootArtifactCardViewModel,
  type ApprovedMorphemeRecord,
  type ApprovedRootArtifactRecord,
  type ApprovedWordAnalysisRecord,
} from "../lib/adle/ui/morphology-primitives";

type WordAnalysesPackage = {
  wordAnalyses: ApprovedWordAnalysisRecord[];
};

type MorphemeCatalogPackage = {
  morphemes: ApprovedMorphemeRecord[];
  rootArtifacts: ApprovedRootArtifactRecord[];
};

const dataDir = join(process.cwd(), "data", "adle", "approved", "d4-mor", "v1");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(dataDir, fileName), "utf8")) as T;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function analysis(records: readonly ApprovedWordAnalysisRecord[], displayWord: string): ApprovedWordAnalysisRecord {
  const record = records.find((candidate) => candidate.displayWord === displayWord);
  if (record === undefined) {
    throw new Error(`Expected approved analysis for ${displayWord}`);
  }
  return record;
}

function morpheme(records: readonly ApprovedMorphemeRecord[], key: string): ApprovedMorphemeRecord {
  const record = records.find((candidate) => candidate.morphemeKey === key);
  if (record === undefined) {
    throw new Error(`Expected morpheme ${key}`);
  }
  return record;
}

function rootArtifact(records: readonly ApprovedRootArtifactRecord[], key: string): ApprovedRootArtifactRecord {
  const record = records.find((candidate) => candidate.rootArtifactKey === key);
  if (record === undefined) {
    throw new Error(`Expected root artifact ${key}`);
  }
  return record;
}

const wordPackage = readJson<WordAnalysesPackage>("d4-mor-v1-word-analyses.json");
const catalogPackage = readJson<MorphemeCatalogPackage>("d4-mor-v1-morpheme-catalog.json");

const unhappy = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "unhappy"));
assert(unhappy.parts[0].kind === "prefix", "unhappy keeps prefix part kind");
assert(unhappy.parts[1].kind === "base", "unhappy keeps base part kind");
assert(unhappy.joins[0].joinType === "none", "unhappy keeps explicit no-separator join");

const misspell = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "misspell"));
assert(misspell.displayWord === "misspell", "misspell display word is approved source text");
assert(misspell.parts.map((part) => part.sourceText).join("|") === "mis|spell", "misspell boundary is not guessed");

const famous = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "famous"));
assert(famous.transformations[0]?.type === "drop_final_e", "famous retains drop_final_e transformation");
assert(famous.parts[0].sourceText === "fame", "famous keeps source form fame");
assert(famous.parts[0].surfaceText === "fam", "famous keeps approved surface form fam");

const iceCream = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "ice cream"));
assert(iceCream.joins[0].joinType === "space", "ice cream keeps explicit space join");

const motherInLaw = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "mother-in-law"));
assert(motherInLaw.parts.length === 3, "mother-in-law keeps three semantic parts");
assert(motherInLaw.joins.every((joinRecord) => joinRecord.joinType === "hyphen"), "mother-in-law keeps hyphens");

const thermometer = toMorphologySequenceViewModel(analysis(wordPackage.wordAnalyses, "thermometer"));
assert(thermometer.parts.length === 3, "thermometer keeps three-part construction");
assert(thermometer.parts[1].text === "o", "thermometer keeps connector surface letter");

const prefixUn = toMorphemeGlossCardViewModel(morpheme(catalogPackage.morphemes, "prefix_UN"));
assert(prefixUn.kind === "prefix", "prefix_UN gloss card keeps prefix kind");
assert(prefixUn.examples.includes("unhappy"), "prefix_UN examples are approved source examples");

const teleArtifact = toRootArtifactCardViewModel(rootArtifact(catalogPackage.rootArtifacts, "ROOT_TELE"));
assert(teleArtifact.rootText === "tele", "ROOT_TELE artifact maps root text");
assert(teleArtifact.descendantWords.includes("telephone"), "ROOT_TELE descendants are retained");

let unsupportedFailedClosed = false;
try {
  toMorphologySequenceViewModel({
    ...analysis(wordPackage.wordAnalyses, "unhappy"),
    parts: [{ ...analysis(wordPackage.wordAnalyses, "unhappy").parts[0], kind: "unknown_kind" }],
  });
} catch {
  unsupportedFailedClosed = true;
}
assert(unsupportedFailedClosed, "unsupported part kinds fail closed");

console.log(
  "ADLE D4_MOR UI primitives regression passed",
  JSON.stringify({
    representativeCases: [
      "unhappy",
      "misspell",
      "famous",
      "ice cream",
      "mother-in-law",
      "thermometer",
      "ROOT_TELE",
    ],
  }),
);
