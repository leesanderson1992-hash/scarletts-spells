export function isFullDocumentHtml(contentHtml: string | null | undefined) {
  if (!contentHtml) return false;

  return /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(contentHtml);
}

export function getInlineLessonPreviewHtml(contentHtml: string | null | undefined) {
  if (!contentHtml) return null;

  let previewHtml = contentHtml;
  const bodyMatch = previewHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (bodyMatch?.[1]) {
    previewHtml = bodyMatch[1];
  }

  previewHtml = previewHtml
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/<title\b[^<]*(?:(?!<\/title>)<[^<]*)*<\/title>/gi, "")
    .trim();

  return previewHtml || null;
}
