import {
  compoundWordJoinSeparator,
  reconstructCompoundWordV2,
  type CompoundWordJoinKind,
  type CompoundWordStructureV2,
} from "./compound-word-structure-v2";
import {
  EXACT_GOVERNED_FORM_ANSWER_POLICY,
  type ExactGovernedFormAnswerPolicy,
} from "../answer-policy";
import type { DictationTargetSpanV2 } from "./dictation-target-span";

export type CompoundWordTaskConfigurationV2 = {
  split: {
    mode: "governed_component_boundaries";
    word: string;
    components: readonly string[];
    joins: readonly CompoundWordJoinKind[];
    splitPoints: readonly number[];
  };
  jigsaw: {
    mode: "ordered_components";
    components: readonly string[];
    joins: readonly CompoundWordJoinKind[];
    exactAnswer: string;
  };
  assembly: {
    mode: "ordered_components";
    components: readonly string[];
    joins: readonly CompoundWordJoinKind[];
    exactAnswer: string;
  };
  meaning: {
    mode: "component_to_whole";
    components: readonly { surface: string; meaning: string; sense: string | null }[];
    wholeMeaning: string;
    componentToWholeRelationship: string;
  };
  recall: {
    exactAnswer: string;
    answerPolicy: ExactGovernedFormAnswerPolicy;
  };
  dictation: {
    sentence: string;
    audioText: string;
    targetSpan: DictationTargetSpanV2;
    answerPolicy: ExactGovernedFormAnswerPolicy;
  };
};

export function governedCompoundSplitPoints(
  components: readonly string[],
  joins: readonly CompoundWordJoinKind[],
): number[] | null {
  if (components.length < 2 || joins.length !== components.length - 1) return null;
  let offset = 0;
  return components.slice(0, -1).map((component, index) => {
    offset += component.length;
    const point = offset;
    offset += compoundWordJoinSeparator(joins[index]).length;
    return point;
  });
}

export function compileCompoundWordTaskConfigurationV2(input: {
  structure: CompoundWordStructureV2;
  dictationSentence: string;
  audioText: string;
  dictationTargetSpan: DictationTargetSpanV2;
}): CompoundWordTaskConfigurationV2 | null {
  const components = input.structure.components.map((part) => part.displaySurface);
  const joins = input.structure.joins.map((join) => join.kind);
  const exactAnswer = reconstructCompoundWordV2(input.structure.components, input.structure.joins);
  const splitPoints = governedCompoundSplitPoints(components, joins);
  if (!exactAnswer || exactAnswer !== input.structure.wholeWord || !splitPoints) return null;
  return {
    split: {
      mode: "governed_component_boundaries",
      word: exactAnswer,
      components,
      joins,
      splitPoints,
    },
    jigsaw: { mode: "ordered_components", components, joins, exactAnswer },
    assembly: { mode: "ordered_components", components, joins, exactAnswer },
    meaning: {
      mode: "component_to_whole",
      components: input.structure.components.map((part) => ({
        surface: part.displaySurface,
        meaning: part.meaning,
        sense: part.sense,
      })),
      wholeMeaning: input.structure.childFriendlyMeaning,
      componentToWholeRelationship: input.structure.componentToWholeRelationship,
    },
    recall: {
      exactAnswer,
      answerPolicy: EXACT_GOVERNED_FORM_ANSWER_POLICY,
    },
    dictation: {
      sentence: input.dictationSentence,
      audioText: input.audioText,
      targetSpan: input.dictationTargetSpan,
      answerPolicy: EXACT_GOVERNED_FORM_ANSWER_POLICY,
    },
  };
}
