import {
  buildScopedPath,
  normaliseAppMode,
  type AppMode,
} from "../children";

type ChildOwnershipRow = {
  id: string;
};

export type WritingSampleInsertRecord = {
  child_id: string;
  parent_user_id: string;
  title: string;
  sample_text: string;
  source: string;
  written_at: string;
  task_submission_id: null;
};

export type InsertedWritingSample = {
  id: string;
  child_id: string;
  sample_text: string;
};

export type SaveManualWritingSampleIntakeDeps<TClient> = {
  createClient: () => Promise<TClient>;
  getSignedInParentUserId: (client: TClient) => Promise<string | null>;
  getActiveChildrenForUser: (
    client: TClient,
    parentUserId: string,
  ) => Promise<ChildOwnershipRow[]>;
  insertWritingSample: (
    client: TClient,
    record: WritingSampleInsertRecord,
  ) => Promise<{
    data: InsertedWritingSample | null;
    error: unknown;
  }>;
  replaceAnalysisForSample: (
    client: TClient,
    sample: InsertedWritingSample,
    parentUserId: string,
  ) => Promise<{ error: unknown }>;
  getTodayDateOnly?: () => string;
};

export function buildRedirectWithMessage(
  path: string,
  key: "saved" | "error",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function defaultTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function buildPaths(childId: string | null, mode: AppMode) {
  return {
    reviewWorkPath: buildScopedPath("/courses/review", childId, mode),
    intakePath: buildScopedPath("/analyse", childId, mode),
  };
}

export async function saveManualWritingSampleIntake<TClient>(
  formData: FormData,
  deps: SaveManualWritingSampleIntakeDeps<TClient>,
) {
  const rawMode =
    typeof formData.get("mode") === "string"
      ? formData.get("mode")?.toString().trim()
      : "parent";
  const childId =
    typeof formData.get("child_id") === "string"
      ? formData.get("child_id")?.toString().trim()
      : "";
  const mode = normaliseAppMode(rawMode);
  const sampleText =
    typeof formData.get("sample_text") === "string"
      ? formData.get("sample_text")?.toString().trim()
      : "";

  const { reviewWorkPath, intakePath } = buildPaths(childId || null, mode);

  if (mode !== "parent") {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "Writing samples can only be added from parent mode.",
    );
  }

  if (!childId) {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "Choose a child before adding a writing sample.",
    );
  }

  if (!sampleText) {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "Paste some writing before saving.",
    );
  }

  const client = await deps.createClient();
  const parentUserId = await deps.getSignedInParentUserId(client);

  if (!parentUserId) {
    return "/login";
  }

  const children = await deps.getActiveChildrenForUser(client, parentUserId);
  const ownsChild = children.some((child) => child.id === childId);

  if (!ownsChild) {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "We couldn't find that child.",
    );
  }

  const { data: insertedSample, error: sampleError } =
    await deps.insertWritingSample(client, {
      child_id: childId,
      parent_user_id: parentUserId,
      title: "Manual writing sample",
      sample_text: sampleText,
      source: "Add Writing Sample",
      written_at: (deps.getTodayDateOnly ?? defaultTodayDateOnly)(),
      task_submission_id: null,
    });

  if (sampleError || !insertedSample) {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "We couldn't save that writing sample just yet.",
    );
  }

  const analysisResult = await deps.replaceAnalysisForSample(
    client,
    insertedSample,
    parentUserId,
  );

  if (analysisResult.error) {
    return buildRedirectWithMessage(
      intakePath,
      "error",
      "Your writing sample was saved, but the first analysis could not run yet.",
    );
  }

  return buildRedirectWithMessage(
    reviewWorkPath,
    "saved",
    "Writing sample saved. Review Work is ready when you are.",
  );
}
