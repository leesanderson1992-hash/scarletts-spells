import type { WritingIssueRow } from "../../writing-practice/types";

export type WritingIssueRepository = {
  insert(
    record: Omit<WritingIssueRow, "id" | "created_at" | "updated_at">,
  ): Promise<WritingIssueRow>;
};
