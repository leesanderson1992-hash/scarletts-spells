import { notFound } from "next/navigation";

import morphemeCatalog from "@/data/adle/approved/d4-mor/v1/d4-mor-v1-morpheme-catalog.json";
import wordAnalyses from "@/data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json";
import pilotFixture from "@/data/adle/approved/d4-mor/v1/d4-mor-prefixes-un-pilot-source-fixture.json";
import { MorphologyPrimitivesPreview } from "./morphology-primitives-preview";
import {
  toMeaningFlipViewModel,
  toMorphemeGlossCardViewModel,
  toMorphologyDiffViewModel,
  toMorphologySequenceViewModel,
  toRootArtifactCardViewModel,
  toWordFamilyViewModel,
  toWordSplitViewModel,
  type ApprovedMorphemeRecord,
  type ApprovedRootArtifactRecord,
  type ApprovedWordAnalysisRecord,
} from "@/lib/adle/ui/morphology-primitives";
import { compileMorphologyUnPilotPayload } from "@/lib/adle/morphology/payload";

type WordAnalysesPackage = {
  wordAnalyses: ApprovedWordAnalysisRecord[];
};

type MorphemeCatalogPackage = {
  morphemes: ApprovedMorphemeRecord[];
  rootArtifacts: ApprovedRootArtifactRecord[];
};

type PilotFixture = {
  anchorAnalysis: ApprovedWordAnalysisRecord;
  approvedAvailableWordAnalyses: ApprovedWordAnalysisRecord[];
};

const PREVIEW_WORDS = [
  "unhappy",
  "misspell",
  "famous",
  "ice cream",
  "mother-in-law",
  "thermometer",
  "telephone",
  "transport",
  "unnecessary",
] as const;

export default function MorphologyPrimitivesDevPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const approvedWords = wordAnalyses as WordAnalysesPackage;
  const catalog = morphemeCatalog as MorphemeCatalogPackage;
  const pilot = pilotFixture as PilotFixture;
  const selectedRecords = PREVIEW_WORDS.map((word) => findAnalysis(approvedWords.wordAnalyses, word));
  const sequences = selectedRecords.map(toMorphologySequenceViewModel);
  const pilotSequence = toMorphologySequenceViewModel(pilot.anchorAnalysis);
  const prefixUn = findMorpheme(catalog.morphemes, "prefix_UN");
  const rootTele = findMorpheme(catalog.morphemes, "root_TELE");
  const rootArtifact = findRootArtifact(catalog.rootArtifacts, "ROOT_TELE");
  const telephone = findAnalysis(approvedWords.wordAnalyses, "telephone");
  const pilotIds = Object.fromEntries(
    pilot.approvedAvailableWordAnalyses.map((analysis) => [analysis.displayWord, `dev-${analysis.displayWord}`]),
  );

  return (
    <MorphologyPrimitivesPreview
      pilotSequence={pilotSequence}
      sequences={sequences}
      splits={selectedRecords.slice(0, 5).map(toWordSplitViewModel)}
      meaningFlip={toMeaningFlipViewModel(pilot.anchorAnalysis)}
      glossCards={[toMorphemeGlossCardViewModel(prefixUn), toMorphemeGlossCardViewModel(rootTele)]}
      rootArtifact={toRootArtifactCardViewModel(rootArtifact)}
      family={toWordFamilyViewModel({ morpheme: rootTele, anchorWord: telephone.displayWord })}
      diff={toMorphologyDiffViewModel({
        record: findAnalysis(approvedWords.wordAnalyses, "misspell"),
        attemptedWord: "mispell",
        notes: ["Post-submit only", "Shows the approved morpheme grouping without deciding evidence"],
      })}
      guidedPayload={compileMorphologyUnPilotPayload(pilotIds)}
    />
  );
}

function findAnalysis(records: readonly ApprovedWordAnalysisRecord[], displayWord: string): ApprovedWordAnalysisRecord {
  const record = records.find((candidate) => candidate.displayWord === displayWord);
  if (!record) {
    throw new Error(`Missing approved D4_MOR analysis for ${displayWord}`);
  }
  return record;
}

function findMorpheme(records: readonly ApprovedMorphemeRecord[], morphemeKey: string): ApprovedMorphemeRecord {
  const record = records.find((candidate) => candidate.morphemeKey === morphemeKey);
  if (!record) {
    throw new Error(`Missing approved D4_MOR morpheme ${morphemeKey}`);
  }
  return record;
}

function findRootArtifact(
  records: readonly ApprovedRootArtifactRecord[],
  rootArtifactKey: string,
): ApprovedRootArtifactRecord {
  const record = records.find((candidate) => candidate.rootArtifactKey === rootArtifactKey);
  if (!record) {
    throw new Error(`Missing approved D4_MOR root artifact ${rootArtifactKey}`);
  }
  return record;
}
