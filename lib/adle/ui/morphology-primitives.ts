export type MorphologyPartKind = "prefix" | "base" | "root" | "suffix" | "connector";

export type MorphologyJoinType = "none" | "space" | "hyphen";

export type MorphologyTransformationType =
  | "drop_final_e"
  | "preserve_base"
  | "insert_connector"
  | "insert_space"
  | "insert_hyphen"
  | "root_variant"
  | "other_reviewed";

export type MorphologyRevealMode = "teaching" | "guided" | "post_submit" | "recall_neutral";

export type MorphologyTileState = "none" | "changed" | "removed" | "inserted";

export interface ApprovedMorphologyDisplayRange {
  start: number;
  end: number;
}

export interface ApprovedMorphologyPart {
  id: string;
  kind: string;
  morphemeKey: string | null;
  sourceText: string;
  surfaceText: string;
  gloss: string;
  displayRange: ApprovedMorphologyDisplayRange;
}

export interface ApprovedMorphologyJoin {
  afterPartId: string;
  beforePartId: string;
  joinType: string;
  surfaceText: string;
  displayRange: ApprovedMorphologyDisplayRange;
}

export interface ApprovedMorphologyTransformation {
  transformationKey: string;
  type: string;
  sourcePartId: string;
  sourceText: string;
  surfaceText: string;
  explanation: string;
  humanConfirmationRequired?: boolean;
}

export interface ApprovedWordAnalysisRecord {
  analysisKey: string;
  microSkillKey: string;
  displayWord: string;
  role?: string;
  parts: ApprovedMorphologyPart[];
  joins: ApprovedMorphologyJoin[];
  joiningStrategy: string;
  transformations: ApprovedMorphologyTransformation[];
}

export interface ApprovedMorphemeRecord {
  morphemeKey: string;
  kind: string;
  canonicalText: string;
  gloss: string;
  function: string;
  exampleWords: string[];
  variantGroupKey: string | null;
  variantOf: string | null;
}

export interface ApprovedRootArtifactRecord {
  rootArtifactKey: string;
  rootText: string;
  themeKey: string;
  meaning: string;
  originLine: string;
  descendantWords: string[];
  microLore: string;
  variantGroupKey: string | null;
  variantOf: string | null;
}

export interface MorphemeTileViewModel {
  id: string;
  text: string;
  kind: MorphologyPartKind;
  label: string;
  gloss?: string;
  sourceText?: string;
  surfaceText: string;
  morphemeKey?: string;
  displayRange?: ApprovedMorphologyDisplayRange;
  transformationState: MorphologyTileState;
}

export interface MorphemeJoinViewModel {
  id: string;
  afterPartId: string;
  beforePartId: string;
  joinType: MorphologyJoinType;
  surfaceText: string;
  label: string;
  displayRange: ApprovedMorphologyDisplayRange;
}

export interface TransformationViewModel {
  id: string;
  type: MorphologyTransformationType;
  sourcePartId: string;
  sourceText: string;
  surfaceText: string;
  explanation: string;
}

export interface MorphemeSequenceViewModel {
  id: string;
  displayWord: string;
  microSkillKey: string;
  parts: MorphemeTileViewModel[];
  joins: MorphemeJoinViewModel[];
  transformations: TransformationViewModel[];
  joiningStrategy: string;
  sourceExpression: string;
}

export interface WordSplitViewModel {
  id: string;
  displayWord: string;
  parts: MorphemeTileViewModel[];
  joins: MorphemeJoinViewModel[];
}

export interface MeaningFlipViewModel {
  id: string;
  beforeText: string;
  afterText: string;
  beforeCaption: string;
  afterCaption: string;
}

export interface MorphemeGlossCardViewModel {
  id: string;
  text: string;
  kind: MorphologyPartKind;
  label: string;
  meaning: string;
  examples: string[];
  originLabel?: string;
  variantLabel?: string;
}

export interface RootArtifactCardViewModel {
  id: string;
  rootText: string;
  meaning: string;
  originLabel: string;
  descendantWords: string[];
  microLore: string;
  themeKey: string;
}

export interface MorphologyDiffViewModel {
  id: string;
  expectedWord: string;
  attemptedWord: string;
  parts: MorphemeTileViewModel[];
  notes: string[];
}

export interface WordFamilyViewModel {
  id: string;
  anchorWord: string;
  relatedWords: string[];
  label: string;
}

const PART_LABELS: Record<MorphologyPartKind, string> = {
  prefix: "Prefix Scout",
  base: "Base Keeper",
  root: "Root Keeper",
  suffix: "Suffix Shifter",
  connector: "Connector Link",
};

const JOIN_LABELS: Record<MorphologyJoinType, string> = {
  none: "joined with no space",
  space: "space join",
  hyphen: "hyphen join",
};

const TRANSFORMATION_TYPES = new Set<string>([
  "drop_final_e",
  "preserve_base",
  "insert_connector",
  "insert_space",
  "insert_hyphen",
  "root_variant",
  "other_reviewed",
]);

export function isMorphologyPartKind(value: string): value is MorphologyPartKind {
  return value === "prefix" || value === "base" || value === "root" || value === "suffix" || value === "connector";
}

export function isMorphologyJoinType(value: string): value is MorphologyJoinType {
  return value === "none" || value === "space" || value === "hyphen";
}

export function toMorphologySequenceViewModel(record: ApprovedWordAnalysisRecord): MorphemeSequenceViewModel {
  const parts = record.parts.map((part) => toTileViewModel(part, record.transformations));
  const joins = record.joins.map(toJoinViewModel);
  return {
    id: record.analysisKey,
    displayWord: record.displayWord,
    microSkillKey: record.microSkillKey,
    parts,
    joins,
    transformations: record.transformations.map(toTransformationViewModel),
    joiningStrategy: record.joiningStrategy,
    sourceExpression: buildSourceExpression(parts, joins),
  };
}

