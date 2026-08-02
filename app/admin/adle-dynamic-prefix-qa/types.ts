export type DynamicPrefixQaActionResult = {
  profileKey: string;
  label: string;
  planDate: string;
  status: "created" | "existing" | "conflict" | "not_ready";
  itemCount: number;
  lessonUrl: string | null;
  message: string;
};

export type DynamicPrefixQaActionState = {
  message: string | null;
  results: DynamicPrefixQaActionResult[];
};

export const INITIAL_DYNAMIC_PREFIX_QA_ACTION_STATE: DynamicPrefixQaActionState = {
  message: null,
  results: [],
};
