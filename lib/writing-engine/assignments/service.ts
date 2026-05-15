import type {
  AssignmentItemCandidate,
  WritingEngineAssignmentItemStatus,
  WritingEngineStage1d1CandidateResult,
} from "../types";

export type WritingEngineAssignmentItemRepository = {
  hasMatchingItem(input: {
    dailyAssignmentId: string;
    parentUserId: string;
    candidate: AssignmentItemCandidate;
  }): Promise<boolean>;
  getNextPosition(input: {
    dailyAssignmentId: string;
    parentUserId: string;
  }): Promise<number>;
  appendItem(input: {
    dailyAssignmentId: string;
    childId: string;
    parentUserId: string;
    candidate: AssignmentItemCandidate;
    position: number;
    status: WritingEngineAssignmentItemStatus;
  }): Promise<{ id: string; position: number }>;
};

function readStage1d2OrderingValue(value: string | null | undefined) {
  return value ?? "";
}

function compareStage1d2Candidates(
  left: AssignmentItemCandidate,
  right: AssignmentItemCandidate,
) {
  const comparisons = [
    readStage1d2OrderingValue(left.learningItemId).localeCompare(
      readStage1d2OrderingValue(right.learningItemId),
    ),
    readStage1d2OrderingValue(left.targetWord).localeCompare(
      readStage1d2OrderingValue(right.targetWord),
    ),
    readStage1d2OrderingValue(left.templateKey).localeCompare(
      readStage1d2OrderingValue(right.templateKey),
    ),
    left.sourceRef.sourceEntityId.localeCompare(right.sourceRef.sourceEntityId),
    left.itemType.localeCompare(right.itemType),
  ];

  return comparisons.find((value) => value !== 0) ?? 0;
}

export function selectStage1d2OrderedCandidates(
  results: WritingEngineStage1d1CandidateResult[],
) {
  return results
    .flatMap((result) => (result.status === "candidate" ? [result.candidate] : []))
    .sort(compareStage1d2Candidates);
}

export async function assignmentItemExistsInDailyAssignment(input: {
  dailyAssignmentId: string;
  parentUserId: string;
  candidate: AssignmentItemCandidate;
  repository: WritingEngineAssignmentItemRepository;
}) {
  return input.repository.hasMatchingItem({
    dailyAssignmentId: input.dailyAssignmentId,
    parentUserId: input.parentUserId,
    candidate: input.candidate,
  });
}

export async function appendStage1d2AssignmentItemsToDailyAssignment(input: {
  dailyAssignmentId: string;
  childId: string;
  parentUserId: string;
  results: WritingEngineStage1d1CandidateResult[];
  repository: WritingEngineAssignmentItemRepository;
}) {
  const appendedItems: Array<{ id: string; position: number }> = [];

  for (const candidate of selectStage1d2OrderedCandidates(input.results)) {
    const alreadyExists = await assignmentItemExistsInDailyAssignment({
      dailyAssignmentId: input.dailyAssignmentId,
      parentUserId: input.parentUserId,
      candidate,
      repository: input.repository,
    });

    if (alreadyExists) {
      continue;
    }

    const appendedItem = await appendAssignmentItemToDailyAssignment({
      dailyAssignmentId: input.dailyAssignmentId,
      childId: input.childId,
      parentUserId: input.parentUserId,
      candidate,
      repository: input.repository,
    });

    appendedItems.push(appendedItem);
  }

  return appendedItems;
}

export async function appendAssignmentItemToDailyAssignment(input: {
  dailyAssignmentId: string;
  childId: string;
  parentUserId: string;
  candidate: AssignmentItemCandidate;
  repository: WritingEngineAssignmentItemRepository;
}) {
  const position = await input.repository.getNextPosition({
    dailyAssignmentId: input.dailyAssignmentId,
    parentUserId: input.parentUserId,
  });

  return input.repository.appendItem({
    dailyAssignmentId: input.dailyAssignmentId,
    childId: input.childId,
    parentUserId: input.parentUserId,
    candidate: input.candidate,
    position,
    status: input.candidate.status ?? "ready",
  });
}
