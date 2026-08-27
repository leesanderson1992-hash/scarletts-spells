import { compileGenericLessonSnapshotV3 } from "./generic-snapshot-v3-compiler";
import type { GenericSnapshotCompileInputV3 } from "./generic-snapshot-v3-contracts";
import {
  persistGuardedGenericSnapshotV3,
  type GenericSnapshotJsonPersistencePort,
} from "./generic-snapshot-v3-persistence";

export async function compileAndPersistGuardedGenericSnapshotV3(input: {
  compiler: GenericSnapshotCompileInputV3;
  port: GenericSnapshotJsonPersistencePort;
}): Promise<{ assignmentId: string; sourceFingerprint: string }> {
  if (input.compiler.plan.childId !== input.compiler.persistence.header.childId
    || input.compiler.facts.childId !== input.compiler.persistence.header.childId) {
    throw new Error("compileAndPersistGuardedGenericSnapshotV3: assignment identity mismatch");
  }
  const compiled = compileGenericLessonSnapshotV3(input.compiler);
  if (!compiled.ok) {
    throw new Error(`compileAndPersistGuardedGenericSnapshotV3:compile:${compiled.blockers.map((entry) => entry.code).join(",")}`);
  }
  const persisted = await persistGuardedGenericSnapshotV3(input.port, {
    parentUserId: input.compiler.persistence.header.parentUserId,
    childId: input.compiler.persistence.header.childId,
    planDate: input.compiler.plan.planDate,
    header: input.compiler.persistence.header,
    items: input.compiler.persistence.items,
    intakes: input.compiler.persistence.learningItemIntakes,
    snapshot: compiled.snapshot,
  });
  return {
    assignmentId: persisted.assignmentId,
    sourceFingerprint: persisted.validation.snapshot.provenance.sourceFingerprint,
  };
}
