"use client";

import { useEffect } from "react";
import { clearMorphologyResume, morphologyResumeKey } from "@/lib/adle/morphology/resume";

export function ClearCompletedMorphologyResume(props: { assignmentId: string; contentVersion: string }) {
  useEffect(() => {
    clearMorphologyResume(morphologyResumeKey(props.assignmentId, props.contentVersion));
  }, [props.assignmentId, props.contentVersion]);
  return null;
}
