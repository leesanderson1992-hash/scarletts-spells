export type DynamicPrefixSplitPart = {
  id: string;
  kind: string;
  sourceText: string;
  surfaceText: string;
  gloss?: string;
  displayRange: { start: number; end: number };
};

export type ReviewedDynamicPrefixWord = {
  wordKey: string;
  word: string;
  microSkillKey: string;
  canonical: {
    dialect: string;
    frequencyBand: string;
    ageBand: string;
    complexityBand: string;
  };
  trueMorphology: {
    humanApprovedText: string;
    transformationNotes: string;
  };
  teaching: {
    splitParts: DynamicPrefixSplitPart[];
    splitJoins: Array<{
      afterPartId: string;
      beforePartId: string;
      joinType: "none" | "space" | "hyphen";
    }>;
    prefixVariant: string;
    cleaverBoundary: number;
    baseOrRoot: string;
    baseMeaning: string;
    childFriendlyMeaning: string;
    meaningBin: string;
  };
  pronunciation: {
    ipa: string;
    syllables: number;
    stressPattern: string;
    hasSchwa: boolean;
  };
  complexityPreview: {
    inputComplete: boolean;
    structuralScore: number;
    complexityLevel: number;
  };
  dictation: {
    sentence: string;
    targetTokenIndex: number;
    audioText: string;
  };
};

export type ReviewedDynamicPrefixProfile = {
  label: string;
  text: string;
  meaning: string;
  bins: Array<[string, string, string]>;
  choices: string[];
  reflection: string;
};

export type ReviewedDynamicPrefixPackage = {
  packageKey: string;
  activation: Record<string, boolean>;
  profiles: Record<string, ReviewedDynamicPrefixProfile>;
  words: ReviewedDynamicPrefixWord[];
};

export type DynamicPrefixCorrectionPackage = {
  packageKey: string;
  profileKey: string;
  environment: string;
  targetProjectRef?: string;
  activation: Record<string, boolean>;
  basePackage: { sha256: string };
  profile: {
    introContent: {
      title: string;
      paragraphs: string[];
      examples?: Array<{
        prefix: string;
        prefixMeaning?: string;
        base: string;
        word: string;
        meaning: string;
      }>;
    };
    meaningBins: Array<{ id: string; label: string; description: string }>;
    prefixChoices: string[];
    reflection: string;
  };
  words: string[];
};
