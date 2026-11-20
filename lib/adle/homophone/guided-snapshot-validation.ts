import {validateConvergencePreview} from "./convergence-preview-validation";
import {homophoneActivities, validateHomophoneLessonSnapshot, type HomophoneLessonSnapshotV1} from "./lesson";
import {semanticJson} from "../inflection/semantic-json";

/** Contextual snapshots are validated against their published release on the
 * server. Their guided sequence has a different contract from retained v2. */
export function guidedSnapshotIssues(snapshot: HomophoneLessonSnapshotV1, contextualRelease = false, developmentPreview = false) {
  if (!contextualRelease && !developmentPreview) return validateHomophoneLessonSnapshot(snapshot);
  const issues = validateConvergencePreview(snapshot);
  if (semanticJson(snapshot.activities) !== semanticJson(homophoneActivities(snapshot.lesson)))
    issues.push("activity_contract_mismatch");
  return issues;
}