export function toWordSplitViewModel(record: ApprovedWordAnalysisRecord): WordSplitViewModel {
  const sequence = toMorphologySequenceViewModel(record);
  return {
    id: `${sequence.id}:split`,
    displayWord: sequence.displayWord,
    parts: sequence.parts,
    joins: sequence.joins,
  };
}

export function toMorphemeGlossCardViewModel(record: ApprovedMorphemeRecord): MorphemeGlossCardViewModel {
  if (!isMorphologyPartKind(record.kind)) {
    throw new Error(`Unsupported morpheme kind: ${record.kind}`);
  }
  return {
    id: record.morphemeKey,
    text: record.canonicalText,
    kind: record.kind,
    label: PART_LABELS[record.kind],
    meaning: record.gloss,
    examples: record.exampleWords,
    originLabel: extractOriginLabel(record.gloss),
    variantLabel: record.variantGroupKey ? `Variant family ${record.variantGroupKey}` : undefined,
  };
}

export function toRootArtifactCardViewModel(record: ApprovedRootArtifactRecord): RootArtifactCardViewModel {
  return {
    id: record.rootArtifactKey,
    rootText: record.rootText,
    meaning: record.meaning,
    originLabel: record.originLine,
    descendantWords: record.descendantWords,
    microLore: record.microLore,
    themeKey: record.themeKey,
  };
}

export function toMeaningFlipViewModel(record: ApprovedWordAnalysisRecord): MeaningFlipViewModel {
  const base = record.parts.find((part) => part.kind === "base" || part.kind === "root");
  return {
    id: `${record.analysisKey}:meaning-flip`,
    beforeText: base?.sourceText ?? record.displayWord,
    afterText: record.displayWord,
    beforeCaption: base?.gloss ? `${base.sourceText}: ${base.gloss}` : base?.sourceText ?? "before",
    afterCaption: record.parts
      .map((part) => [part.surfaceText, part.gloss].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" + "),
  };
}

export function toMorphologyDiffViewModel(input: {
  record: ApprovedWordAnalysisRecord;
  attemptedWord: string;
  notes: string[];
}): MorphologyDiffViewModel {
  const sequence = toMorphologySequenceViewModel(input.record);
  return {
    id: `${input.record.analysisKey}:diff`,
    expectedWord: input.record.displayWord,
    attemptedWord: input.attemptedWord,
    parts: sequence.parts,
    notes: input.notes,
  };
}

export function toWordFamilyViewModel(input: {
  morpheme: ApprovedMorphemeRecord;
  anchorWord: string;
}): WordFamilyViewModel {
  return {
    id: `${input.morpheme.morphemeKey}:family`,
    anchorWord: input.anchorWord,
    relatedWords: input.morpheme.exampleWords,
    label: `${input.morpheme.canonicalText} word family`,
  };
}

function toTileViewModel(
  part: ApprovedMorphologyPart,
  transformations: readonly ApprovedMorphologyTransformation[],
): MorphemeTileViewModel {
  if (!isMorphologyPartKind(part.kind)) {
    throw new Error(`Unsupported morphology part kind: ${part.kind}`);
  }
  const transformation = transformations.find((candidate) => candidate.sourcePartId === part.id);
  return {
    id: part.id,
    text: part.surfaceText,
    kind: part.kind,
    label: PART_LABELS[part.kind],
    gloss: part.gloss || undefined,
    sourceText: part.sourceText,
    surfaceText: part.surfaceText,
    morphemeKey: part.morphemeKey ?? undefined,
    displayRange: part.displayRange,
    transformationState: transformation
      ? transformation.sourceText === transformation.surfaceText
        ? "none"
        : "changed"
      : "none",
  };
}

function toJoinViewModel(join: ApprovedMorphologyJoin): MorphemeJoinViewModel {
  if (!isMorphologyJoinType(join.joinType)) {
    throw new Error(`Unsupported morphology join type: ${join.joinType}`);
  }
  return {
    id: `${join.afterPartId}:${join.beforePartId}`,
    afterPartId: join.afterPartId,
    beforePartId: join.beforePartId,
    joinType: join.joinType,
    surfaceText: join.surfaceText,
    label: JOIN_LABELS[join.joinType],
    displayRange: join.displayRange,
  };
}

function toTransformationViewModel(transformation: ApprovedMorphologyTransformation): TransformationViewModel {
  const type = TRANSFORMATION_TYPES.has(transformation.type)
    ? (transformation.type as MorphologyTransformationType)
    : "other_reviewed";
  return {
    id: transformation.transformationKey,
    type,
    sourcePartId: transformation.sourcePartId,
    sourceText: transformation.sourceText,
    surfaceText: transformation.surfaceText,
    explanation: transformation.explanation,
  };
}

function buildSourceExpression(
  parts: readonly MorphemeTileViewModel[],
  joins: readonly MorphemeJoinViewModel[],
): string {
  return parts
    .map((part, index) => {
      const join = joins.find((candidate) => candidate.afterPartId === part.id);
      const separator = index === parts.length - 1 ? "" : join?.joinType === "none" ? " + " : ` ${join?.surfaceText} `;
      return `${part.sourceText ?? part.text}${separator}`;
    })
    .join("")
    .trim();
}

function extractOriginLabel(gloss: string): string | undefined {
  if (gloss.includes("Greek")) {
    return "Greek root";
  }
  if (gloss.includes("Latin")) {
    return "Latin root";
  }
  return undefined;
}
