"use client";

import { useEffect } from "react";
import { clearMorphologyResume, morphologyResumeKey } from "@/lib/adle/morphology/resume";
import { closedCompoundResumeKey } from "@/lib/adle/morphology/closed-compound-resume";

export function ClearCompletedMorphologyResume(props: { assignmentId: string; contentVersion: string }) {
  useEffect(() => {
    clearMorphologyResume(morphologyResumeKey(props.assignmentId, props.contentVersion));
    clearMorphologyResume(closedCompoundResumeKey(props.assignmentId, props.contentVersion));
  }, [props.assignmentId, props.contentVersion]);
  return null;
}
