/* eslint-disable @typescript-eslint/no-explicit-any -- read-only projection of actual compiled route content */
import {
  LESSON_ACTIVITY_COPY as copy,
  definitionBuildQuestion,
  discoveryQuestion,
  ingChangeQuestion,
} from "@/lib/adle/lesson-activity-copy";
import type { RouteContentDraft } from "./contracts";
function text(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n");
  if (value && typeof value === "object")
    return text([
      value.title,
      value.promptText ?? value.prompt,
      value.paragraphs,
      value.focus,
    ]);
  return "";
}
export function lessonActivityQuestion(input: {
  kind: string;
  route: RouteContentDraft;
  word: string;
  wordId: string | null;
  compiled: unknown;
  sources: unknown[];
}): string {
  const { kind, route, word } = input;
  const compiled = input.compiled as any;
  const lesson = compiled?.payload?.resolvedLesson ?? compiled;
  const native = lesson?.lesson ?? lesson;
  if (kind === "introduction")
    return (
      text(
        lesson?.activities?.introduction ??
          native?.teachingIntro ??
          lesson?.teaching?.pages,
      ) ||
      text(
        (input.sources as any[]).find(
          (s) => s.authorityType === "teaching_content",
        )?.content?.warmIntroduction,
      ) ||
      "Complete the lesson checks to view its compiled introduction."
    );
  if (kind === "reflection")
    return (
      text(lesson?.activities?.reflection ?? lesson?.reflectionPrompt) ||
      text(
        compiled?.activities?.find(
          (a: any) => a.canonical?.concept === "LESSON_REFLECTION",
        )?.payload?.prompt,
      ) ||
      "Complete the lesson checks to view its compiled reflection."
    );
  if (kind === "cleaver") {
    if (route.routeId === "ing_endings_word_lab")
      return ingChangeQuestion(String(route.content.base ?? "the base"), word);
    if (route.routeId === "comparative_superlative_word_lab")
      return (
        text(
          lesson?.cleaverTasks?.find(
            (t: any) => t.target.canonicalWordId === input.wordId,
          )?.question,
        ) ||
        text(lesson?.cleaverTasks?.[0]?.question) ||
        "Complete the family checks to view its compiled question."
      );
    return route.routeId === "dynamic_affix_word_lab"
      ? copy.suffixCleaver
      : route.routeId === "base_word_lab"
        ? copy.baseCleaver
        : copy.boundaryCleaver;
  }
  if (kind === "discovery") return discoveryQuestion(word);
  if (
    kind === "word_build" &&
    ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(
      route.routeId,
    )
  )
    return definitionBuildQuestion(route.wordMeaning);
  if (kind === "meaning_sort") {
    if (route.routeId === "homophone_word_lab")
      return text(
        native?.binSort
          ?.filter((p: any) => p.answer === word)
          .map((p: any) => p.sentence),
      );
    return route.routeId === "dynamic_affix_word_lab"
      ? copy.suffixMeaning
      : route.routeId === "dynamic_prefix_word_lab"
        ? copy.prefixMeaning
        : "Put each word into the right comparison bucket.";
  }
  if (kind === "dictation")
    return route.routeId === "homophone_word_lab"
      ? copy.passageDictation
      : route.routeId === "comparative_superlative_word_lab"
        ? copy.pairedDictation
        : route.routeId === "ing_endings_word_lab"
          ? copy.actionDictation
          : copy.sentenceDictation;
  // The compiled data below is the question source for route-specific activities.
  const activity = compiled?.activities?.find(
    (a: any) => a.activityId === kind || a.type === kind,
  );
  return (
    text(activity?.payload ?? activity) ||
    (kind === "family_reveal"
      ? `Base word: ${route.content.baseWord ?? ""}. ${route.content.baseMeaning ?? ""}`
      : kind === "meaning_match"
        ? route.wordMeaning
        : kind === "cover_check"
          ? word
          : kind === "compound_jigsaw"
            ? String(route.content.componentToWholeRelationship ?? "")
            : "Complete the lesson checks to view the compiled activity.")
  );
}
