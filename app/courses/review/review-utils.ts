export function parseSubmissionReview(submissionText: string) {
  const normalised = submissionText.replace(/\r\n/g, "\n").trim();

  if (
    !normalised.includes("Selected options:") &&
    !normalised.includes("Written response:") &&
    !normalised.includes("Lesson review summary:")
  ) {
    return {
      selectedOptions: [] as string[],
      lessonReviewSummary: [] as string[],
      writtenResponse: normalised,
    };
  }

  const lines = normalised.split("\n");
  const selectedOptions: string[] = [];
  const lessonReviewSummary: string[] = [];
  const writtenLines: string[] = [];
  let mode: "choices" | "lesson_review" | "writing" | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (trimmed === "Selected options:") {
      mode = "choices";
      return;
    }

    if (trimmed === "Lesson review summary:") {
      mode = "lesson_review";
      return;
    }

    if (trimmed === "Written response:") {
      mode = "writing";
      return;
    }

    if (mode === "choices" && trimmed.startsWith("- ")) {
      selectedOptions.push(trimmed.slice(2).trim());
      return;
    }

    if (mode === "lesson_review") {
      lessonReviewSummary.push(trimmed);
      return;
    }

    if (mode === "writing") {
      writtenLines.push(trimmed);
      return;
    }

    if (mode === null) {
      writtenLines.push(trimmed);
    }
  });

  return {
    selectedOptions,
    lessonReviewSummary,
    writtenResponse: writtenLines.join("\n\n").trim(),
  };
}

export function normaliseWordForLookup(word: string) {
  return word.trim().toLowerCase();
}

export function getSubmissionStatusLabel(
  status: "pending" | "approved" | "returned",
): { label: "Approved" | "Sent back" | "Pending"; tone: string } {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "returned":
      return {
        label: "Sent back",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      };
    default:
      return {
        label: "Pending",
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
}
