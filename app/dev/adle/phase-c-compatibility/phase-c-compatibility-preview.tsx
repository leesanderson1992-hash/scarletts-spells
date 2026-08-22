"use client";

import { useState } from "react";

import { CanonicalActivityHost, CanonicalActivityNormalizationBlockedState } from "@/components/adle/activities/canonical-renderer-registry";
import { normalizeGenericActivity } from "@/lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";

function fixture(id: string, sectionKey: string, templateKey: string, promptData: Record<string, unknown> = {}): AdleSessionItem {
  return { id, sourceEntityId: id, sectionKey, templateKey, position: 0, status: "pending", targetWord: "helpful", canonicalWordId: "word-helpful", microSkillKey: null, adleLearningItemRef: null, promptData };
}

export function PhaseCCompatibilityPreview() {
  const [cue, setCue] = useState("");
  const [review, setReview] = useState("");
  const [locked, setLocked] = useState(false);
  const memory = normalizeGenericActivity(fixture("memory", "guided_practice", "MEMORY_CUE", { childFacingCopy: "Make a memory cue for this word." }));
  const historicalReview = normalizeGenericActivity(fixture("review", "review_production", ""));
  const unavailableRich = normalizeGenericActivity(fixture("rich", "guided_practice", "PG_GRAPHEME_MAP"));
  const malformedDictation = normalizeGenericActivity(fixture("dictation", "lesson_dictation", "DICTATION_NO_IMAGE"));

  return <div className="grid gap-6">
    <section aria-label="Supported historical activities" className="grid gap-4">
      {memory.status !== "blocked" ? <CanonicalActivityHost spec={memory.spec} runtimeProps={{ value: cue, onChange: setCue }} /> : null}
      {historicalReview.status !== "blocked" ? <CanonicalActivityHost spec={historicalReview.spec} runtimeProps={{ mode: "scheduled_review", value: review, locked, label: "Historical review word", onValueChange: setReview, onLock: () => setLocked(true) }} /> : null}
    </section>
    <section aria-label="Fail closed activities" className="grid gap-4">
      {unavailableRich.status === "blocked" ? <CanonicalActivityNormalizationBlockedState blocker={unavailableRich.blocker} /> : null}
      {malformedDictation.status === "blocked" ? <CanonicalActivityNormalizationBlockedState blocker={malformedDictation.blocker} /> : null}
    </section>
  </div>;
}
