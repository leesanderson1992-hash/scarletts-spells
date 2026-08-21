"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { WordLabScene } from "@/components/adle/morphology/word-lab-scene";
import { TeachingPages, type TeachingPagesConfig } from "./teaching-pages";

export type FirstImpressionFixedStage = "teaching" | "cover" | "dictation" | "reflection";
export type FirstImpressionStageId = FirstImpressionFixedStage | `activity:${string}`;

export interface FirstImpressionActivityNavigation {
  complete: () => void;
  rereadTeaching: () => void;
}

export interface FirstImpressionConfiguredActivity {
  id: string;
  type: string;
  label: string;
  render: (navigation: FirstImpressionActivityNavigation) => ReactNode;
}

export interface FirstImpressionSceneConfig {
  beat: GuideBeatV1;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  silent?: boolean;
  help?: string;
  onHelp?: () => void;
  guideName?: string;
}

export function FirstImpressionLesson(props: {
  teaching: TeachingPagesConfig;
  activities: readonly FirstImpressionConfiguredActivity[];
  initialStageId: FirstImpressionStageId;
  initialTeachingPageIndex?: number;
  onStageChange: (stageId: FirstImpressionStageId) => void;
  onTeachingPageChange?: (pageIndex: number) => void;
  renderCover: (navigation: FirstImpressionActivityNavigation) => ReactNode;
  renderDictation: (navigation: FirstImpressionActivityNavigation) => ReactNode;
  renderReflection: (navigation: FirstImpressionActivityNavigation) => ReactNode;
  scene: FirstImpressionSceneConfig;
}) {
  const onStageChange = props.onStageChange;
  const [stageId, setStageId] = useState<FirstImpressionStageId>(props.initialStageId);
  const [returnStageId, setReturnStageId] = useState<FirstImpressionStageId | null>(null);
  const sequence = useMemo<FirstImpressionStageId[]>(() => [
    "teaching",
    ...props.activities.map((activity) => `activity:${activity.id}` as const),
    "cover",
    "dictation",
    "reflection",
  ], [props.activities]);
  const stageIndex = Math.max(0, sequence.indexOf(stageId));
  const phases = useMemo(() => ["Learn", ...props.activities.map((activity) => activity.label), "Cover", "Dictate", "Reflect"], [props.activities]);
  const phaseCues = useMemo(() => ["Read the teaching pages", ...props.activities.map((activity) => activity.label), "Study, cover, spell, compare", "Write the authored sentence", "Think about today’s learning"], [props.activities]);

  const go = useCallback((nextStageId: FirstImpressionStageId) => {
    setStageId(nextStageId);
    onStageChange(nextStageId);
  }, [onStageChange]);

  const completeStage = useCallback(() => {
    const currentIndex = sequence.indexOf(stageId);
    const next = sequence[Math.min(currentIndex + 1, sequence.length - 1)] ?? "reflection";
    if (next !== stageId) go(next);
  }, [go, sequence, stageId]);

  const rereadTeaching = useCallback(() => {
    if (stageId === "teaching") return;
    setReturnStageId(stageId);
    setStageId("teaching");
  }, [stageId]);

  const navigation = useMemo<FirstImpressionActivityNavigation>(() => ({ complete: completeStage, rereadTeaching }), [completeStage, rereadTeaching]);
  const activity = stageId.startsWith("activity:")
    ? props.activities.find((candidate) => `activity:${candidate.id}` === stageId)
    : undefined;
  const content = stageId === "teaching" ? (
    <TeachingPages
      config={props.teaching}
      initialPageIndex={props.initialTeachingPageIndex}
      onPageChange={props.onTeachingPageChange}
      completionLabel={returnStageId ? "Return to the activity" : undefined}
      onComplete={() => {
        if (returnStageId) {
          const destination = returnStageId;
          setReturnStageId(null);
          setStageId(destination);
          return;
        }
        completeStage();
      }}
    />
  ) : activity ? activity.render(navigation)
    : stageId === "cover" ? props.renderCover(navigation)
      : stageId === "dictation" ? props.renderDictation(navigation)
        : props.renderReflection(navigation);

  return (
    <WordLabScene
      beat={props.scene.beat}
      phase={stageIndex}
      muted={props.scene.muted}
      onMutedChange={props.scene.onMutedChange}
      silent={props.scene.silent}
      help={props.scene.help}
      onHelp={props.scene.onHelp}
      guideName={props.scene.guideName}
      phases={phases}
      phaseCues={phaseCues}
      toolbar={stageId === "teaching" ? null : (
        <button type="button" onClick={rereadTeaching} className="min-h-11 rounded-full border border-cyan-100/30 bg-slate-950/60 px-4 text-sm font-bold text-cyan-50">
          Reread lesson pages
        </button>
      )}
    >
      {content}
    </WordLabScene>
  );
}
