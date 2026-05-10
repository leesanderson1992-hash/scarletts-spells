import type { CourseModuleRow } from "./types";

export const TIMED_PHASE_BACKING_MODULE_MARKER = "__timed_phase_backing__";
export const TIMED_PHASE_BACKING_MODULE_OPTION_PREFIX = "__timed_phase_backing_option__:";

export function buildTimedPhaseBackingModuleDescription(phaseId: string) {
  return `${TIMED_PHASE_BACKING_MODULE_MARKER}:${phaseId}`;
}

export function buildTimedPhaseBackingModuleTitle(phaseTitle: string) {
  return `Phase task container — ${phaseTitle}`;
}

export function isTimedPhaseBackingModule(
  module: Pick<CourseModuleRow, "description"> | null | undefined,
) {
  if (!module?.description) {
    return false;
  }

  return module.description.startsWith(`${TIMED_PHASE_BACKING_MODULE_MARKER}:`);
}

export function buildTimedPhaseBackingModuleOptionValue(phaseId: string) {
  return `${TIMED_PHASE_BACKING_MODULE_OPTION_PREFIX}${phaseId}`;
}

export function isTimedPhaseBackingModuleOptionValue(value: string | null | undefined) {
  return Boolean(value?.startsWith(TIMED_PHASE_BACKING_MODULE_OPTION_PREFIX));
}

export function getTimedPhaseBackingModuleOptionPhaseId(value: string | null | undefined) {
  if (!isTimedPhaseBackingModuleOptionValue(value)) {
    return null;
  }

  return value?.slice(TIMED_PHASE_BACKING_MODULE_OPTION_PREFIX.length) || null;
}

export function getTimedPhaseBackingModulePhaseId(
  module: Pick<CourseModuleRow, "description"> | null | undefined,
) {
  if (!isTimedPhaseBackingModule(module)) {
    return null;
  }

  return module?.description?.slice(`${TIMED_PHASE_BACKING_MODULE_MARKER}:`.length) ?? null;
}
