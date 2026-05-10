type DraftFieldMeta = {
  label?: string;
  type?: string;
  excludeFromSpelling?: boolean;
};

type DraftPayloadWithMeta = Record<string, unknown> & {
  __field_meta?: Record<string, DraftFieldMeta>;
};

const EXCLUDED_KEY_PATTERN =
  /(prompt|report|paste|copied|copy|previous-task-link|portrait|upload|print|download)/i;
const EXCLUDED_LABEL_PATTERN =
  /(ai|prompt|report|paste|copy|download|print|open my earlier work|portrait)/i;
const EXCLUDED_TYPE_PATTERN = /^(radio|checkbox|select-one|select-multiple|file)$/i;

function wordCount(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normaliseValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function shouldExcludeField(key: string, meta?: DraftFieldMeta) {
  if (typeof meta?.excludeFromSpelling === "boolean") {
    return meta.excludeFromSpelling;
  }

  if (EXCLUDED_KEY_PATTERN.test(key)) {
    return true;
  }

  if (meta?.label && EXCLUDED_LABEL_PATTERN.test(meta.label)) {
    return true;
  }

  if (meta?.type && EXCLUDED_TYPE_PATTERN.test(meta.type)) {
    return true;
  }

  return false;
}

export function extractSpellcheckTextFromDraftPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const draftPayload = payload as DraftPayloadWithMeta;
  const metaMap = draftPayload.__field_meta ?? {};
  const parts: string[] = [];

  Object.entries(draftPayload).forEach(([key, rawValue]) => {
    if (key === "__field_meta") {
      return;
    }

    const value = normaliseValue(rawValue);
    if (!value) {
      return;
    }

    if (shouldExcludeField(key, metaMap[key])) {
      return;
    }

    if (wordCount(value) === 0) {
      return;
    }

    parts.push(value);
  });

  return parts.join("\n\n").trim();
}

export function stripNonSpellingSections(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const sections = trimmed
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  const kept = sections.filter((section) => {
    const firstLine = section.split("\n")[0]?.trim() ?? "";

    if (!firstLine) {
      return false;
    }

    const labelMatch = /^([^:]{1,120}):\s*([\s\S]*)$/.exec(firstLine);
    const label = labelMatch?.[1]?.trim() ?? "";

    if (label && EXCLUDED_LABEL_PATTERN.test(label)) {
      return false;
    }

    if (label && EXCLUDED_KEY_PATTERN.test(label)) {
      return false;
    }

    return true;
  });

  return kept.join("\n\n").trim();
}

export function buildSpellcheckSourceText(options: {
  draftPayload?: unknown;
  submissionText?: string;
}) {
  const fromPayload = extractSpellcheckTextFromDraftPayload(options.draftPayload);
  if (fromPayload) {
    return fromPayload;
  }

  const fromSubmissionText = stripNonSpellingSections(options.submissionText ?? "");
  return fromSubmissionText.trim();
}
